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
  contentType: 'news' | 'review' | 'trailer' | 'curiogame';
  youtubeUrl?: string;
  // Optional entity extracted from the content (game name / franchise / etc.)
  entity?: TopicEntity;
  // Optional per-section images for reviews (already validated)
  sectionImages?: string[];
  // Rich metadata per image (filled by image pipeline)
  imageMeta?: ImageMeta[];
}

interface TopicEntity {
  gameTitle: string;
  franchise?: string;
  characters?: string[];
  studio?: string;
  keywords?: string[];
}

type ImageCategory =
  | 'combat' | 'world' | 'character' | 'cutscene' | 'ui'
  | 'environment' | 'boss' | 'cinematic' | 'promo' | 'other';

interface ImageMeta {
  url: string;
  category: ImageCategory;
  score: number;
  source: string;
  validated: boolean;
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

// Domains of competitor / source sites whose branded banners we never want
// to republish. Any image hosted on these domains is rejected, even if it
// looks like an in-article photo — it's almost always a site banner,
// promotional strip or "related article" thumbnail of another outlet.
const BLOCKED_IMAGE_DOMAINS = [
  'flowgames',
  'flow-games',
  'flow_games',
  'theflowgames',
  'tecmundo',
  'voxel',
  'thegamer',
  'dualshockers',
  'gamerant',
  'gameranx',
  'pushsquare',
  'nintendolife',
  'eurogamer',
  'rockpapershotgun',
  'destructoid',
  'screenrant',
  'comicbook.com',
  'gamesradar',
  'gamingbolt',
  'wccftech',
  'videogameschronicle',
  'vg247',
  'gematsu',
  'siliconera',
  'nintendoeverything',
  'nichegamer',
  'gamespew',
  'twinfinite',
  'pcgamesn',
  'pcgamer.com',
  'kotaku.com',
  'polygon.com',
  'gamespot.com',
  'ign.com',
];

// Visual / banner-ish path hints that strongly indicate a site banner
// (header art, hero strip, promo, "featured-image" of another outlet, etc.)
const BANNER_PATH_HINTS = [
  '/header',
  '/hero',
  '/site-',
  '/cover-site',
  '/promo',
  '/featured-image',
  '/wp-content/uploads/sites/',
  '/branding',
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

  // Hard-block competitor / source-site domains entirely
  const lowered = imageUrl.toLowerCase();
  for (const domain of BLOCKED_IMAGE_DOMAINS) {
    if (lowered.includes(domain)) return true;
  }

  // Block obvious banner path hints
  for (const hint of BANNER_PATH_HINTS) {
    if (lowered.includes(hint)) return true;
  }
  
  // Filter out very small images (often used for tracking/logos)
  // Check for size indicators in URL
  if (/\/(50|40|32|24|16|20)x\d+/i.test(imageUrl)) return true;
  if (/\/\d+x(50|40|32|24|16|20)/i.test(imageUrl)) return true;
  
  // Filter out data URIs (usually small icons)
  if (imageUrl.startsWith('data:')) return true;
  
  return false;
}

// Extract meaningful tokens from the article title for image matching.
// Used to keep only images whose URL references the same game/topic.
function getTopicTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(' ')
    .filter((t) => t.length >= 4)
    .filter((t) => !TITLE_STOP_WORDS.has(t));
}

function imageMatchesTopic(imageUrl: string, topicTokens: string[]): boolean {
  if (!imageUrl || topicTokens.length === 0) return false;
  const lowered = imageUrl.toLowerCase();
  // require at least one strong topic token to appear in the URL/path/filename
  return topicTokens.some((t) => lowered.includes(t));
}

