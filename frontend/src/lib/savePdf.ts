/**
 * Salva um PDF gerado no servidor. window.print() não faz nada no app instalado do iPhone (PWA standalone), então o PDF
 * é baixado com fetch e entregue pela folha de compartilhar (iPhone e Android: "Salvar em Arquivos"…). Sem suporte a
 * compartilhar arquivos, cai num download comum por <a download> a partir de um blob URL (revogado depois).
 */
export async function savePdf({ url, filename, title }: { url: string; filename: string; title: string }): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const msg = Array.isArray(body?.message) ? body?.message[0] : body?.message;
    throw new Error(msg ?? 'Não foi possível gerar o PDF agora. Tente de novo.');
  }
  const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      // Fechar a folha de compartilhar não é erro
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }

  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return 'downloaded';
}

export const reportFilename = (from: string, to: string) => `relatorio-bocado-${from}_a_${to}.pdf`;
