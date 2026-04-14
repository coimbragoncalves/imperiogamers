import { NextRequest, NextResponse } from 'next/server';

const CRAWLER_USER_AGENTS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'WhatsApp',
  'LinkedInBot',
  'Slackbot',
  'TelegramBot',
  'Discordbot',
  'Applebot',
  'Pinterest',
  'Snapchat',
];

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return CRAWLER_USER_AGENTS.some(bot =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );
}

export const config = {
  matcher: ['/artigo/:path*', '/trailer/:path*'],
};

export default function middleware(req: NextRequest) {
  const userAgent = req.headers.get('user-agent');

  if (!isCrawler(userAgent)) {
    return NextResponse.next();
  }

  // Extract type and slug from the path
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts[0] = 'artigo' or 'trailer', pathParts[1...] = slug
  const type = pathParts[0]; // 'artigo' or 'trailer'
  const slug = pathParts.slice(1).join('/');

  // Rewrite to the Supabase edge function (invisible to user/crawler)
  const ogUrl = `https://iflugdkucuitrflrgldq.supabase.co/functions/v1/og-image/${type}/${slug}`;

  return NextResponse.rewrite(ogUrl);
}