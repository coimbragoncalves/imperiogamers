import { next, rewrite } from '@vercel/edge';

export const config = {
  matcher: ['/artigo/:path*', '/trailer/:path*', '/noticia/:path*'],
};

const CRAWLER_USER_AGENTS = [
  'facebookexternalhit',
  'facebookcatalog',
  'facebot',
  'twitterbot',
  'whatsapp',
  'linkedinbot',
  'slackbot',
  'telegrambot',
  'discordbot',
  'applebot',
  'pinterest',
  'snapchat',
  'redditbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'vkshare',
  'w3c_validator',
  'baiduspider',
  'bingbot',
  'googlebot',
  'yandex',
  'iframely',
];

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENTS.some((bot) => ua.includes(bot));
}

export default function middleware(request: Request) {
  const userAgent = request.headers.get('user-agent');

  if (!isCrawler(userAgent)) {
    return next();
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts[0] = 'artigo' | 'trailer' | 'noticia'
  // pathParts[1...] = slug
  const rawType = pathParts[0] || 'artigo';
  const slug = pathParts.slice(1).join('/');

  if (!slug) {
    return next();
  }

  // Normalize 'noticia' -> 'artigo' for backend lookup
  const type = rawType === 'trailer' ? 'trailer' : 'artigo';

  const ogUrl = `https://iflugdkucuitrflrgldq.supabase.co/functions/v1/og-image/${type}/${encodeURIComponent(
    slug
  )}`;

  return rewrite(ogUrl);
}
