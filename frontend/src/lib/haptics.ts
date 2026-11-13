/**
 * Vibração curta como retorno tátil. Sem suporte (iOS Safari, desktop), não faz nada.
 * Navegadores ignoram a chamada sem um gesto do usuário recente, então use só em resposta a toques.
 */
function vibrate(pattern: number | number[]) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Alguns navegadores lançam erro em contextos sem permissão; o retorno tátil é opcional
  }
}

/** Toque leve: trocar dia, segmentados, adicionar item. */
export const tap = () => vibrate(10);

/** Sucesso: refeição salva, código lido. */
export const success = () => vibrate([10, 40, 10]);
