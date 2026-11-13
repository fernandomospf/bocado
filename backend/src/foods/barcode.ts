/**
 * Códigos de barras de produtos (GTIN): EAN-8, EAN-13 e UPC-A.
 * UPC-A (12 dígitos) vira EAN-13 com um zero à esquerda; o dígito verificador continua válido.
 */

/** Dígito verificador GTIN (mod 10): da direita para a esquerda, pesos 3, 1, 3, 1… sem contar o próprio dígito. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidCheckDigit(code: string): boolean {
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/**
 * Normaliza um código lido ou digitado. Aceita espaços e hífens; devolve null se o formato
 * ou o dígito verificador forem inválidos.
 * - EAN-8 (8 dígitos) → como está
 * - UPC-A (12 dígitos) → "0" + código (EAN-13)
 * - EAN-13 (13 dígitos) → como está
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (![8, 12, 13].includes(digits.length)) return null;
  if (!hasValidCheckDigit(digits)) return null;
  return digits.length === 12 ? `0${digits}` : digits;
}
