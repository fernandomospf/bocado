/** Convite guardado enquanto a pessoa entra ou cria conta (o login com Google faz redirect e perde a query string). */
export const PENDING_INVITE_KEY = 'bocado:pendingInvite';

/** Mesmo alfabeto do servidor: 8 caracteres, sem 0/O/1/I/L. */
export const INVITE_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

export const normalizeInviteCode = (raw: string) => raw.trim().toUpperCase();

export function savePendingInvite(code: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    /* navegação privada sem armazenamento: a pessoa reabre o link depois do login */
  }
}

/** Lê e apaga de uma vez (evita entrar duas vezes se o efeito rodar em dobro). */
export function takePendingInvite(): string | null {
  try {
    const code = localStorage.getItem(PENDING_INVITE_KEY);
    localStorage.removeItem(PENDING_INVITE_KEY);
    return code && INVITE_CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}