// Reorder images so that those whose URL contains the article's topic tokens come first.
// If at least one matches, drop images that don't (they are likely unrelated banners).
function rankImagesByTopic(images: string[], title: string): string[] {
  const tokens = getTopicTokens(title);
  if (tokens.length === 0 || images.length === 0) return images;

  const matching: string[] = [];
  const others: string[] = [];
  for (const url of images) {
    if (imageMatchesTopic(url, tokens)) matching.push(url);
    else others.push(url);
  }

  // If we found topic-matching images, prefer them exclusively (max 6)
  if (matching.length > 0) return matching.slice(0, 6);

  // Otherwise keep the original list (better than nothing)
  return others.slice(0, 6);
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

// =====================================================================
// IMAGE ENRICHMENT PIPELINE
// Goal: never publish a post with no / wrong / unrelated images.
// 1) Validate URL (HEAD, dimensions when available)
// 2) Search Firecrawl for "<game> screenshot/keyart/gameplay"
// 3) AI image generation as last resort (uploaded to Supabase storage)
// =====================================================================

const TRUSTED_IMAGE_DOMAINS = [
  'store.steampowered.com',
  'steamstatic.com',
  'akamaihd.net',
  'media.rawg.io',
  'blog.playstation.com',
  'gmedia.playstation.com',
  'news.xbox.com',
  'compass-ssl.xbox.com',
  'assets.nintendo.com',
  'nintendo.com',
  'epicgames.com',
  'cdn2.unrealengine.com',
  'cdn1.epicgames.com',
  'wikipedia.org',
  'wikimedia.org',
  'img.youtube.com',
  'i.ytimg.com',
];

function isTrustedImageDomain(url: string): boolean {
  const lowered = url.toLowerCase();
  return TRUSTED_IMAGE_DOMAINS.some((d) => lowered.includes(d));
}

async function validateImageUrl(url: string, timeoutMs = 5000): Promise<boolean> {
  if (!url) return false;
  if (url.startsWith('data:')) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return false;
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    // Reject tiny tracker/icon images (< 8KB)
    if (len > 0 && len < 8000) return false;
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Resilient AI gateway caller: retries transient failures,
// falls back to alternative models and surfaces credit issues.
// ============================================================
const AI_MODEL_CHAIN = [
  'google/gemini-3-flash-preview',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
];

let AI_CREDITS_EXHAUSTED = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callAiChat(
  lovableKey: string,
  payload: Record<string, unknown>,
  opts: { attemptsPerModel?: number; timeoutMs?: number; label?: string } = {}
): Promise<string | null> {
  if (AI_CREDITS_EXHAUSTED) return null;

  const attempts = opts.attemptsPerModel ?? 3;
  const timeoutMs = opts.timeoutMs ?? 90000;
  const label = opts.label ?? 'ai';
  const requestedModel = typeof payload.model === 'string' ? payload.model : AI_MODEL_CHAIN[0];
  const models = [requestedModel, ...AI_MODEL_CHAIN.filter((m) => m !== requestedModel)];

  for (const model of models) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...payload, model }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content;
          if (content) return content as string;
          console.error(`[${label}] empty AI content (${model}), retrying`);
        } else {
          const body = await res.text();
          if (res.status === 402) {
            AI_CREDITS_EXHAUSTED = true;
            console.error(`[${label}] AI credits exhausted (402). Aborting AI usage for this run.`);
            return null;
          }
          if (res.status === 429 || res.status >= 500) {
            const wait = Math.min(20000, 1500 * Math.pow(2, attempt - 1));
            console.error(`[${label}] AI ${res.status} on ${model} (attempt ${attempt}/${attempts}) — waiting ${wait}ms`);
            await sleep(wait);
            continue;
          }
          console.error(`[${label}] AI ${res.status} on ${model}: ${body.slice(0, 300)}`);
          break; // non-retryable for this model — try next model
        }
      } catch (err) {
        clearTimeout(timer);
        const wait = Math.min(20000, 1500 * Math.pow(2, attempt - 1));
        console.error(`[${label}] AI network error on ${model} (attempt ${attempt}/${attempts}):`, err instanceof Error ? err.message : err);
        await sleep(wait);
      }
    }
    console.error(`[${label}] falling back from ${model}`);
  }

  return null;
}

async function legacyValidateImageUrl(url: string, timeoutMs = 5000): Promise<boolean> {
  if (!url) return false;
  if (url.startsWith('data:')) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return false;
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    // Reject tiny tracker/icon images (< 8KB)
    if (len > 0 && len < 8000) return false;
    return true;
  } catch {
    return false;
  }
}

// Use Gemini to extract the main entity (game / franchise / characters)
// from the article so we can search images that truly match the topic.
async function extractTopicEntity(
  item: { title: string; description: string; content: string },
  lovableKey: string
): Promise<TopicEntity | null> {
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'Extract the main video game / franchise from the text. Respond ONLY with compact JSON: {"gameTitle":"...","franchise":"...","characters":["..."],"studio":"...","keywords":["..."]}. If nothing identifiable, return {"gameTitle":""}.',
          },
          {
            role: 'user',
            content: `Title: ${item.title}\nDescription: ${item.description}\nContent:\n${(item.content || '').slice(0, 1800)}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content;
    if (!txt) return null;
    const parsed = JSON.parse(cleanAiJsonResponse(txt));
    if (!parsed?.gameTitle) return null;
    return {
      gameTitle: String(parsed.gameTitle).trim(),
      franchise: parsed.franchise ? String(parsed.franchise).trim() : undefined,
      characters: Array.isArray(parsed.characters) ? parsed.characters.slice(0, 6).map(String) : [],
      studio: parsed.studio ? String(parsed.studio).trim() : undefined,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8).map(String) : [],
    };
  } catch (err) {
    console.error('extractTopicEntity error:', err);
    return null;
  }
}

// Search Firecrawl /v1/search with scrape so we get images from each result.
async function searchImagesFor(
  query: string,
  firecrawlKey: string,
  limit = 4
): Promise<string[]> {
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ['html'] },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) return [];

    const collected: string[] = [];
    for (const r of data.data) {
      const ogImage = r.metadata?.ogImage;
      if (ogImage && !isLikelyLogo(ogImage)) collected.push(ogImage);
      const imgs = extractAllImages(r.html || '', r.markdown || '');
      for (const u of imgs) collected.push(u);
    }
    // Prefer trusted-domain images first
    const trusted = collected.filter(isTrustedImageDomain);
    const others = collected.filter((u) => !isTrustedImageDomain(u));
    const out: string[] = [];
    const seen = new Set<string>();
    for (const u of [...trusted, ...others]) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    return out.slice(0, 12);
  } catch (err) {
    console.error('searchImagesFor error:', err);
    return [];
  }
}

// Generate an AI image as final fallback, upload to the 'uploads' bucket,
// and return the public URL. Returns null on failure.
async function generateAndUploadImage(
  prompt: string,
  lovableKey: string,
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  try {
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [
          {
            role: 'user',
            content: `Cinematic, high quality 16:9 promotional artwork. ${prompt}. Photorealistic gaming key art style. No text, no watermarks.`,
          },
        ],
        modalities: ['image', 'text'],
      }),
    });
    if (!res.ok) {
      console.error('AI image generation failed:', res.status);
      return null;
    }
    const data = await res.json();
    // Extract data URL from the response
    const msg = data.choices?.[0]?.message;
    let dataUrl: string | null = null;
    if (typeof msg?.content === 'string' && msg.content.startsWith('data:image/')) {
      dataUrl = msg.content;
    } else if (Array.isArray(msg?.content)) {
      for (const part of msg.content) {
        if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:image/')) {
          dataUrl = part.image_url.url;
          break;
        }
      }
    } else if (msg?.images?.[0]?.image_url?.url?.startsWith('data:image/')) {
      dataUrl = msg.images[0].image_url.url;
    }
    if (!dataUrl) return null;

    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return null;
    const mime = match[1];
    const ext = mime.split('/')[1] || 'png';
    const b64 = match[2];
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `ai-generated/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('uploads').upload(path, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (uploadErr) {
      console.error('Upload AI image error:', uploadErr);
      return null;
    }
    const { data: pub } = supabase.storage.from('uploads').getPublicUrl(path);
    return pub.publicUrl;
  } catch (err) {
    console.error('generateAndUploadImage error:', err);
    return null;
  }
}

