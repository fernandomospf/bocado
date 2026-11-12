/**
 * Reduz a foto no próprio aparelho antes do envio (maior lado ≤ 1280 px, JPEG).
 * Fotos de celular passam de 5 MB; assim o upload fica rápido no 4G e a IA
 * recebe resolução de sobra para reconhecer os alimentos.
 */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
  const source = await loadSource(file);
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível processar a foto neste aparelho.');
  ctx.drawImage(source.image, 0, 0, width, height);
  if ('close' in source.image) source.image.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível processar a foto.'))),
      'image/jpeg',
      quality,
    ),
  );
}

async function loadSource(file: File): Promise<{ image: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Alguns formatos (ex.: HEIC fora do Safari) caem no fallback abaixo
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Formato de foto não suportado. Use JPG ou PNG.'));
      el.src = url;
    });
    return { image: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
