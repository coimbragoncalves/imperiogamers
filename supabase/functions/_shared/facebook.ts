// Shared Facebook Graph API helpers (backend only)
export const GRAPH_VERSION = 'v26.0';
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const FB_SCOPES = [
  'pages_manage_posts',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_engagement',
].join(',');

export interface GraphError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
}

export type FacebookErrorKind =
  | 'token_expired'
  | 'permissions'
  | 'page_missing'
  | 'publish_failed'
  | 'unknown';

function classify(err: GraphError): FacebookErrorKind {
  const msg = (err.message || '').toLowerCase();
  if (err.code === 190 || msg.includes('session has expired') || msg.includes('access token')) {
    return 'token_expired';
  }
  if (err.code === 200 || err.code === 10 || err.code === 3 || msg.includes('permission')) {
    return 'permissions';
  }
  if (err.code === 803 || msg.includes('does not exist') || msg.includes('unsupported get request')) {
    return 'page_missing';
  }
  return 'publish_failed';
}

export class FacebookError extends Error {
  code?: number;
  subcode?: number;
  kind: FacebookErrorKind;

  constructor(err: GraphError | string) {
    const graph: GraphError = typeof err === 'string' ? { message: err } : err;
    super(graph.message || 'Erro desconhecido na Graph API');
    this.code = graph.code;
    this.subcode = graph.error_subcode;
    this.kind = classify(graph);
  }
}

export const FRIENDLY_ERROR: Record<FacebookErrorKind, string> = {
  token_expired: 'O token da Página expirou ou foi revogado. Reconecte o Facebook.',
  permissions: 'Permissões insuficientes. Reconecte concedendo todas as permissões solicitadas.',
  page_missing: 'A Página não está mais acessível (removida ou sem acesso de administrador).',
  publish_failed: 'Falha ao publicar no Facebook.',
  unknown: 'Erro desconhecido ao falar com o Facebook.',
};

export async function graphFetch<T>(
  path: string,
  init?: { method?: string; body?: Record<string, unknown>; query?: Record<string, string> },
): Promise<T> {
  const url = new URL(`${GRAPH}${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data as { error?: GraphError }).error) {
    throw new FacebookError((data as { error?: GraphError }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}