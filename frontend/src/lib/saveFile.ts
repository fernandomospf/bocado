/** iPhone/iPad (inclusive iPad que se apresenta como Mac): lá o <a download> não salva o arquivo num PWA. */
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * Salva o arquivo no aparelho: no iOS, pela folha de compartilhar (quando disponível; é como o arquivo .ics chega ao
 * app Calendário); no resto, com um link de download. O arquivo nunca passa por um endereço público.
 */
export async function saveFile(blob: Blob, filename: string, type = 'text/csv') {
  const file = new File([blob], filename, { type });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