// Orchestrator: ensure item has enough relevant images.
async function enrichImagePool(
  item: NewsItem,
  firecrawlKey: string,
  lovableKey: string,
  supabase: ReturnType<typeof createClient>,
  minImages = 5
): Promise<void> {
  await runImagePipeline(item, firecrawlKey, lovableKey, supabase, minImages);
}

// =====================================================================
// PROFESSIONAL IMAGE PIPELINE
// RAWG -> IGDB -> Steam -> MobyGames -> GiantBomb -> Firecrawl(Bing/Google)
// + Gemini Vision validation + categorization + bucket upload
// =====================================================================

const OFFICIAL_DOMAINS_BONUS = [
  'steamstatic', 'steampowered', 'akamai.steamstatic',
  'igdb.com', 'rawg.io', 'media.rawg.io',
  'mobygames.com', 'giantbomb.com',
  'blog.playstation', 'news.xbox', 'nintendo.com', 'epicgames.com',
];

function slugForUpload(s: string): string {
  return (s || 'post')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'post';
}

async function shortHash(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(digest)).slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function categorizeFromUrl(url: string, alt = ''): ImageCategory {
  const s = (url + ' ' + alt).toLowerCase();
  if (/combat|battle|fight|attack/.test(s)) return 'combat';
  if (/boss/.test(s)) return 'boss';
  if (/cutscene|cinematic|cinema/.test(s)) return 'cutscene';
  if (/character|protagonist|hero|villain|portrait/.test(s)) return 'character';
  if (/world|map|landscape|open[-_]?world/.test(s)) return 'world';
  if (/environment|scenery|forest|city|town|biome/.test(s)) return 'environment';
  if (/ui|hud|menu|interface|inventory/.test(s)) return 'ui';
  if (/key[-_ ]?art|cover|poster|promo|wallpaper|header/.test(s)) return 'promo';
  return 'other';
}

function scoreCandidate(url: string, entity: TopicEntity | undefined, source: string): number {
  let score = 0;
  const lowered = url.toLowerCase();
  if (entity?.gameTitle) {
    const slug = entity.gameTitle.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (slug && lowered.replace(/[^a-z0-9]/g, '').includes(slug)) score += 40;
  }
  if (entity?.franchise) {
    const slug = entity.franchise.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (slug && lowered.replace(/[^a-z0-9]/g, '').includes(slug)) score += 20;
  }
  for (const c of entity?.characters || []) {
    const slug = c.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (slug && lowered.replace(/[^a-z0-9]/g, '').includes(slug)) { score += 15; break; }
  }
  if (OFFICIAL_DOMAINS_BONUS.some((d) => lowered.includes(d))) score += 25;
  if (['rawg', 'igdb', 'steam', 'mobygames', 'giantbomb'].includes(source)) score += 30;
  return score;
}

