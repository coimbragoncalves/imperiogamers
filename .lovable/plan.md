## Objetivo

Refatorar **apenas o sistema de imagens** do edge function `ai-auto-post` (sem mexer em conteúdo/CurioGame/Reviews já existentes além da camada visual) para garantir que:

- Nenhum post seja publicado sem capa válida.
- Toda imagem pertença ao jogo citado (validação visual + token-match).
- Cada seção do review tenha imagem contextual própria.
- Imagens venham de fontes oficiais, sejam salvas no nosso bucket e otimizadas.

---

## 1. Novo módulo `imagePipeline` dentro de `supabase/functions/ai-auto-post/index.ts`

Centraliza tudo. Substitui as funções atuais de busca/validação espalhadas.

### 1.1 Detecção de entidade (já existe, será endurecida)
`extractTopicEntity(item)` → Gemini `google/gemini-3-flash-preview` retorna:
```
{ gameTitle, franchise, alternateTitles[], platform, studio, characters[], genre, tags[], theme }
```
Resultado cacheado por artigo e reutilizado em todas as queries de imagem.

### 1.2 Fontes multi-provider (ordem de prioridade)

| # | Fonte | Como chamar | Precisa secret? |
|---|---|---|---|
| 1 | **RAWG** | `https://api.rawg.io/api/games?search=...` + `/games/{id}/screenshots` | `RAWG_API_KEY` (free) |
| 2 | **IGDB** | OAuth via Twitch → `api.igdb.com/v4/games`, `/screenshots`, `/artworks`, `/covers` | `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` |
| 3 | **Steam CDN** | Steam Store search `https://store.steampowered.com/api/storesearch/?term=...&l=en&cc=us` → appdetails `/api/appdetails?appids=` (campos `screenshots`, `header_image`, `background`) | Nenhum |
| 4 | **MobyGames** | `https://api.mobygames.com/v1/games?title=...` + `/games/{id}/screenshots` | `MOBYGAMES_API_KEY` (opcional) |
| 5 | **GiantBomb** | `https://www.giantbomb.com/api/search/?query=...&resources=game` | `GIANTBOMB_API_KEY` (opcional) |
| 6 | **Firecrawl search** (fallback) | já implementado | `FIRECRAWL_API_KEY` (já temos) |
| 7 | **Bing Images** scrape via Firecrawl | `bing.com/images/search?q=...` | já temos |
| 8 | **Google Images** scrape via Firecrawl | `google.com/search?tbm=isch&q=...` | já temos |

Pipeline para por nas primeiras N (≥8) imagens válidas após validação.

> **Pedido ao usuário**: para usar RAWG/IGDB/MobyGames/GiantBomb com qualidade máxima preciso que ele autorize adicionar os secrets correspondentes. Steam e Firecrawl funcionam sem secret novo. Se o usuário não quiser configurar, o sistema usa só Steam + Firecrawl como fontes oficiais — ainda fica muito melhor do que hoje.

### 1.3 Filtro técnico (descartar lixo automático)
Para cada candidata:
- HEAD request com timeout 5s → status 200 obrigatório.
- Content-Type `image/*`.
- Largura ≥ 1280 e altura ≥ 720 (HD). Detecta via `image-size` lendo os primeiros bytes (Deno: `import { imageSize } from "https://deno.land/x/...";` ou usar parser próprio para PNG/JPEG/WebP — implementação inline já que não há dep).
- Bloquear domínios e padrões: `adservice`, `doubleclick`, `pagead`, `tracking`, `pixel`, `banner-`, `placeholder`, `logo-only`, `sprite`, `favicon`, `thumb_`, `_thumb`, `100x100`, `150x`.
- Hash perceptual simples (primeiros 1KB) → deduplica entre fontes.

### 1.4 Token-match contextual
Score 0–100 baseado em:
- nome do jogo aparece em URL/alt/filename: +40
- franquia aparece: +20
- nome de personagem: +15
- domínio oficial (steampowered, igdb, rawg, mobygames, giantbomb, blog.playstation, news.xbox, nintendo): +25
- imagem vinda da fonte 1–5: +30
Mínimo aceito: 50.

### 1.5 Validação visual com Gemini (capa + 1 amostra por seção)
Único provider e único modelo: `google/gemini-2.5-flash` via `/v1/chat/completions` com `image_url`.

