import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { FacebookError, FRIENDLY_ERROR, graphFetch } from '../_shared/facebook.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// Daily slots (Luanda time, UTC+1 without DST) — configurable by the admin.
const DEFAULT_SLOTS = ['09:30', '15:10', '19:20'];
const WINDOW_MINUTES = 20;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getSlots(): Promise<string[]> {
  const { data } = await admin
    .from('weekly_plan_settings')
    .select('slot_1, slot_2, slot_3')
    .limit(1)
    .maybeSingle();
  return data ? [data.slot_1, data.slot_2, data.slot_3] : DEFAULT_SLOTS;
}

function dueSlot(SLOTS: string[]): string | null {
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

async function getConnection() {
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
  return connection;
}

async function markPublished(connectionId: string, title: string) {
  if (!connectionId) return;
  await admin
    .from('facebook_connections')
    .update({
      last_published_at: new Date().toISOString(),
      last_published_title: title,
      last_error: null,
    })
    .eq('id', connectionId);
}

function failure(err: unknown, label: string) {
  const kind = err instanceof FacebookError ? err.kind : 'unknown';
  const detail = err instanceof Error ? err.message : 'Erro inesperado';
  console.error(`weekly-plan-post ${label} failed:`, kind, detail);
  return {
    ok: false,
    message: `${FRIENDLY_ERROR[kind as keyof typeof FRIENDLY_ERROR] ?? 'Falha'} (${detail})`,
  };
}

async function publishNextReel(): Promise<{ ok: boolean; message: string; post_id?: string }> {
  const { data: reel } = await admin
    .from('weekly_plan_reels')
    .select('id, video_url, caption, storage_path')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!reel) return { ok: false, message: 'Nenhum reel na fila — nada para publicar.' };

  const connection = await getConnection();
  if (!connection) return { ok: false, message: 'Nenhuma Página do Facebook conectada.' };

  try {
    // 1) Start an upload session for the reel.
    const start = await graphFetch<{ video_id: string; upload_url: string }>(
      `/${connection.page_id}/video_reels`,
      { method: 'POST', body: { upload_phase: 'start', access_token: connection.access_token } },
    );

    // 2) Ask Facebook to fetch the hosted file.
    const upload = await fetch(`https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${start.video_id}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${connection.access_token}`,
        file_url: reel.video_url,
      },
    });
    const uploadBody = await upload.json().catch(() => ({}));
    if (!upload.ok || (uploadBody as { success?: boolean }).success === false) {
      throw new FacebookError(
        (uploadBody as { error?: { message: string } }).error ?? `Falha no upload do vídeo (HTTP ${upload.status})`,
      );
    }

    // 3) Publish it.
    await graphFetch(`/${connection.page_id}/video_reels`, {
      method: 'POST',
      query: {
        upload_phase: 'finish',
        video_id: start.video_id,
        video_state: 'PUBLISHED',
        ...(reel.caption ? { description: reel.caption } : {}),
        access_token: connection.access_token,
      },
    });

    await admin.from('weekly_plan_reels').delete().eq('id', reel.id);
    if (reel.storage_path) await admin.storage.from('uploads').remove([reel.storage_path]);
    await markPublished(connection.id, 'Plano semanal (Reel)');

    return { ok: true, message: 'Reel publicado no Facebook.', post_id: start.video_id };
  } catch (err) {
    return failure(err, 'reel');
  }
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

  const connection = await getConnection();
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

    await markPublished(connection.id, 'Plano semanal');

    return { ok: true, message: 'Imagem publicada no Facebook.', post_id: photo.post_id || photo.id };
  } catch (err) {
    return failure(err, 'image');
  }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let manual = false;
  let kind = 'image';
  try {
    const body = await req.json();
    manual = body?.manual === true;
    if (body?.kind === 'reel') kind = 'reel';
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

    const result = kind === 'reel' ? await publishNextReel() : await publishNextImage();
    return json(result, result.ok ? 200 : 400);
  }

  // Scheduled invocation: three exact daily jobs (09:30, 15:10, 19:20 Luanda).
  const slot = dueSlot(await getSlots());
  if (!slot) console.log('Invoked outside the expected slots; publishing anyway.');

  const image = await publishNextImage();
  const reel = await publishNextReel();
  console.log(`weekly-plan slot ${slot ?? 'manual-cron'}:`, image.message, '|', reel.message);
  return json({ success: image.ok || reel.ok, slot, image, reel });

});