async function safeFetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<any | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const r = await fetch(url, { ...init, signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchSteamImages(game: string): Promise<string[]> {
  if (!game) return [];
  const search = await safeFetchJson(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(game)}&l=en&cc=us`
  );
  const appid = search?.items?.[0]?.id;
  if (!appid) return [];
  const det = await safeFetchJson(
    `https://store.steampowered.com/api/appdetails?appids=${appid}&l=en`
  );
  const data = det?.[String(appid)]?.data;
  if (!data) return [];
  const urls: string[] = [];
  if (data.header_image) urls.push(data.header_image);
  if (data.background_raw) urls.push(data.background_raw);
  for (const ss of (data.screenshots || [])) {
    if (ss.path_full) urls.push(ss.path_full);
  }
  return urls;
}

async function fetchRawgImages(game: string): Promise<string[]> {
  const key = Deno.env.get('RAWG_API_KEY');
  if (!key || !game) return [];
  const search = await safeFetchJson(
    `https://api.rawg.io/api/games?key=${key}&search=${encodeURIComponent(game)}&page_size=1`
  );
  const g = search?.results?.[0];
  if (!g?.id) return [];
  const urls: string[] = [];
  if (g.background_image) urls.push(g.background_image);
  if (g.background_image_additional) urls.push(g.background_image_additional);
  const ss = await safeFetchJson(`https://api.rawg.io/api/games/${g.id}/screenshots?key=${key}`);
  for (const s of (ss?.results || [])) if (s.image) urls.push(s.image);
  return urls;
}

let igdbTokenCache: { token: string; exp: number } | null = null;
async function getIgdbToken(): Promise<{ id: string; token: string } | null> {
  const id = Deno.env.get('TWITCH_CLIENT_ID');
  const secret = Deno.env.get('TWITCH_CLIENT_SECRET');
  if (!id || !secret) return null;
  if (igdbTokenCache && Date.now() < igdbTokenCache.exp) return { id, token: igdbTokenCache.token };
  const r = await safeFetchJson(
    `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!r?.access_token) return null;
  igdbTokenCache = { token: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 };
  return { id, token: r.access_token };
}

async function fetchIgdbImages(game: string): Promise<string[]> {
  const cred = await getIgdbToken();
  if (!cred || !game) return [];
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 8000);
    const r = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': cred.id,
        'Authorization': `Bearer ${cred.token}`,
        'Content-Type': 'text/plain',
      },
      body: `search "${game.replace(/"/g, '')}"; fields name,cover.image_id,screenshots.image_id,artworks.image_id; limit 1;`,
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok) return [];
    const arr = await r.json();
    const g = arr?.[0];
    if (!g) return [];
    const urls: string[] = [];
    if (g.cover?.image_id) urls.push(`https://images.igdb.com/igdb/image/upload/t_1080p/${g.cover.image_id}.jpg`);
    for (const s of (g.screenshots || [])) urls.push(`https://images.igdb.com/igdb/image/upload/t_1080p/${s.image_id}.jpg`);
    for (const a of (g.artworks || [])) urls.push(`https://images.igdb.com/igdb/image/upload/t_1080p/${a.image_id}.jpg`);
    return urls;
  } catch { return []; }
}

async function fetchMobyGamesImages(game: string): Promise<string[]> {
  const key = Deno.env.get('MOBYGAMES_API_KEY');
  if (!key || !game) return [];
  const s = await safeFetchJson(`https://api.mobygames.com/v1/games?api_key=${key}&title=${encodeURIComponent(game)}&limit=1`);
  const gid = s?.games?.[0]?.game_id;
  if (!gid) return [];
  const ss = await safeFetchJson(`https://api.mobygames.com/v1/games/${gid}/screenshots?api_key=${key}`);
  return (ss?.screenshots || []).map((x: any) => x.image).filter(Boolean);
}

async function fetchGiantBombImages(game: string): Promise<string[]> {
  const key = Deno.env.get('GIANTBOMB_API_KEY');
  if (!key || !game) return [];
  const s = await safeFetchJson(
    `https://www.giantbomb.com/api/search/?api_key=${key}&format=json&query=${encodeURIComponent(game)}&resources=game&limit=1`,
    { headers: { 'User-Agent': 'ImperioGamers/1.0' } }
  );
  const g = s?.results?.[0];
  if (!g) return [];
  const urls: string[] = [];
  if (g.image?.super_url) urls.push(g.image.super_url);
  if (g.image?.original_url) urls.push(g.image.original_url);
  return urls;
}

async function validateImageWithVision(
  url: string,
  entity: TopicEntity | undefined,
  lovableKey: string
): Promise<{ match: boolean; confidence: number; category: ImageCategory } | null> {
  if (!entity?.gameTitle) return null;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12000);
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${lovableKey}`, 'Content-Type': 'application/json' },
      signal: c.signal,
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Esta imagem é claramente do jogo "${entity.gameTitle}"${entity.franchise ? ` (franquia ${entity.franchise})` : ''}? Procure logo, HUD, personagens, estilo visual. Responda APENAS JSON: {"match":true|false,"confidence":0-100,"category":"combat|world|character|cutscene|ui|environment|boss|cinematic|promo|other"}` },
            { type: 'image_url', image_url: { url } },
          ],
        }],
      }),
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json();
    const txt = d.choices?.[0]?.message?.content;
    if (!txt) return null;
    const p = JSON.parse(cleanAiJsonResponse(txt));
    return {
      match: !!p.match,
      confidence: Number(p.confidence) || 0,
      category: (p.category as ImageCategory) || 'other',
    };
  } catch { return null; }
}

async function downloadAndStoreImage(
  url: string,
  supabase: ReturnType<typeof createClient>,
  titleHint: string,
  category: ImageCategory
): Promise<string | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 10000);
    const r = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    if (!ct.startsWith('image/')) return null;
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength < 8000) return null;
    const slug = slugForUpload(titleHint);
    const h = await shortHash(url);
    const path = `articles/${slug}/${category}-${h}.${ext}`;
    const up = await supabase.storage.from('uploads').upload(path, buf, { contentType: ct, upsert: true });
    if (up.error) { console.error('upload error', up.error); return null; }
    const pub = supabase.storage.from('uploads').getPublicUrl(path);
    return pub.data?.publicUrl || null;
  } catch (e) { console.error('downloadAndStoreImage', e); return null; }
}

