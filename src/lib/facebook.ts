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
  const cta = '👉 Clica no card para terminar de ler';

  // Every post goes as a link card: cover image + summary, clickable to the site.
  const message = [post.title, post.description || '', cta, tags].filter(Boolean).join('\n\n');

  try {
    const { data, error } = await supabase.functions.invoke('publish-facebook', {
      body: { message, link, title: post.title, mode: 'card', images: [] },
    });
    if (error) return { ok: false, error: (data as { error?: string } | null)?.error || error.message };
    if ((data as { error?: string })?.error) return { ok: false, error: (data as { error: string }).error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido' };
  }
}
