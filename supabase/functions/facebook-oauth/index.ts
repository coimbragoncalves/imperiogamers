import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { FB_SCOPES, FacebookError, FRIENDLY_ERROR, graphFetch } from '../_shared/facebook.ts';

const APP_ID = Deno.env.get('FACEBOOK_APP_ID');
const APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Não autenticado' }, 401);

  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData.user) return json({ error: 'Sessão inválida' }, 401);

  const { data: role } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!role) return json({ error: 'Acesso restrito a administradores' }, 403);
  return { userId: userData.user.id };
}

interface FbPage {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }
  const action = String(body.action ?? '');

  try {
    // ---------- status ----------
    if (action === 'status') {
      const { data } = await admin
        .from('facebook_connections')
        .select('id, page_id, page_name, status, last_error, last_published_at, last_published_title, updated_at')
        .eq('user_id', userId)
        .eq('status', 'connected')
        .maybeSingle();
      return json({ connection: data ?? null, configured: Boolean(APP_ID && APP_SECRET) });
    }

    // ---------- disconnect ----------
    if (action === 'disconnect') {
      await admin.from('facebook_connections').delete().eq('user_id', userId);
      return json({ ok: true });
    }

    if (!APP_ID || !APP_SECRET) {
      return json({ error: 'App do Facebook não configurado no servidor (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).' }, 400);
    }

    // ---------- login url ----------
    if (action === 'login-url') {
      const redirectUri = String(body.redirect_uri ?? '');
      if (!redirectUri.startsWith('http')) return json({ error: 'redirect_uri inválido' }, 400);
      const state = crypto.randomUUID();
      const url = new URL('https://www.facebook.com/v26.0/dialog/oauth');
      url.searchParams.set('client_id', APP_ID);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', FB_SCOPES);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('state', state);
      return json({ url: url.toString(), state });
    }

    // ---------- exchange code -> long lived token -> list pages ----------
    if (action === 'exchange') {
      const code = String(body.code ?? '');
      const redirectUri = String(body.redirect_uri ?? '');
      if (!code || !redirectUri) return json({ error: 'code e redirect_uri obrigatórios' }, 400);

      const short = await graphFetch<{ access_token: string }>('/oauth/access_token', {
        query: {
          client_id: APP_ID,
          client_secret: APP_SECRET,
          redirect_uri: redirectUri,
          code,
        },
      });

      const long = await graphFetch<{ access_token: string }>('/oauth/access_token', {
        query: {
          grant_type: 'fb_exchange_token',
          client_id: APP_ID,
          client_secret: APP_SECRET,
          fb_exchange_token: short.access_token,
        },
      });

      const pages = await graphFetch<{ data: FbPage[] }>('/me/accounts', {
        query: { access_token: long.access_token, fields: 'id,name,access_token,tasks', limit: '100' },
      });

      if (!pages.data?.length) {
        return json({ error: 'Nenhuma Página encontrada nesta conta do Facebook.' }, 400);
      }

      // store page tokens server-side as pending; frontend never sees tokens
      await admin.from('facebook_connections').delete().eq('user_id', userId).eq('status', 'pending');
      const rows = pages.data.map((p) => ({
        user_id: userId,
        page_id: p.id,
        page_name: p.name,
        access_token: p.access_token,
        status: 'pending',
      }));
      const { error: upsertError } = await admin
        .from('facebook_connections')
        .upsert(rows, { onConflict: 'user_id,page_id' });
      if (upsertError) throw new Error(upsertError.message);

      return json({ pages: pages.data.map((p) => ({ id: p.id, name: p.name })) });
    }

    // ---------- select page ----------
    if (action === 'select-page') {
      const pageId = String(body.page_id ?? '');
      if (!pageId) return json({ error: 'page_id obrigatório' }, 400);

      const { data: row } = await admin
        .from('facebook_connections')
        .select('id, access_token, page_name')
        .eq('user_id', userId)
        .eq('page_id', pageId)
        .maybeSingle();

      if (!row) return json({ error: 'Página não encontrada. Reconecte o Facebook.' }, 400);

      // validate the page token before activating
      await graphFetch<{ id: string }>(`/${pageId}`, {
        query: { access_token: row.access_token, fields: 'id,name' },
      });

      await admin
        .from('facebook_connections')
        .delete()
        .eq('user_id', userId)
        .neq('page_id', pageId);

      await admin
        .from('facebook_connections')
        .update({ status: 'connected', last_error: null })
        .eq('id', row.id);

      return json({ ok: true, page: { id: pageId, name: row.page_name } });
    }

    return json({ error: 'Ação desconhecida' }, 400);
  } catch (err) {
    if (err instanceof FacebookError) {
      console.error('facebook-oauth graph error:', err.kind, err.message);
      return json({ error: FRIENDLY_ERROR[err.kind], kind: err.kind, detail: err.message }, 400);
    }
    console.error('facebook-oauth error:', err);
    return json({ error: err instanceof Error ? err.message : 'Erro inesperado' }, 500);
  }
});