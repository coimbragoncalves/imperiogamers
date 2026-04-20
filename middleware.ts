import { next, rewrite } from '@vercel/edge';

export const config = {
  matcher: ['/artigo/:path*', '/trailer/:path*', '/noticia/:path*', '/api/og-debug'],
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
  const url = new URL(request.url);

  if (url.pathname === '/api/og-debug') {
    const slug = url.searchParams.get('slug')?.trim();
    const rawType = url.searchParams.get('type')?.trim() || 'noticia';
    const lookupType = rawType === 'trailer' ? 'trailer' : 'artigo';

    if (!slug) {
      return new Response(JSON.stringify({ error: 'slug is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });
    }

    const debugUrl = new URL(
      `https://iflugdkucuitrflrgldq.supabase.co/functions/v1/og-image/${lookupType}/${encodeURIComponent(slug)}`
    );
    debugUrl.searchParams.set('debug', '1');
    debugUrl.searchParams.set('pathType', rawType);
    debugUrl.searchParams.set('originalUrl', `${url.origin}/${rawType}/${slug}`);

    return rewrite(debugUrl.toString());
  }

  if (!isCrawler(userAgent)) {
    return next();
  }

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

  const originalUrl = `${url.origin}${url.pathname}${url.search}`;
  const ogUrl = new URL(
    `https://iflugdkucuitrflrgldq.supabase.co/functions/v1/og-image/${type}/${encodeURIComponent(slug)}`
  );
  ogUrl.searchParams.set('pathType', rawType);
  ogUrl.searchParams.set('originalUrl', originalUrl);

  return rewrite(ogUrl.toString());
}