async function collectCandidates(
  item: NewsItem,
  firecrawlKey: string
): Promise<Array<{ url: string; source: string }>> {
  const game = item.entity?.gameTitle || item.title;
  const out: Array<{ url: string; source: string }> = [];
  const push = (urls: string[], src: string) => {
    for (const u of urls) if (u && !isLikelyLogo(u)) out.push({ url: u, source: src });
  };

  // Existing scraped images (lowest priority but free)
  push(item.imageUrls || [], 'source');

  // Parallel calls to official sources
  const [steam, rawg, igdb, moby, gb] = await Promise.all([
    fetchSteamImages(game).catch(() => []),
    fetchRawgImages(game).catch(() => []),
    fetchIgdbImages(game).catch(() => []),
    fetchMobyGamesImages(game).catch(() => []),
    fetchGiantBombImages(game).catch(() => []),
  ]);
  push(steam, 'steam');
  push(rawg, 'rawg');
  push(igdb, 'igdb');
  push(moby, 'mobygames');
  push(gb, 'giantbomb');

  // Firecrawl fallback if pool is small
  if (out.length < 8 && firecrawlKey) {
    const queries = [
      `"${game}" official key art screenshot`,
      `"${game}" gameplay screenshot 4k`,
      `"${game}" cinematic cutscene`,
    ];
    for (const q of queries) {
      const found = await searchImagesFor(q, firecrawlKey).catch(() => [] as string[]);
      push(found, 'firecrawl');
      if (out.length >= 12) break;
    }
  }

  // Dedupe
  const seen = new Set<string>();
  return out.filter(({ url }) => {
    const k = url.split('?')[0];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function runImagePipeline(
  item: NewsItem,
  firecrawlKey: string,
  lovableKey: string,
  supabase: ReturnType<typeof createClient>,
  minImages: number
): Promise<void> {
  // 1) Collect from all sources in parallel
  const candidates = await collectCandidates(item, firecrawlKey);

  // 2) Score + technical filter
  const scored: ImageMeta[] = [];
  for (const cand of candidates) {
    if (isLikelyLogo(cand.url)) continue;
    const trusted = isTrustedImageDomain(cand.url) ||
      ['steam', 'rawg', 'igdb', 'mobygames', 'giantbomb'].includes(cand.source);
    const ok = trusted ? true : await validateImageUrl(cand.url);
    if (!ok) continue;
    const score = scoreCandidate(cand.url, item.entity, cand.source);
    if (score < 25) continue;
    scored.push({
      url: cand.url,
      category: categorizeFromUrl(cand.url),
      score,
      source: cand.source,
      validated: false,
    });
    if (scored.length >= 24) break;
  }
  scored.sort((a, b) => b.score - a.score);

  // 3) Vision-validate the top candidate (cover) — try top 3 until we get a valid one
  let cover: ImageMeta | null = null;
  if (item.entity?.gameTitle) {
    for (const cand of scored.slice(0, 3)) {
      const v = await validateImageWithVision(cand.url, item.entity, lovableKey);
      if (v && v.match && v.confidence >= 65) {
        cand.validated = true;
        cand.category = v.category;
        cand.score += v.confidence;
        cover = cand;
        break;
      }
    }
  }
  if (!cover) cover = scored[0] || null;

  // 4) AI fallback for cover if everything failed
  if (!cover) {
    const aiUrl = await generateAndUploadImage(
      `Promotional artwork for the video game "${item.entity?.gameTitle || item.title}". Dramatic lighting, epic composition, cinematic.`,
      lovableKey,
      supabase,
    );
    if (aiUrl) {
      cover = { url: aiUrl, category: 'promo', score: 60, source: 'ai', validated: true };
    }
  }

  // 5) Download cover + top N internal images to our bucket
  const finalMeta: ImageMeta[] = [];
  if (cover) {
    const hosted = cover.source === 'ai' ? cover.url : await downloadAndStoreImage(cover.url, supabase, item.title, cover.category);
    if (hosted) finalMeta.push({ ...cover, url: hosted });
    else finalMeta.push(cover); // fallback to original URL
  }

  const wantInternal = Math.max(0, minImages - 1);
  const internalPool = scored.filter((m) => m.url !== cover?.url).slice(0, wantInternal + 4);
  for (const m of internalPool) {
    if (finalMeta.length >= minImages) break;
    const hosted = await downloadAndStoreImage(m.url, supabase, item.title, m.category);
    if (hosted) finalMeta.push({ ...m, url: hosted });
  }

  // 6) Distribute categories across review sections (categorize any "other" by position)
  item.imageMeta = finalMeta;
  item.imageUrls = finalMeta.map((m) => m.url);
}

// =====================================================================
// END IMAGE ENRICHMENT PIPELINE
// =====================================================================

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
    curiogame: ['curiosidade', 'segredo', 'easter', 'egg', 'fato', 'curioso'],
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
  // Use a richer image pool for review sections (capa + 5 internas).
  // Prefer category-aware selection when imageMeta is available.
  const pool: ImageMeta[] = (item.imageMeta || []).slice(1); // skip cover
  const fallbackGallery = item.imageUrls.slice(1, 7);
  const used = new Set<string>();
  const pick = (prefs: ImageCategory[]): string | undefined => {
    for (const p of prefs) {
      const hit = pool.find((m) => !used.has(m.url) && m.category === p);
      if (hit) { used.add(hit.url); return hit.url; }
    }
    const any = pool.find((m) => !used.has(m.url));
    if (any) { used.add(any.url); return any.url; }
    const fb = fallbackGallery.find((u) => !used.has(u));
    if (fb) { used.add(fb); return fb; }
    return undefined;
  };
  const galleryImages = [
    pick(['character', 'promo']),
    pick(['environment', 'world']),
    pick(['cutscene', 'character']),
    pick(['combat', 'boss']),
    pick(['cinematic', 'world']),
    pick(['promo', 'cinematic']),
  ];

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
  if (galleryImages[4]) {
    htmlParts.push(`<figure style="margin:1.5rem 0;"><img src="${galleryImages[4]}" alt="${escapeHtml(title)}" style="width:100%;height:auto;border-radius:0.5rem;" loading="lazy" /></figure>`);
  }
  htmlParts.push('<h2>🔥 Veredicto Final</h2>');
  if (galleryImages[5]) {
    htmlParts.push(`<figure style="margin:1.5rem 0;"><img src="${galleryImages[5]}" alt="${escapeHtml(title)}" style="width:100%;height:auto;border-radius:0.5rem;" loading="lazy" /></figure>`);
  }
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
  if (item.contentType === 'curiogame') {
    return [
      {
        role: 'system',
        content: `Você é o redator-chefe da seção "CurioGame" do portal Império Gamers — uma seção viral sobre curiosidades, bastidores, polêmicas, easter eggs, bugs lendários, jogos cancelados e fatos bizarros da história dos games. Tom divertido, envolvente, mistério controlado, linguagem gamer brasileira, altamente compartilhável.

REGRAS:
- Título chamativo e curioso, até 90 caracteres (pode usar emoji)
- Descrição instigante até 200 caracteres
- 5 intertítulos: gancho, contexto histórico, a curiosidade em si, reação da comunidade, conclusão divertida
- 5 parágrafos médios (90 a 160 palavras), um por intertítulo
- Nunca cite a fonte original. Não use HTML/markdown na resposta.
- Mantenha sempre 100% factual; se for lenda, deixe claro como lenda.

Responda APENAS em JSON válido:
{
  "title": "...",
  "description": "...",
  "headlines": ["...","...","...","...","..."],
  "paragraphs": ["...","...","...","...","..."]
}`,
      },
      {
        role: 'user',
        content: `Crie uma curiosidade CurioGame original sobre este tema:\n\n${item.title}\n\nContexto/pauta detalhada:\n${item.content.slice(0, 2500)}`,
      },
    ];
  }

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

function buildCurioGameContent(parsed: Record<string, unknown>, item: NewsItem) {
  const title = asText(parsed.title, item.title).slice(0, 90);
  const description = asText(parsed.description, item.description || '').slice(0, 200);
  const headlines = asList(parsed.headlines, 5);
  const paragraphs = asList(parsed.paragraphs, 5);
  if (paragraphs.length === 0) throw new Error('CurioGame AI returned no paragraphs');
  while (paragraphs.length < 5) paragraphs.push(paragraphs[paragraphs.length - 1]);
  const galleryImages = item.imageUrls.slice(1, 6);

  const htmlParts: string[] = [
    `<p><span style="display:inline-block;padding:4px 12px;border-radius:9999px;background:#7c3aed;color:#fff;font-weight:700;font-size:0.8rem;">🎮 CurioGame</span></p>`,
  ];
  for (let i = 0; i < paragraphs.length; i++) {
    if (headlines[i]) htmlParts.push(`<h2>${escapeHtml(headlines[i])}</h2>`);
    htmlParts.push(`<p>${escapeHtml(paragraphs[i])}</p>`);
    const img = galleryImages[i];
    if (img) {
      htmlParts.push(`<figure style="margin:1.5rem 0;"><img src="${img}" alt="${escapeHtml(title)}" style="width:100%;height:auto;border-radius:0.5rem;" loading="lazy" /></figure>`);
    }
  }
  htmlParts.push('<p><em>Gostou desta curiosidade? Compartilhe com a galera gamer e fique de olho na seção CurioGame do Império Gamers!</em></p>');

  return { title, description, content: htmlParts.join('\n') };
}

// Generate a CurioGame topic via AI (no scraping needed).
async function generateCurioGameTopic(
  lovableKey: string,
  recentTitles: string[]
): Promise<NewsItem | null> {
  try {
    const avoid = recentTitles.slice(0, 30).join(' | ');
    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'Você é editor de uma seção gamer de curiosidades. Sugira UMA pauta inédita e factual sobre curiosidades, bastidores, polêmicas, easter eggs, bugs lendários, jogos cancelados, lendas urbanas, censuras ou fracassos icônicos dos videogames. Responda APENAS em JSON: {"topic":"título curto da curiosidade","game":"jogo/franquia central","briefing":"3-5 parágrafos descrevendo fatos verídicos para o redator usar"}.',
          },
          {
            role: 'user',
            content: `Evite repetir estes temas já publicados: ${avoid}\n\nGere agora uma nova pauta surpreendente.`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const txt = data.choices?.[0]?.message?.content;
    if (!txt) return null;
    const parsed = JSON.parse(cleanAiJsonResponse(txt));
    if (!parsed?.topic || !parsed?.briefing) return null;
    return {
      title: String(parsed.topic).trim(),
      description: String(parsed.briefing).slice(0, 200),
      content: String(parsed.briefing),
      imageUrls: [],
      sourceUrl: `curiogame://${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sourceSite: 'curiogame-ai',
      contentType: 'curiogame',
      entity: { gameTitle: String(parsed.game || parsed.topic).trim() },
    };
  } catch (err) {
    console.error('generateCurioGameTopic error:', err);
    return null;
  }
}

const SITE_URL = 'https://imperiogamer1.vercel.app';

function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function crossPostToFacebook(post: {
  title: string;
  description: string;
  slug: string;
  contentType: string;
  content?: string;
  images?: string[];
  mode?: 'card' | 'full';
}): Promise<void> {
  const path = post.contentType === 'trailer' ? 'trailer' : 'artigo';
  const link = `${SITE_URL}/${path}/${post.slug}`;
  const tags: Record<string, string> = {
    news: '#noticias #games',
    review: '#review #analise #games',
    trailer: '#trailer #games',
    curiogame: '#curiogame #curiosidades #games',
  };
  const tagLine = `${tags[post.contentType] || '#games'} #ImperioGamers`;
  // Rule: trailers go as a link card only (no link in the caption — the card is clickable).
  // News, reviews and curiogame always go with the full text plus every photo.
  const mode: 'card' | 'full' = post.contentType === 'trailer' ? 'card' : 'full';
  const images = (post.images || []).filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 10);

  const message =
    mode === 'full'
      ? [post.title, post.description, htmlToPlainText(post.content || ''), tagLine]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 60000)
      : `${post.title}\n\n${post.description}\n\n${tagLine}`;

  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/publish-facebook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({
        message,
        link: mode === 'card' ? link : undefined,
        title: post.title,
        mode,
        images: mode === 'full' ? images : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Facebook cross-post failed:', JSON.stringify(data));
    } else {
      console.log('Facebook cross-post ok:', data.post_id);
    }
  } catch (err) {
    console.error('Facebook cross-post error:', err);
  }
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
    let manualRun = false;
    let explicitTypes = false;
    try {
      const body = await req.json();
      forceNew = body?.forceNew === true;
      manualRun = body?.manual === true || forceNew;
      if (body?.postsPerType && typeof body.postsPerType === 'number') {
        postsPerType = Math.min(Math.max(body.postsPerType, 1), 10); // Limita entre 1 e 10
      }
      if (body?.contentTypes && Array.isArray(body.contentTypes) && body.contentTypes.length > 0) {
        contentTypes = body.contentTypes.filter((t: string) => ['news', 'review', 'trailer', 'curiogame'].includes(t));
        explicitTypes = contentTypes.length > 0;
      }
    } catch {
      // Corpo vazio, execução automática (cron)
    }
    
    console.log('Execution mode:', forceNew ? 'MANUAL (force new)' : 'AUTOMATIC (check duplicates)');
    console.log('Posts per type:', postsPerType);
    console.log('Content types:', contentTypes);

    // Heavy pipeline runs in the background so the HTTP request returns
    // immediately (avoids client/Cloudflare timeouts on the admin UI).
    const runPipeline = async () => {

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

    // Manual runs (admin "Executar Agora") bypass the is_enabled flag
    if (!settings.is_enabled && !manualRun) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI auto-posting is disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- Scheduling (automatic runs only) --------------------------------
    // The cron pings this function every few minutes; we only run when the
    // current Angola time matches one of the admin-defined schedule_times.
    if (!manualRun) {
      const times = Array.isArray(settings.schedule_times) ? (settings.schedule_times as string[]) : [];
      const nowLuanda = new Date(Date.now() + 60 * 60 * 1000); // UTC+1, no DST
      const nowMinutes = nowLuanda.getUTCHours() * 60 + nowLuanda.getUTCMinutes();
      const dueSlot = times.find((t) => {
        const [h, m] = String(t).split(':').map((n) => parseInt(n, 10));
        if (Number.isNaN(h)) return false;
        const slot = h * 60 + (m || 0);
        const diff = nowMinutes - slot;
        return diff >= 0 && diff < 15; // 15-minute window after each slot
      });

      if (!dueSlot) {
        console.log(`No schedule slot due (Luanda ${nowLuanda.toISOString().slice(11, 16)}), skipping.`);
        return new Response(JSON.stringify({ success: true, skipped: 'not_scheduled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Avoid running twice in the same slot window
      if (settings.last_run_at) {
        const sinceLastRun = Date.now() - new Date(settings.last_run_at as string).getTime();
        if (sinceLastRun < 40 * 60 * 1000) {
          console.log('Already ran recently, skipping duplicate slot execution.');
          return new Response(JSON.stringify({ success: true, skipped: 'already_ran' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // Mark immediately so overlapping cron pings don't double-run
      await supabase.from('ai_settings').update({ last_run_at: new Date().toISOString() }).eq('id', settings.id);
      console.log(`Scheduled run for slot ${dueSlot} (Luanda time).`);
    }

    // Content types: automatic runs follow the admin selection saved in settings
    if (!explicitTypes) {
      const saved = Array.isArray((settings as Record<string, unknown>).content_types)
        ? ((settings as Record<string, unknown>).content_types as string[]).filter((t) =>
            ['news', 'review', 'trailer', 'curiogame'].includes(t),
          )
        : [];
      contentTypes = saved.length > 0 ? saved : ['news', 'review', 'trailer', 'curiogame'];
      console.log('Content types from settings:', contentTypes);
    }

    const sourceSites = settings.source_sites as string[];
    const youtubeChannels = settings.youtube_channels as string[];
    
    console.log('Starting AI auto-post for sites:', sourceSites);

    const newsItems: NewsItem[] = [];

    // Skip site scraping entirely if only curiogame is requested
    const needsScraping = contentTypes.some((t) => ['news', 'review'].includes(t));

    // Scrape each source site for latest news
    if (needsScraping) for (const site of sourceSites) {
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
              const topicImages = rankImagesByTopic(allImages, result.title || '');
              console.log(`Found ${allImages.length} images (${topicImages.length} topic-matching) for news: ${result.title}`);
              newsItems.push({
                title: result.title || 'Untitled',
                description: result.description || '',
                content: result.markdown || result.description || '',
                imageUrls: topicImages,
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
              const topicImages = rankImagesByTopic(allImages, result.title || '');
              console.log(`Found ${allImages.length} images (${topicImages.length} topic-matching) for review: ${result.title}`);
              newsItems.push({
                title: result.title || 'Untitled',
                description: result.description || '',
                content: result.markdown || result.description || '',
                imageUrls: topicImages,
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
    if (contentTypes.includes('trailer')) for (const channel of youtubeChannels) {
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

    // Generate CurioGame topics (no scraping needed)
    if (contentTypes.includes('curiogame')) {
      console.log('Generating CurioGame topics...');
      // Pull recent curiogame titles to avoid repetition
      const { data: recentCurio } = await supabase
        .from('articles')
        .select('title')
        .eq('content_type', 'curiogame')
        .order('created_at', { ascending: false })
        .limit(30);
      const recentTitles = (recentCurio || []).map((r: { title: string }) => r.title);
      for (let i = 0; i < postsPerType * 2; i++) {
        const topic = await generateCurioGameTopic(lovableKey, recentTitles);
        if (topic) {
          newsItems.push(topic);
          recentTitles.unshift(topic.title);
        }
      }
    }

    console.log(`Found ${newsItems.length} news items (before image filter)`);

    const filteredItems = newsItems.filter(item => {
      if (item.contentType === 'trailer') {
        return item.youtubeUrl && item.youtubeUrl.length > 0;
      }
      // curiogame doesn't need pre-existing images — they get enriched later
      if (item.contentType === 'curiogame') return true;
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
    const curioOnly = contentTypes.includes('curiogame')
      ? uniqueCandidates.filter(item => item.contentType === 'curiogame')
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

    // Add up to postsPerType curiogame items (if selected)
    if (contentTypes.includes('curiogame')) {
      for (const item of curioOnly) {
        if (itemsToProcess.filter(i => i.contentType === 'curiogame').length < postsPerType) {
          itemsToProcess.push(item);
        }
      }
    }
    
    console.log(`Processing ${itemsToProcess.length} items (${postsPerType} per type): ${itemsToProcess.filter(i => i.contentType === 'news').length} news, ${itemsToProcess.filter(i => i.contentType === 'review').length} reviews, ${itemsToProcess.filter(i => i.contentType === 'trailer').length} trailers, ${itemsToProcess.filter(i => i.contentType === 'curiogame').length} curiogame`);

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

        // ===== IMAGE ENRICHMENT =====
        // Extract topic entity for better image searches (skip for trailers which use YouTube thumb)
        if (item.contentType !== 'trailer' && !item.entity) {
          item.entity = (await extractTopicEntity(item, lovableKey)) || undefined;
        }
        // Ensure we have a strong, validated image pool
        if (item.contentType !== 'trailer') {
          const minImages = item.contentType === 'review' ? 6 : item.contentType === 'curiogame' ? 6 : 3;
          await enrichImagePool(item, firecrawlKey, lovableKey, supabase, minImages);
          console.log(`Image pool for "${item.title}": ${item.imageUrls.length} images`);
        }
        // ===== END IMAGE ENRICHMENT =====

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
          : item.contentType === 'curiogame'
            ? buildCurioGameContent(parsedContent as Record<string, unknown>, item)
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

        // Cross-post to Facebook Page (if enabled)
        if ((settings as Record<string, unknown>).facebook_crosspost_enabled) {
          await crossPostToFacebook({
            title: builtContent.title,
            description: builtContent.description,
            slug: article.slug,
            contentType: item.contentType,
            content: builtContent.content,
            images: [finalCoverImage, ...item.imageUrls].filter(Boolean) as string[],
            mode:
              (settings as Record<string, unknown>).facebook_post_mode === 'full' ? 'full' : 'card',
          });
        }

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

    }; // end runPipeline

    try {
      // @ts-ignore EdgeRuntime is a Deno Deploy global
      if (typeof EdgeRuntime !== 'undefined' && typeof (EdgeRuntime as any).waitUntil === 'function') {
        // @ts-ignore
        EdgeRuntime.waitUntil(runPipeline().catch((e) => console.error('Background pipeline error:', e)));
      } else {
        runPipeline().catch((e) => console.error('Background pipeline error:', e));
      }
    } catch (bgErr) {
      console.error('Failed to schedule background pipeline:', bgErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        message: `Geração iniciada em segundo plano (${contentTypes.join(', ')} · ${postsPerType} por tipo). Acompanhe no histórico.`,
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI auto-post error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
