import { gtinCheckDigit, hasValidCheckDigit, normalizeBarcode } from './barcode';

// Códigos de exemplo amplamente usados em documentação de GTIN (dígito verificador correto)
const EAN13 = '4006381333931';
const EAN8 = '96385074';
const UPCA = '036000291452';

describe('dígito verificador GTIN', () => {
  it('calcula o dígito de EAN-13, EAN-8 e UPC-A', () => {
    expect(gtinCheckDigit(EAN13.slice(0, -1))).toBe(1);
    expect(gtinCheckDigit(EAN8.slice(0, -1))).toBe(4);
    expect(gtinCheckDigit(UPCA.slice(0, -1))).toBe(2);
  });

  it('dígito verificador 0 (soma ponderada múltipla de 10)', () => {
    // 7891000100080: soma ponderada dos 12 primeiros = 70 → dígito 0 (prefixo 789 = Brasil)
    expect(gtinCheckDigit('789100010008')).toBe(0);
    expect(normalizeBarcode('7891000100080')).toBe('7891000100080');
  });

  it('rejeita dígito errado', () => {
    expect(hasValidCheckDigit('4006381333932')).toBe(false);
  });
});

describe('normalizeBarcode', () => {
  it('aceita EAN-13 e EAN-8 como estão', () => {
    expect(normalizeBarcode(EAN13)).toBe(EAN13);
    expect(normalizeBarcode(EAN8)).toBe(EAN8);
  });

  it('converte UPC-A em EAN-13 com zero à esquerda (o dígito continua válido)', () => {
    expect(normalizeBarcode(UPCA)).toBe(`0${UPCA}`);
    expect(hasValidCheckDigit(`0${UPCA}`)).toBe(true);
  });

  it('aceita espaços e hífens de quem digita', () => {
    expect(normalizeBarcode('4 006381 333931')).toBe(EAN13);
    expect(normalizeBarcode('4006381-333931')).toBe(EAN13);
  });

  it.each([
    ['dígito verificador errado', '4006381333932'],
    ['letras', '40063813339A1'],
    ['tamanho inválido (10)', '4006381333'],
    ['tamanho inválido (14)', '40063813339310'],
    ['vazio', ''],
  ])('rejeita %s', (_, code) => {
    expect(normalizeBarcode(code)).toBeNull();
  });
});
