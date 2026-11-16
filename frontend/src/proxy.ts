import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Nome do cookie de sessão (o mesmo que o backend grava em backend/src/auth/auth.types.ts). */
const SESSION_COOKIE = 'bocado_session';

/**
 * "/" tem duas caras: quem tem o cookie de sessão vê a Hoje; quem não tem vê a landing, por rewrite interno para
 * /landing (a URL não muda). A presença do cookie basta para rotear: se ele estiver inválido, o layout logado manda
 * para /login. Como a MESMA URL devolve páginas diferentes, a resposta é privada e varia por cookie, para que o
 * Cloudflare (ou qualquer cache) nunca sirva uma versão a quem deveria ver a outra.
 *
 * Nota: o Next 16 mantém só o próprio `Vary` (rsc, next-router-...) e descarta o `Vary: Cookie` definido aqui e no
 * next.config. Quem garante que nenhum cache compartilhado guarde a resposta é o `Cache-Control: private, no-cache`,
 * que chega nas duas variantes. O `Vary` fica declarado para o caso de uma versão futura do Next respeitá-lo.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const response = hasSession ? NextResponse.next() : NextResponse.rewrite(new URL('/landing', request.url));
  response.headers.set('Vary', 'Cookie');
  response.headers.set('Cache-Control', 'private, no-cache');
  return response;
}

// Só a rota exata "/": o manifesto, os ícones e o resto do app não passam por aqui
export const config = { matcher: '/' };
