## Objetivo

Reformular o sistema de Auto-Post IA para garantir imagens corretas, relevantes e nunca vazias, melhorar visualmente os reviews, e adicionar a nova categoria **CurioGame**.

---

## 1. Banco de Dados

- Adicionar valor `'curiogame'` ao enum `content_type`.
- Migração compatível com dados existentes (sem afetar `news`, `review`, `trailer`, `other`).

## 2. Edge Function `ai-auto-post` (reescrita do pipeline de imagens)

### 2.1 Detecção de tópico
- Nova função `extractTopicEntity(item)`: usa Gemini (`google/gemini-3-flash-preview`) para extrair de cada artigo:
  - `gameTitle`, `franchise`, `platform`, `studio`, `characters[]`, `genre`, `keywords[]`.
- Resultado guardado por item e reutilizado em prompts de imagens.

### 2.2 Busca multi-fonte de imagens (não depende mais só da fonte)
Ordem de busca (para no primeiro batch válido):
1. Imagens já extraídas da fonte (pipeline atual).
2. **Firecrawl search** com queries específicas — uma por entidade:
   - `"<gameTitle>" official key art`
   - `"<gameTitle>" screenshot gameplay`
   - `"<gameTitle>" press kit`
   - Filtrando por domínios oficiais e confiáveis: `store.steampowered.com`, `blog.playstation.com`, `news.xbox.com`, `nintendo.com`, `epicgames.com`, `ign.com/images`, `gamespot.com/images`, `media.rawg.io`, `wikipedia.org`.
3. **RAWG API** (sem chave, endpoint público de screenshots) como fallback estável para screenshots oficiais.
4. **Lovable AI image generation** (`google/gemini-3.1-flash-image-preview`) como último recurso — gera uma key-art temática (sem rostos de personagens reais) e faz upload para o bucket `uploads`.

### 2.3 Validação de relevância
Antes de aceitar uma imagem candidata:
- Dimensões mínimas via HEAD + parser (descarta < 600×400).
- URL não pode conter padrões de logo / banner / ad (regras atuais mantidas).
- Token-match contra entidades extraídas (nome do jogo, franquia, personagens) — não apenas o título.
- Validação semântica leve via Gemini Vision (`google/gemini-2.5-flash`) com prompt: *"Esta imagem corresponde ao jogo X? Responda apenas SIM/NÃO."* — feita só para a capa e quando há dúvida (custo controlado).

### 2.4 Anti-duplicação visual
- Conjunto local por artigo + conjunto global por execução para nunca repetir a mesma URL.
- A capa nunca é reutilizada dentro do corpo.

### 2.5 Reviews com imagens por seção
Reescrita de `buildReviewContent` para que cada seção (Introdução, Atmosfera, História, Combate, Gráficos, Conclusão) receba uma imagem **contextual**:
- Para cada seção, query dedicada (`"<game>" combat`, `"<game>" environment`, `"<game>" cutscene`, `"<game>" screenshot 4k`).
- Se a busca falhar, usa próxima imagem da galeria geral ranqueada por relevância.
- Garantido: 6 imagens distintas no review (capa + 5 internas).

### 2.6 Verificação final pré-publicação
Função `validateArticleImages(article)`:
- Confere capa existente e acessível (HEAD 200).
- Confere que toda `<img>` no HTML carrega.
- Se algo falhar, tenta repor pela pool restante; se zerar, dispara geração via AI.
- Se mesmo assim não tiver capa, **bloqueia a publicação** e loga no `ai_post_logs` com status `no_image`.

## 3. Nova categoria CurioGame

### 3.1 Pipeline
- Novo branch no edge function quando `contentTypes` inclui `curiogame`:
  - Não depende de scraping de notícias do dia. Em vez disso, gera **pauta** via Gemini com prompt dedicado: curiosidades, easter eggs, polêmicas, bugs lendários, jogos cancelados, etc.
  - Lista de tópicos rotativos para evitar repetir tema. Verifica `ai_post_logs` e títulos recentes com `areLikelyDuplicateTitles`.
  - Busca imagens com o mesmo pipeline (2.2/2.3) usando o jogo/franquia da curiosidade.

### 3.2 Conteúdo
- Novo `buildCurioGameContent`:
  - Tom divertido / misterioso / clickbait controlado.
  - Estrutura: Hook → Contexto histórico → A curiosidade em si → Reações da comunidade → Conclusão divertida.
  - 4–6 imagens contextuais.
  - Tag visual `🎮 CurioGame` no topo.

### 3.3 Frontend
- Nova rota `/curiogame` (listagem) e item no menu do Header.
- Card visual diferenciado (badge "CURIOSIDADE").
- Página individual usa o mesmo `Article.tsx` (apenas filtra por `content_type='curiogame'` na listagem).
- Filtro no Admin → AI auto-post para habilitar CurioGame.

## 4. Admin AI

- No `AdminAI.tsx`, adicionar checkbox **CurioGame** ao seletor de `contentTypes`.
- Atualizar `postsPerType` para também cobrir curiogame.

---

## Detalhes técnicos

- Arquivos editados:
  - `supabase/functions/ai-auto-post/index.ts` (refatoração grande, mantém compat. com cron).
  - Nova migration: `ALTER TYPE content_type ADD VALUE 'curiogame';`.
  - `src/App.tsx`: rota `/curiogame`.
  - `src/pages/CurioGame.tsx`: nova página (copia padrão de `News.tsx`).
  - `src/components/layout/Header.tsx`: novo link de menu.
  - `src/components/admin/AdminAI.tsx`: opção CurioGame.
  - `public/llms.txt` / sitemap: incluir `/curiogame`.

- Geração de imagem usa endpoint `https://ai.gateway.lovable.dev/v1/chat/completions` com `modalities: ["image","text"]` e upload do `data:image/png;base64,...` para o bucket `uploads` via service role.

- Custos controlados:
  - Vision validation só na capa (1 chamada por artigo).
  - Geração de imagem só quando todas as buscas falharem.

## Riscos / notas

- A validação por Gemini Vision adiciona ~1 chamada extra por artigo. Aceitável para a meta de zero posts sem imagem correta.
- A migration do enum é irreversível (Postgres não remove valores de enum facilmente). Confirma antes de aplicar.
