import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NewsItem {
  title: string;
  description: string;
  content: string;
  imageUrls: string[]; // Array of all available images
  sourceUrl: string;
  sourceSite: string;
  contentType: 'news' | 'review' | 'trailer';
  youtubeUrl?: string;
}

// Normalize a title for fuzzy duplicate detection
function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Word-overlap similarity (0..1) — good enough for headline near-duplicates
function titleSimilarity(a: string, b: string): number {
  const wa = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 3));
  const wb = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.min(wa.size, wb.size);
}

// Embed YouTube URLs / extract video id helper
function extractYouTubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\/\s]+)/);
  return m ? m[1] : null;
}

// Patterns to identify and exclude logos from images
const LOGO_PATTERNS = [
  /logo/i,
  /brand/i,
  /icon/i,
  /favicon/i,
  /sprite/i,
  /avatar/i,
  /social/i,
  /share/i,
  /button/i,
  /badge/i,
  /widget/i,
  /ad-/i,
  /advertisement/i,
  /banner-ad/i,
  /promo-/i,
  /tracking/i,
  /pixel/i,
  /1x1/i,
  /spacer/i,
  /-small\./i,
  /-thumb\./i,
  /thumbnail-small/i,
];

// Known site logo domains/paths to exclude
const LOGO_DOMAINS = [
  'googleadservices',
  'doubleclick',
  'facebook.com/tr',
  'analytics',
  'cdn.cnn.com/cnn-brightcove',
  'assets.ign.com/logos',
  'gamespot.com/bundles',
  'kotaku.com/assets',
  'polygon.com/logos',
  'pcgamer.com/bundles',
];

function isLikelyLogo(imageUrl: string): boolean {
  if (!imageUrl) return true;
  
  // Check for logo patterns in URL
  for (const pattern of LOGO_PATTERNS) {
    if (pattern.test(imageUrl)) return true;
  }
  
  // Check for known logo domains
  for (const domain of LOGO_DOMAINS) {
    if (imageUrl.includes(domain)) return true;
  }
  
  // Filter out very small images (often used for tracking/logos)
  // Check for size indicators in URL
  if (/\/(50|40|32|24|16|20)x\d+/i.test(imageUrl)) return true;
  if (/\/\d+x(50|40|32|24|16|20)/i.test(imageUrl)) return true;
  
  // Filter out data URIs (usually small icons)
  if (imageUrl.startsWith('data:')) return true;
  
  return false;
}

function extractAllImages(html: string, markdown: string): string[] {
  const images: Set<string> = new Set();
  
  // Extract from HTML - get all img tags
  const htmlImgMatches = html?.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
  for (const match of htmlImgMatches) {
    if (match[1] && !isLikelyLogo(match[1])) {
      images.add(match[1]);
    }
  }
  
  // Extract from HTML - get srcset images (often higher quality)
  const srcsetMatches = html?.matchAll(/srcset=["']([^"']+)["']/gi) || [];
  for (const match of srcsetMatches) {
    const srcsetUrls = match[1].split(',').map(s => s.trim().split(' ')[0]);
    for (const url of srcsetUrls) {
      if (url && !isLikelyLogo(url)) {
        images.add(url);
      }
    }
  }
  
  // Extract from HTML - data-src (lazy loaded images)
  const dataSrcMatches = html?.matchAll(/data-src=["']([^"']+)["']/gi) || [];
  for (const match of dataSrcMatches) {
    if (match[1] && !isLikelyLogo(match[1])) {
      images.add(match[1]);
    }
  }
  
  // Extract from markdown
  const mdImgMatches = markdown?.matchAll(/!\[.*?\]\(([^)]+)\)/g) || [];
  for (const match of mdImgMatches) {
    if (match[1] && !isLikelyLogo(match[1])) {
      images.add(match[1]);
    }
  }
  
  // Extract from markdown - reference style images
  const mdRefMatches = markdown?.matchAll(/\[.*?\]:\s*(https?:\/\/[^\s]+)/g) || [];
  for (const match of mdRefMatches) {
    if (match[1] && !isLikelyLogo(match[1]) && /\.(jpg|jpeg|png|gif|webp)/i.test(match[1])) {
      images.add(match[1]);
    }
  }
  
  return Array.from(images);
}

