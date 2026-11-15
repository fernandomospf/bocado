/**
 * Códigos de barras no aparelho: validação do dígito verificador (descarta leituras falsas da câmera) e
 * conversão de UPC-E (8 dígitos, comum em embalagens pequenas) para UPC-A, que a API aceita.
 */

export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  return /^\d{8}$|^\d{12,13}$/.test(code) && gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** UPC-E "0ABCDEFc" → UPC-A de 12 dígitos (mesmo dígito verificador). */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0];
  const d = code.slice(1, 7);
  const check = code[7];
  const last = Number(d[5]);
  let body: string;
  if (last <= 2) body = `${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`;
  else if (last === 3) body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (last === 4) body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else body = `${d[0]}${d[1]}${d[2]}${d[3]}${d[4]}0000${d[5]}`;
  const upcA = `${ns}${body}${check}`;
  return isValidGtin(upcA) ? upcA : null;
}

/**
 * Código lido (com o formato informado pelo leitor) ou digitado → código aceito pela API, ou null.
 * Aceita espaços e hífens de quem digita.
 */
export function toApiBarcode(raw: string, format?: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (format === 'upc_e' || format === 'UPC_E') return expandUpcE(digits);
  return isValidGtin(digits) ? digits : null;
}
