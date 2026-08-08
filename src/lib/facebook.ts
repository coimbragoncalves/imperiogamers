import { supabase } from '@/integrations/supabase/client';

const SITE_URL = 'https://imperiogamer1.vercel.app';

const TAGS: Record<string, string> = {
  news: '#noticias #games',
  review: '#review #analise #games',
  trailer: '#trailer #games',
  curiogame: '#curiogame #curiosidades #games',
};

export interface FacebookConnection {
  id: string;
  page_id: string;
  page_name: string;
  status: string;
  last_error: string | null;
  last_published_at: string | null;
  last_published_title: string | null;
  updated_at: string;
}

export async function callFacebookOAuth<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('facebook-oauth', { body: payload });
  if (error) {
    const message = (data as { error?: string } | null)?.error || error.message;
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(
    html.replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '</$1>\n\n').replace(/<br\s*\/?>/gi, '\n'),
    'text/html',
  );
  return (doc.body.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function extractImages(html: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1].startsWith('http')) urls.push(m[1]);
  }
  return urls;
}

/** Publishes an article on the connected Facebook Page. Never throws. */
export async function publishArticleToFacebook(post: {
  title: string;
  description?: string | null;
  slug: string;
  contentType: string;
}): Promise<{ ok: boolean; error?: string }> {
  const path = post.contentType === 'trailer' ? 'trailer' : 'artigo';
  const link = `${SITE_URL}/${path}/${post.slug}`;
  const tags = `${TAGS[post.contentType] || '#games'} #ImperioGamers`;

  // Rule: trailers go as a link card only (no link in the caption).
  // News, reviews and curiogame go with the full text plus every photo.
  const mode: 'card' | 'full' = post.contentType === 'trailer' ? 'card' : 'full';

  let message = [post.title, post.description || '', tags].filter(Boolean).join('\n\n');
  let images: string[] = [];

  if (mode === 'full') {
    const { data: article } = await supabase
      .from('articles')
      .select('id, content, cover_image')
      .eq('slug', post.slug)
      .maybeSingle();

    const html = article?.content ? String(article.content) : '';
    const bodyText = htmlToText(html);
    message = [post.title, post.description || '', bodyText, tags].filter(Boolean).join('\n\n').slice(0, 60000);

    const extra: string[] = [];
    if (article?.id) {
      const { data: gallery } = await supabase
        .from('article_images')
        .select('image_url, position')
        .eq('article_id', article.id)
        .order('position', { ascending: true });
      for (const g of gallery || []) if (g.image_url) extra.push(g.image_url);
    }
    images = [article?.cover_image, ...extractImages(html), ...extra]
      .filter((u): u is string => Boolean(u) && String(u).startsWith('http'))
      .filter((u, i, arr) => arr.indexOf(u) === i)
      .slice(0, 10);
  }

  try {
    const { data, error } = await supabase.functions.invoke('publish-facebook', {
      body: { message, link: mode === 'card' ? link : undefined, title: post.title, mode, images },
    });
    if (error) return { ok: false, error: (data as { error?: string } | null)?.error || error.message };
    if ((data as { error?: string })?.error) return { ok: false, error: (data as { error: string }).error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
}