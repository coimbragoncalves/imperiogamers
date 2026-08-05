import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { FacebookError, FRIENDLY_ERROR, graphFetch } from '../_shared/facebook.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth: internal calls use the service role key; admins use their session JWT.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!bearer) return json({ error: 'Não autenticado' }, 401);
  if (bearer !== SERVICE_ROLE) {
    const { data: userData, error: userError } = await admin.auth.getUser(bearer);
    if (userError || !userData.user) return json({ error: 'Sessão inválida' }, 401);
    const { data: role } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) return json({ error: 'Acesso restrito a administradores' }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corpo inválido' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const link = typeof body.link === 'string' && body.link.startsWith('http') ? body.link : undefined;
  const title = typeof body.title === 'string' ? body.title.slice(0, 200) : null;

  if (!message || message.length > 60000) {
    return json({ error: 'message obrigatório (até 60000 caracteres)' }, 400);
  }

  // Optional: callers may pass a user JWT; otherwise use the single active connection.
  const { data: connection } = await admin
    .from('facebook_connections')
    .select('id, page_id, page_name, access_token')
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) {
    return json({ error: 'Nenhuma Página do Facebook conectada.', kind: 'not_connected' }, 400);
  }

  try {
    const result = await graphFetch<{ id: string }>(`/${connection.page_id}/feed`, {
      method: 'POST',
      body: { message, ...(link ? { link } : {}), access_token: connection.access_token },
    });

    await admin
      .from('facebook_connections')
      .update({
        last_published_at: new Date().toISOString(),
        last_published_title: title,
        last_error: null,
        status: 'connected',
      })
      .eq('id', connection.id);

    return json({ ok: true, post_id: result.id });
  } catch (err) {
    const kind = err instanceof FacebookError ? err.kind : 'unknown';
    const detail = err instanceof Error ? err.message : 'Erro inesperado';
    console.error('publish-facebook failed:', kind, detail);

    await admin
      .from('facebook_connections')
      .update({
        last_error: `${FRIENDLY_ERROR[kind as keyof typeof FRIENDLY_ERROR] ?? 'Falha'} (${detail})`,
        status: kind === 'token_expired' || kind === 'permissions' || kind === 'page_missing' ? 'error' : 'connected',
      })
      .eq('id', connection.id);

    return json({ error: FRIENDLY_ERROR[kind as keyof typeof FRIENDLY_ERROR] ?? detail, kind, detail }, 400);
  }
});