const TITLE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'about', 'after', 'before', 'over', 'under', 'this', 'that',
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'um', 'uma',
  'news', 'noticia', 'noticias', 'notícia', 'notícias', 'review', 'reviews', 'analise', 'analises', 'análise',
  'análises', 'trailer', 'trailers', 'teaser', 'teasers', 'game', 'games', 'jogo', 'jogos', 'official', 'novo',
  'nova', 'new', 'first', 'look', 'launch', 'update', 'patch', 'preview', 'hands', 'gameplay', 'video', 'vídeo',
  'watch', 'reveals', 'revealed', 'announcement', 'announce', 'state', 'play', 'showcase', 'story', 'mode',
  'ps5', 'ps4', 'xbox', 'switch', 'steam', 'pc', 'ign', 'gamespot', 'kotaku', 'polygon', 'pcgamer', 'gamesradar',
  'pushsquare', 'eurogamer', 'playstation', 'xboxera', 'nintendo'
]);

function normalizeSourceUrl(url: string): string {
  if (!url) return '';

  const youtubeId = extractYouTubeId(url);
  if (youtubeId) return `youtube:${youtubeId}`;

  try {
    const parsed = new URL(url);
    parsed.hash = '';

    const keepParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams.entries()) {
      if (/^utm_/i.test(key)) continue;
      if (['fbclid', 'gclid', 'si', 'feature', 'ab_channel'].includes(key)) continue;
      keepParams.append(key, value);
    }

    parsed.search = keepParams.toString() ? `?${keepParams.toString()}` : '';
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function getTitleTokens(title: string, contentType: NewsItem['contentType']): string[] {
  const genericByType = {
    news: ['breaking'],
    review: ['score', 'veredicto', 'opiniao', 'opinião'],
    trailer: ['cinematic', 'launch', 'official', 'announce', 'announcement'],
  } satisfies Record<NewsItem['contentType'], string[]>;

  return normalizeTitle(title)
    .split(' ')
    .filter((token) => token.length > 2)
    .filter((token) => !TITLE_STOP_WORDS.has(token))
    .filter((token) => !genericByType[contentType].includes(token));
}

function getTitleSignature(title: string, contentType: NewsItem['contentType']): string {
  return getTitleTokens(title, contentType).slice(0, 4).join(' ');
}

function areLikelyDuplicateTitles(a: string, b: string, contentType: NewsItem['contentType']): boolean {
  if (!a || !b) return false;

  const normalizedA = normalizeTitle(a);
  const normalizedB = normalizeTitle(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;

  const signatureA = getTitleSignature(a, contentType);
  const signatureB = getTitleSignature(b, contentType);
  if (signatureA && signatureA === signatureB) return true;

  const tokensA = getTitleTokens(a, contentType);
  const tokensB = getTitleTokens(b, contentType);
  if (!tokensA.length || !tokensB.length) {
    return titleSimilarity(a, b) >= (contentType === 'trailer' ? 0.72 : 0.8);
  }

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  const containment = intersection / Math.min(setA.size, setB.size);
  const jaccard = intersection / union;
  const minIntersection = contentType === 'trailer' ? 2 : 3;
  const threshold = contentType === 'trailer' ? 0.67 : contentType === 'review' ? 0.72 : 0.78;

  return intersection >= minIntersection && (containment >= threshold || jaccard >= threshold - 0.18);
}

function scoreItem(item: NewsItem): number {
  const contentScore = Math.min(item.content.length, 5000) / 100;
  const imageScore = Math.min(item.imageUrls.length, 4) * 20;
  const descriptionScore = Math.min(item.description.length, 180) / 20;
  const trailerScore = item.youtubeUrl ? 40 : 0;
  return contentScore + imageScore + descriptionScore + trailerScore;
}

function cleanAiJsonResponse(content: string): string {
  let cleanContent = content.trim();

  if (cleanContent.startsWith('```json')) cleanContent = cleanContent.slice(7);
  if (cleanContent.startsWith('```')) cleanContent = cleanContent.slice(3);
  if (cleanContent.endsWith('```')) cleanContent = cleanContent.slice(0, -3);

  return cleanContent.trim();
}

function escapeHtml(value: string): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function asList(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function buildStandardContent(parsed: Record<string, unknown>, item: NewsItem) {
  const title = asText(parsed.title, item.title).slice(0, 90);
  const description = asText(parsed.description, item.description || '').slice(0, 200);
  const headlines = asList(parsed.headlines, 4);
  const paragraphSource = Array.isArray(parsed.paragraphs)
    ? parsed.paragraphs
    : [];

  const paragraphs = paragraphSource
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (paragraphs.length === 0) {
    throw new Error('AI returned no valid paragraphs');
  }

  while (paragraphs.length < 4) {
    paragraphs.push(paragraphs[paragraphs.length - 1]);
  }

  const ytId = extractYouTubeId(item.youtubeUrl);
  const galleryImages = item.imageUrls.slice(1, 5);
  const htmlParts: string[] = [];

  if (ytId) {
    htmlParts.push(`<div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.5rem 0;border-radius:0.5rem;"><iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe></div>`);
  }

  for (let index = 0; index < paragraphs.length; index++) {
    if (headlines[index]) {
      htmlParts.push(`<h2>${escapeHtml(headlines[index])}</h2>`);
    }

    htmlParts.push(`<p>${escapeHtml(paragraphs[index])}</p>`);

    const image = galleryImages[index];
    if (image) {
      htmlParts.push(`<figure style="margin:1.5rem 0;"><img src="${image}" alt="${escapeHtml(title)}" style="width:100%;height:auto;border-radius:0.5rem;" loading="lazy" /></figure>`);
    }
  }

  return {
    title,
    description,
    content: htmlParts.join('\n'),
  };
}

function buildReviewContent(parsed: Record<string, unknown>, item: NewsItem) {
  const gameTitle = asText(parsed.gameTitle, item.title.split(/[\-|—:|]/)[0]?.trim() || item.title);
  const title = asText(parsed.title, `${gameTitle} — Review do Império Gamers`).slice(0, 90);
  const description = asText(parsed.description, item.description || '').slice(0, 200);
  const intro = asText(parsed.intro, item.description || '');
  const atmosphere = asText(parsed.atmosphere, intro);
  const story = asText(parsed.story, intro);
  const gameplay = asText(parsed.gameplay, intro);
  const opinion = asText(parsed.opinion, intro);
  const verdict = asText(parsed.verdict, 'É um jogo com ideias fortes, mas que ainda depende do perfil do jogador para brilhar de verdade.');
  const score = asText(parsed.score, '7,0/10');
  const shouldPlay = asText(parsed.shouldPlay, '✅ Sim — especialmente se você curte propostas autorais e experiências fora do padrão.');
  const shouldBuyNow = asText(parsed.shouldBuyNow, '⚠️ Vale comprar agora se a proposta combinar com você e a plataforma estiver estável.');
  const pros = asList(parsed.pros).slice(0, 5);
  const cons = asList(parsed.cons).slice(0, 5);
  const galleryImages = item.imageUrls.slice(1, 5);

  const sectionBlocks = [
    { heading: '🧠 Introdução', text: intro, image: galleryImages[0] },
    { heading: '🌆 Cenário e atmosfera', text: atmosphere, image: galleryImages[1] },
    { heading: '📜 História e narrativa', text: story, image: galleryImages[2] },
    { heading: '⚔️ Jogabilidade e combate', text: gameplay, image: galleryImages[3] },
  ];

  const htmlParts: string[] = [
    `<p><strong>Nossa equipe do Império Gamers jogou ${escapeHtml(gameTitle)}</strong></p>`,
    '<p><strong>Por: Coimbra Gonçalves — adm e CEO do Império Gamers</strong></p>',
  ];

  for (const block of sectionBlocks) {
    htmlParts.push(`<h2>${escapeHtml(block.heading)}</h2>`);
    htmlParts.push(`<p>${escapeHtml(block.text)}</p>`);

    if (block.image) {
      htmlParts.push(`<figure style="margin:1.5rem 0;"><img src="${block.image}" alt="${escapeHtml(title)}" style="width:100%;height:auto;border-radius:0.5rem;" loading="lazy" /></figure>`);
    }
  }

  if (pros.length > 0) {
    htmlParts.push('<h2>✅ Prós</h2>');
    htmlParts.push(`<ul>${pros.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`);
  }

  if (cons.length > 0) {
    htmlParts.push('<h2>❌ Contras</h2>');
    htmlParts.push(`<ul>${cons.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`);
  }

  htmlParts.push('<h2>🎯 Minha opinião profissional</h2>');
  htmlParts.push(`<p>${escapeHtml(opinion)}</p>`);
  htmlParts.push('<h2>🔥 Veredicto Final</h2>');
  htmlParts.push(`<p><strong>Pontuação:</strong> ${escapeHtml(score)}</p>`);
  htmlParts.push(`<p>${escapeHtml(verdict)}</p>`);
  htmlParts.push(`<p><strong>Você deveria jogar?</strong><br />${escapeHtml(shouldPlay)}</p>`);
  htmlParts.push(`<p><strong>Você deve comprá-lo agora?</strong><br />${escapeHtml(shouldBuyNow)}</p>`);
  htmlParts.push('<p>Se você gostou desta análise, deixe o seu like, inscreva-se no site e acompanhe o Império Gamers para mais reviews completas.</p>');

  return {
    title,
    description,
    content: htmlParts.join('\n'),
  };
}

function buildAiMessages(item: NewsItem) {
  if (item.contentType === 'review') {
    return [
      {
        role: 'system',
        content: `Você é o crítico principal do portal Império Gamers. Crie reviews originais em português brasileiro com tom editorial profissional, sem citar a fonte original.

MODELO OBRIGATÓRIO PARA REVIEWS:
- Título no formato: "Nome do jogo — subtítulo opinativo"
- O texto final do site terá autoria fixa do Império Gamers, então não invente outro autor
- Descrição com 1 ou 2 frases chamativas
- Analise atmosfera, história, gameplay, pontos fortes, pontos fracos e veredicto
- Pode elogiar e criticar com equilíbrio, sem parecer texto promocional
- Gere manchetes fortes e linguagem natural de portal gamer brasileiro

Responda APENAS em JSON válido com esta estrutura:
{
  "gameTitle": "...",
  "title": "...",
  "description": "...",
  "intro": "...",
  "atmosphere": "...",
  "story": "...",
  "gameplay": "...",
  "pros": ["...", "...", "...", "..."],
  "cons": ["...", "...", "...", "..."],
  "opinion": "...",
  "verdict": "...",
  "score": "6,2/10",
  "shouldPlay": "✅ ...",
  "shouldBuyNow": "⚠️ ..."
}

REGRAS:
- Cada seção textual deve ter entre 80 e 160 palavras
- Prós e contras devem ser objetivos
- A nota precisa usar vírgula e terminar com /10
- Nunca cite IGN, GameSpot, Kotaku, PC Gamer, Polygon ou qualquer outra fonte`
      },
      {
        role: 'user',
        content: `Produza uma review completa e original a partir deste material bruto:\n\nTítulo original: ${item.title}\n\nDescrição: ${item.description}\n\nConteúdo coletado:\n${item.content.substring(0, 3500)}`
      }
    ];
  }

  const editorialFocus = item.contentType === 'trailer'
    ? 'Você está cobrindo um trailer de game. Destaque o que o vídeo revela, o clima, possíveis mecânicas, plataformas e janela de lançamento quando existirem.'
    : 'Você está cobrindo uma notícia de games. Destaque o fato principal, o contexto, o impacto para os jogadores e os próximos passos.';

  return [
    {
      role: 'system',
      content: `Você é um editor do portal Império Gamers. Reescreva conteúdos de games em português brasileiro, sem copiar frases e sem citar a fonte original.

${editorialFocus}

REGRAS OBRIGATÓRIAS:
- Gere uma manchete principal forte e original em português com até 90 caracteres
- Gere uma descrição chamativa com até 200 caracteres
- Gere 4 intertítulos curtos e escaneáveis para organizar a matéria
- Gere 4 parágrafos médios, cada um cobrindo um ângulo diferente da pauta
- Linguagem natural, envolvente e profissional
- Não use HTML, markdown ou listas na resposta

Responda APENAS em JSON válido com esta estrutura:
{
  "title": "...",
  "description": "...",
  "headlines": ["...", "...", "...", "..."],
  "paragraphs": ["...", "...", "...", "..."]
}`
    },
    {
      role: 'user',
      content: `Reescreva este conteúdo de games para o Império Gamers:\n\nTipo: ${item.contentType}\nTítulo original: ${item.title}\nDescrição: ${item.description}\nConteúdo:\n${item.content.substring(0, 3200)}`
    }
  ];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verifica parâmetros da execução
    let forceNew = false;
    let postsPerType = 3; // Default: 3 posts per type
    let contentTypes: string[] = ['news', 'review', 'trailer']; // Default: all types
    try {
      const body = await req.json();
      forceNew = body?.forceNew === true;
      if (body?.postsPerType && typeof body.postsPerType === 'number') {
        postsPerType = Math.min(Math.max(body.postsPerType, 1), 10); // Limita entre 1 e 10
      }
      if (body?.contentTypes && Array.isArray(body.contentTypes) && body.contentTypes.length > 0) {
        contentTypes = body.contentTypes.filter((t: string) => ['news', 'review', 'trailer'].includes(t));
      }
    } catch {
      // Corpo vazio, execução automática (cron)
    }
    
    console.log('Execution mode:', forceNew ? 'MANUAL (force new)' : 'AUTOMATIC (check duplicates)');
    console.log('Posts per type:', postsPerType);
    console.log('Content types:', contentTypes);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lovable API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if AI is enabled
    const { data: settings, error: settingsError } = await supabase
      .from('ai_settings')
      .select('*')
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI settings not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!settings.is_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI auto-posting is disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sourceSites = settings.source_sites as string[];
    const youtubeChannels = settings.youtube_channels as string[];
    
    console.log('Starting AI auto-post for sites:', sourceSites);

    const newsItems: NewsItem[] = [];

    // Scrape each source site for latest news
    for (const site of sourceSites) {
      try {
        console.log(`Scraping ${site}...`);
        
        // Search for news
        const newsResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:${site} gaming news`,
            limit: 5,
            tbs: 'qdr:d', // Last 24 hours
            scrapeOptions: {
              formats: ['markdown', 'html']
            }
          }),
        });

        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          if (newsData.success && newsData.data) {
            for (const result of newsData.data) {
              const allImages = extractAllImages(result.html || '', result.markdown || '');
              if (result.metadata?.ogImage && !isLikelyLogo(result.metadata.ogImage)) {
                if (!allImages.includes(result.metadata.ogImage)) {
                  allImages.unshift(result.metadata.ogImage);
                }
              }
              console.log(`Found ${allImages.length} images for news: ${result.title}`);
              newsItems.push({
                title: result.title || 'Untitled',
                description: result.description || '',
                content: result.markdown || result.description || '',
                imageUrls: allImages,
                sourceUrl: result.url,
                sourceSite: site,
                contentType: 'news'
              });
            }
          }
        }

        // Search for reviews separately
        const reviewResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:${site} game review`,
            limit: 5,
            tbs: 'qdr:w', // Last week for reviews
            scrapeOptions: {
              formats: ['markdown', 'html']
            }
          }),
        });

        if (reviewResponse.ok) {
          const reviewData = await reviewResponse.json();
          if (reviewData.success && reviewData.data) {
            for (const result of reviewData.data) {
              // Only add if URL or title contains "review"
              const lowerTitle = (result.title || '').toLowerCase();
              const lowerUrl = (result.url || '').toLowerCase();
              if (!lowerTitle.includes('review') && !lowerUrl.includes('review')) continue;
              
              const allImages = extractAllImages(result.html || '', result.markdown || '');
              if (result.metadata?.ogImage && !isLikelyLogo(result.metadata.ogImage)) {
                if (!allImages.includes(result.metadata.ogImage)) {
                  allImages.unshift(result.metadata.ogImage);
                }
              }
              console.log(`Found ${allImages.length} images for review: ${result.title}`);
              newsItems.push({
                title: result.title || 'Untitled',
                description: result.description || '',
                content: result.markdown || result.description || '',
                imageUrls: allImages,
                sourceUrl: result.url,
                sourceSite: site,
                contentType: 'review'
              });
            }
          }
        }

      } catch (error) {
        console.error(`Error scraping ${site}:`, error);
      }
    }

    // Search for trailers from YouTube channels
    for (const channel of youtubeChannels) {
      try {
        console.log(`Searching trailers from ${channel}...`);
        
        const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:youtube.com ${channel} game trailer official`,
            limit: 5,
            tbs: 'qdr:w', // Last week
          }),
        });

        if (!searchResponse.ok) continue;

        const searchData = await searchResponse.json();
        
        if (searchData.success && searchData.data) {
          for (const result of searchData.data) {
            if (result.url?.includes('youtube.com/watch')) {
              // Extract video ID for thumbnail
              const videoIdMatch = result.url.match(/[?&]v=([^&]+)/);
              const thumbnails: string[] = [];
              if (videoIdMatch) {
                // Add multiple quality thumbnails
                thumbnails.push(`https://img.youtube.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`);
                thumbnails.push(`https://img.youtube.com/vi/${videoIdMatch[1]}/hqdefault.jpg`);
              }
              
              newsItems.push({
                title: result.title || 'Game Trailer',
                description: result.description || '',
                content: result.description || '',
                imageUrls: thumbnails,
                sourceUrl: result.url,
                sourceSite: 'youtube.com',
                contentType: 'trailer',
                youtubeUrl: result.url
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error searching YouTube channel ${channel}:`, error);
      }
    }

    console.log(`Found ${newsItems.length} news items (before image filter)`);

    const filteredItems = newsItems.filter(item => {
      if (item.contentType === 'trailer') {
        return item.youtubeUrl && item.youtubeUrl.length > 0;
      }
      return item.imageUrls.length > 0;
    });

    const uniqueCandidates: NewsItem[] = [];
    const scoredCandidates = [...filteredItems].sort((a, b) => scoreItem(b) - scoreItem(a));

    for (const item of scoredCandidates) {
      const normalizedUrl = normalizeSourceUrl(item.sourceUrl);
      const youtubeId = extractYouTubeId(item.youtubeUrl);
      const hasDuplicateCandidate = uniqueCandidates.some((existing) => {
        if (existing.contentType !== item.contentType) return false;
        if (normalizeSourceUrl(existing.sourceUrl) === normalizedUrl) return true;

        const existingYoutubeId = extractYouTubeId(existing.youtubeUrl);
        if (youtubeId && existingYoutubeId && youtubeId === existingYoutubeId) return true;

        return areLikelyDuplicateTitles(existing.title, item.title, item.contentType);
      });

      if (!hasDuplicateCandidate) {
        uniqueCandidates.push(item);
      } else {
        console.log(`Skipping duplicate candidate before AI: ${item.title}`);
      }
    }

    console.log(`After image + candidate dedupe: ${uniqueCandidates.length} items (removed ${newsItems.length - uniqueCandidates.length})`);

    if (uniqueCandidates.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No content with images found', postsCreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Separate content types based on selected types
    const newsOnly = contentTypes.includes('news') 
      ? uniqueCandidates.filter(item => item.contentType === 'news').sort((a, b) => scoreItem(b) - scoreItem(a))
      : [];
    const reviewsOnly = contentTypes.includes('review') 
      ? uniqueCandidates.filter(item => item.contentType === 'review').sort((a, b) => scoreItem(b) - scoreItem(a))
      : [];
    const trailersOnly = contentTypes.includes('trailer') 
      ? uniqueCandidates.filter(item => item.contentType === 'trailer').sort((a, b) => scoreItem(b) - scoreItem(a))
      : [];
    
    // Build the final list: postsPerType of each selected type
    const itemsToProcess: NewsItem[] = [];
    
    // Add up to postsPerType news items (if selected)
    if (contentTypes.includes('news')) {
      for (const item of newsOnly) {
        if (itemsToProcess.filter(i => i.contentType === 'news').length < postsPerType) {
          itemsToProcess.push(item);
        }
      }
    }
    
    // Add up to postsPerType reviews (if selected)
    if (contentTypes.includes('review')) {
      for (const item of reviewsOnly) {
        if (itemsToProcess.filter(i => i.contentType === 'review').length < postsPerType) {
          itemsToProcess.push(item);
        }
      }
    }
    
    // Add up to postsPerType trailers (if selected)
    if (contentTypes.includes('trailer')) {
      for (const item of trailersOnly) {
        if (itemsToProcess.filter(i => i.contentType === 'trailer').length < postsPerType) {
          itemsToProcess.push(item);
        }
      }
    }
    
    console.log(`Processing ${itemsToProcess.length} items (${postsPerType} per type): ${itemsToProcess.filter(i => i.contentType === 'news').length} news, ${itemsToProcess.filter(i => i.contentType === 'review').length} reviews, ${itemsToProcess.filter(i => i.contentType === 'trailer').length} trailers`);

    const duplicateCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: recentLogs }, { data: recentArticles }] = await Promise.all([
      supabase
        .from('ai_post_logs')
        .select('source_url, content_type, status, created_at')
        .gte('created_at', duplicateCutoff)
        .in('content_type', contentTypes),
      supabase
        .from('articles')
        .select('title, content_type, youtube_url, created_at')
        .gte('created_at', duplicateCutoff)
        .in('content_type', contentTypes)
        .limit(1000)
    ]);

    const recentSourceKeys = new Set(
      (recentLogs || [])
        .filter((log: { status: string }) => ['success', 'duplicate'].includes(log.status))
        .map((log: { source_url: string }) => normalizeSourceUrl(log.source_url))
        .filter(Boolean)
    );
    const recentPublished = [...(recentArticles || [])];

    // Process each news item with AI
    let postsCreated = 0;
    
    for (const item of itemsToProcess) {
      try {
        const normalizedSourceUrl = normalizeSourceUrl(item.sourceUrl);
        const itemYoutubeId = extractYouTubeId(item.youtubeUrl);

        if (!forceNew) {
          if (recentSourceKeys.has(normalizedSourceUrl)) {
            console.log(`Already posted: ${item.sourceUrl}`);
            continue;
          }

          const matchingArticle = recentPublished.find((article: { title: string; content_type: string; youtube_url: string | null }) => {
            if (article.content_type !== item.contentType) return false;

            const articleYoutubeId = extractYouTubeId(article.youtube_url);
            if (itemYoutubeId && articleYoutubeId && itemYoutubeId === articleYoutubeId) return true;

            return areLikelyDuplicateTitles(article.title, item.title, item.contentType);
          });

          if (matchingArticle) {
            console.log(`Skipping similar title: ${item.title}`);
            await supabase.from('ai_post_logs').insert({
              source_url: item.sourceUrl,
              source_site: item.sourceSite,
              content_type: item.contentType,
              status: 'duplicate',
              error_message: 'Similar title already exists'
            });
            recentSourceKeys.add(normalizedSourceUrl);
            continue;
          }
        }

        console.log(`Processing: ${item.title}`);

        // Use AI to rewrite the content in Portuguese
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: buildAiMessages(item),
          }),
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error('AI error:', errorText);
          
          // Log the error
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: `AI error: ${aiResponse.status}`
          });
          continue;
        }

        const aiData = await aiResponse.json();
        const aiContent = aiData.choices?.[0]?.message?.content;
        
        if (!aiContent) {
          console.error('No AI content received');
          continue;
        }

        // Parse AI response
        let parsedContent;
        try {
          parsedContent = JSON.parse(cleanAiJsonResponse(aiContent));
        } catch (parseError) {
          console.error('Failed to parse AI response:', aiContent);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: 'Failed to parse AI response'
          });
          continue;
        }

        const builtContent = item.contentType === 'review'
          ? buildReviewContent(parsedContent as Record<string, unknown>, item)
          : buildStandardContent(parsedContent as Record<string, unknown>, item);

        const isFinalDuplicate = recentPublished.some((article: { title: string; content_type: string; youtube_url: string | null }) => {
          if (article.content_type !== item.contentType) return false;

          const articleYoutubeId = extractYouTubeId(article.youtube_url);
          if (itemYoutubeId && articleYoutubeId && itemYoutubeId === articleYoutubeId) return true;

          return areLikelyDuplicateTitles(article.title, builtContent.title, item.contentType);
        });

        if (isFinalDuplicate) {
          console.log(`Skipping AI output duplicate: ${builtContent.title}`);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'duplicate',
            error_message: 'Generated title matched existing article'
          });
          recentSourceKeys.add(normalizedSourceUrl);
          continue;
        }

        // Generate slug
        const slug = builtContent.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 100);

        // Use the first available image as cover, or skip this item entirely
        const coverImage = item.imageUrls.length > 0 ? item.imageUrls[0] : null;
        
        // SAFETY: Never create posts without visual content
        if (item.contentType !== 'trailer' && !coverImage) {
          console.log(`Skipping "${parsedContent.title}" - no cover image available`);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: 'No cover image available'
          });
          continue;
        }
        
        if (item.contentType === 'trailer' && !item.youtubeUrl) {
          console.log(`Skipping trailer "${parsedContent.title}" - no YouTube URL`);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: 'No YouTube URL for trailer'
          });
          continue;
        }
        
        // For trailers, use YouTube thumbnail as cover if no other image
        const finalCoverImage = coverImage || (item.youtubeUrl ? `https://img.youtube.com/vi/${item.youtubeUrl.match(/[?&]v=([^&]+)/)?.[1]}/maxresdefault.jpg` : null);
        
        // Create the article
        const { data: article, error: articleError } = await supabase
          .from('articles')
          .insert({
            title: builtContent.title,
            slug: slug + '-' + Date.now(),
            description: builtContent.description,
            content: builtContent.content,
            cover_image: finalCoverImage,
            content_type: item.contentType,
            youtube_url: item.youtubeUrl || null,
            is_published: true
          })
          .select()
          .single();
        
        // If article created successfully, save all additional images
        if (!articleError && article && item.imageUrls.length > 1) {
          const additionalImages = item.imageUrls.slice(1).map((url, index) => ({
            article_id: article.id,
            image_url: url,
            position: index + 1,
            caption: null
          }));
          
          if (additionalImages.length > 0) {
            const { error: imagesError } = await supabase
              .from('article_images')
              .insert(additionalImages);
            
            if (imagesError) {
              console.error('Error saving additional images:', imagesError);
            } else {
              console.log(`Saved ${additionalImages.length} additional images for article`);
            }
          }
        }

        if (articleError) {
          console.error('Error creating article:', articleError);
          await supabase.from('ai_post_logs').insert({
            source_url: item.sourceUrl,
            source_site: item.sourceSite,
            content_type: item.contentType,
            status: 'error',
            error_message: articleError.message
          });
          continue;
        }

        // Log success
        await supabase.from('ai_post_logs').insert({
          source_url: item.sourceUrl,
          source_site: item.sourceSite,
          article_id: article.id,
          content_type: item.contentType,
          status: 'success'
        });

        recentSourceKeys.add(normalizedSourceUrl);
        recentPublished.unshift({
          title: builtContent.title,
          content_type: item.contentType,
          youtube_url: item.youtubeUrl || null,
          created_at: new Date().toISOString()
        });

        postsCreated++;
        console.log(`Created article: ${article.title}`);

      } catch (error) {
        console.error(`Error processing item:`, error);
        await supabase.from('ai_post_logs').insert({
          source_url: item.sourceUrl,
          source_site: item.sourceSite,
          content_type: item.contentType,
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update last run timestamp
    await supabase
      .from('ai_settings')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', settings.id);

    // Auto-cleanup oldest articles if enabled
    try {
      const { data: featSettings } = await supabase
        .from('featured_settings')
        .select('auto_cleanup_enabled, auto_cleanup_threshold')
        .single();

      if (featSettings?.auto_cleanup_enabled) {
        const { count } = await supabase
          .from('articles')
          .select('id', { count: 'exact', head: true });
        const threshold = featSettings.auto_cleanup_threshold || 200;
        if ((count || 0) > threshold) {
          const toDelete = (count || 0) - threshold;
          const limit = Math.min(toDelete, 40);
          const { data: oldest } = await supabase
            .from('articles')
            .select('id')
            .order('created_at', { ascending: true })
            .limit(limit);
          if (oldest && oldest.length > 0) {
            await supabase.from('articles').delete().in('id', oldest.map((a: { id: string }) => a.id));
            console.log(`Auto-cleanup: removed ${oldest.length} oldest articles`);
          }
        }
      }
    } catch (cleanupErr) {
      console.error('Auto-cleanup error:', cleanupErr);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Created ${postsCreated} posts`,
        postsCreated,
          itemsFound: uniqueCandidates.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI auto-post error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
