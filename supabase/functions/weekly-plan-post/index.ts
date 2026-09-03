import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { FacebookError, FRIENDLY_ERROR, graphFetch } from '../_shared/facebook.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Fixed daily slots (Luanda time, UTC+1 without DST)
const SLOTS = ['09:30', '15:10', '19:20'];
const WINDOW_MINUTES = 12;
const LAST_RUN_KEY = 'weekly_plan_last_run';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function dueSlot(): string | null {
  const nowLuanda = new Date(Date.now() + 60 * 60 * 1000);
  const nowMinutes = nowLuanda.getUTCHours() * 60 + nowLuanda.getUTCMinutes();
  return (
    SLOTS.find((t) => {
      const [h, m] = t.split(':').map((n) => parseInt(n, 10));
      const diff = nowMinutes - (h * 60 + (m || 0));
      return diff >= 0 && diff < WINDOW_MINUTES;
    }) ?? null
  );
}

async function publishNextImage(): Promise<{ ok: boolean; message: string; post_id?: string }> {
  const { data: image } = await admin
    .from('weekly_plan_images')
    .select('id, image_url, caption, storage_path')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!image) return { ok: false, message: 'Plano semanal vazio — nada para publicar.' };

  let { data: connection } = await admin
    .from('facebook_connections')
    .select('id, page_id, access_token')
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connection) {
    const legacyId = Deno.env.get('FACEBOOK_PAGE_ID');
    const legacyToken = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
    if (legacyId && legacyToken) {
      connection = { id: '', page_id: legacyId, access_token: legacyToken };
    }
  }

  if (!connection) return { ok: false, message: 'Nenhuma Página do Facebook conectada.' };

  try {
    const photo = await graphFetch<{ id: string; post_id?: string }>(`/${connection.page_id}/photos`, {
      method: 'POST',
      body: {
        url: image.image_url,
        published: true,
        ...(image.caption ? { message: image.caption } : {}),
        access_token: connection.access_token,
      },
    });

    // Consume the image: remove from the plan and from storage.
    await admin.from('weekly_plan_images').delete().eq('id', image.id);
    if (image.storage_path) {
      await admin.storage.from('uploads').remove([image.storage_path]);
    }

    if (connection.id) {
      await admin
        .from('facebook_connections')
        .update({
          last_published_at: new Date().toISOString(),
          last_published_title: 'Plano semanal',
          last_error: null,
        })
        .eq('id', connection.id);
    }

    return { ok: true, message: 'Imagem publicada no Facebook.', post_id: photo.post_id || photo.id };
  } catch (err) {
    const kind = err instanceof FacebookError ? err.kind : 'unknown';
    const detail = err instanceof Error ? err.message : 'Erro inesperado';
    console.error('weekly-plan-post failed:', kind, detail);
    return {
      ok: false,
      message: `${FRIENDLY_ERROR[kind as keyof typeof FRIENDLY_ERROR] ?? 'Falha'} (${detail})`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let manual = false;
  try {
    const body = await req.json();
    manual = body?.manual === true;
  } catch {
    // cron ping (empty body)
  }

  // Manual runs must come from an admin session (or the service role key).
  if (manual) {
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

    const result = await publishNextImage();
    return json(result, result.ok ? 200 : 400);
  }

  const slot = dueSlot();
  if (!slot) return json({ success: true, skipped: 'not_scheduled' });

  // Avoid publishing twice inside the same slot window
  const { data: lastRun } = await admin
    .from('site_settings')
    .select('id, value')
    .eq('key', LAST_RUN_KEY)
    .maybeSingle();

  if (lastRun?.value) {
    const since = Date.now() - new Date(lastRun.value).getTime();
    if (since < 60 * 60 * 1000) return json({ success: true, skipped: 'already_ran' });
  }

  const stamp = new Date().toISOString();
  if (lastRun?.id) {
    await admin.from('site_settings').update({ value: stamp, updated_at: stamp }).eq('id', lastRun.id);
  } else {
    await admin.from('site_settings').insert({ key: LAST_RUN_KEY, value: stamp });
  }

  const result = await publishNextImage();
  console.log(`weekly-plan slot ${slot}:`, result.message);
  return json({ success: result.ok, slot, ...result });
});
