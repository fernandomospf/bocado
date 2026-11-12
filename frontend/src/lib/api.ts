export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

/** Cliente da API. Mesmo domínio (rewrite do Next), então o cookie de sessão vai junto. */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const { json, headers: rawHeaders, ...rest } = init;
  const headers = new Headers(rawHeaders);
  let body = rest.body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...rest, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Sem conexão. Verifique sua internet e tente de novo.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok && data === null) {
    console.error(`[api] ${init.method ?? 'GET'} ${path} → ${res.status} (resposta não-JSON)`);
  }
  if (!res.ok) {
    const raw = data?.message;
    const message = Array.isArray(raw) ? raw[0] : typeof raw === 'string' ? raw : null;
    throw new ApiError(res.status, message ?? fallbackMessage(res.status));
  }
  return data as T;
}

function fallbackMessage(status: number) {
  if (status === 401) return 'Sua sessão expirou. Entre novamente.';
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde um minuto.';
  if (status >= 500) return `O servidor não respondeu como esperado (${status}). Tente de novo.`;
  return 'Não foi possível concluir. Tente de novo.';
}

export const fetcher = <T,>(path: string) => api<T>(path);

export function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : 'Algo deu errado. Tente de novo.';
}