Prompt:
> "Esta imagem é claramente do jogo **{gameTitle}** (franquia {franchise})? Procure logo do jogo, HUD, personagens conhecidos, estilo visual. Responda em JSON: `{ \"match\": true|false, \"confidence\": 0-100, \"category\": \"combat|world|character|cutscene|ui|environment|boss|cinematic|promo|other\", \"reason\": \"...\" }`."

Regras de custo:
- Capa: sempre valida.
- Demais imagens: valida só as top 8 por token-match. Outras herdam confiança do token-score.
- Aceita se `match=true && confidence>=70`.

Resultado guardado por imagem: `{ url, category, score, validated }`.

### 1.6 Classificação contextual e distribuição
Pool classificado por `category`. Distribuição por seção do review:

```
intro      → character | promo
atmosfera  → environment | world
narrativa  → cutscene | character
gameplay   → combat | boss
graficos   → cinematic | world
conclusao  → promo | cinematic
```

Notícias: capa + 2 imagens internas (preferir `promo`, `character`, `cinematic`).
CurioGame: capa + 3 internas (qualquer categoria, mas únicas).
Trailers: capa = thumbnail YouTube (mantido), 1 screenshot oficial extra abaixo do vídeo.

### 1.7 Persistência local (anti-hotlink)
Para cada imagem aprovada:
1. Download (`fetch`) com timeout 10s.
2. Upload no bucket `uploads` (já existe, público) via service role:
   `articles/{articleSlug}/{categoria}-{hash8}.{ext}`.
3. URL pública do Supabase Storage substitui a original em `cover_image` e em todo o HTML.
4. Tag `<img loading="lazy" decoding="async" width=".." height=".." alt="{gameTitle} - {category}">`.

### 1.8 Geração com IA como último recurso
Se mesmo após todas as fontes restarem seções sem imagem **e** já houver pelo menos a capa, gera screenshot temática via `google/gemini-3.1-flash-image-preview` (sem nomear personagens reais).
Se faltar capa após tudo: **bloqueia publicação**, marca em `ai_post_logs` com `status='no_image'`.

### 1.9 Anti-falhas
- Cada chamada externa: `AbortController` 8s, 2 retries com backoff (500ms, 1500ms).
- Pool global por execução para nunca repetir a mesma URL em posts diferentes.
- Logs detalhados em `ai_post_logs.error_message` quando bloqueia.

---

## 2. Frontend — exibição

Mudanças mínimas em `src/pages/Article.tsx` e `ArticleCard.tsx`:
- Adicionar `loading="lazy"` e `decoding="async"` em imagens internas (capa fica `eager`).
- `onError` → swap para `placeholder.svg` com classe `opacity-50` para nunca ficar buraco visual.

Nenhuma mudança em design system, layout ou outras rotas.

---

## 3. Secrets necessários (peço confirmação)

Sem custos extras para o usuário se ele só quiser RAWG (gratuita) e Twitch/IGDB (gratuita):

- `RAWG_API_KEY` — https://rawg.io/apidocs (grátis)
- `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` — https://dev.twitch.tv/console (grátis, libera IGDB)
- `MOBYGAMES_API_KEY` — opcional, https://www.mobygames.com/info/api
- `GIANTBOMB_API_KEY` — opcional, https://www.giantbomb.com/api

**Steam e Firecrawl já funcionam sem nada novo.**

---

## Riscos / Notas

- Validação visual com Gemini adiciona ~1 chamada/imagem nas top-8 (≈8 chamadas extras por post). Aceitável para zerar imagens erradas.
- Upload no bucket aumenta latência em ~2–5s por post, mas garante CDN próprio e elimina hotlink.
- Sem os secrets de RAWG/IGDB o sistema ainda funciona, só perde precisão nas fontes oficiais.

---

## Confirmação que preciso antes de implementar

1. Posso pedir os secrets **RAWG_API_KEY** e **TWITCH_CLIENT_ID/SECRET** (gratuitos)? Sem eles fico restrito a Steam + Firecrawl.
2. Quer adicionar **MobyGames** e **GiantBomb** também (opcional)?
3. Confirma a regra dura: **se não houver capa válida, NÃO publica** e loga erro?
