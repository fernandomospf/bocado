/**
 * Nome natural a partir do nome da TACO, que é técnico e invertido
 * ("Frango, peito, sem pele, grelhado" → "Peito de frango grelhado").
 * Mapa explícito para os itens mais comuns + regra genérica para o resto.
 */

const MAP: Record<string, string> = {
  'Arroz, tipo 1, cozido': 'Arroz branco cozido',
  'Arroz, tipo 2, cozido': 'Arroz branco cozido (tipo 2)',
  'Arroz, integral, cozido': 'Arroz integral cozido',
  'Feijão, carioca, cozido': 'Feijão carioca cozido',
  'Feijão, preto, cozido': 'Feijão preto cozido',
  'Frango, peito, sem pele, grelhado': 'Peito de frango grelhado',
  'Frango, peito, sem pele, cozido': 'Peito de frango cozido',
  'Frango, coxa, sem pele, cozida': 'Coxa de frango cozida',
  'Frango, inteiro, sem pele, assado': 'Frango assado',
  'Frango, inteiro, sem pele, cozido': 'Frango cozido',
  'Carne, bovina, acém, moído, cozido': 'Carne moída (acém) cozida',
  'Carne, bovina, acém, sem gordura, cozido': 'Carne de panela (acém)',
  'Carne, bovina, patinho, sem gordura, grelhado': 'Patinho grelhado',
  'Carne, bovina, contra-filé, sem gordura, grelhado': 'Contrafilé grelhado',
  'Carne, bovina, músculo, sem gordura, cozido': 'Músculo cozido',
  'Ovo, de galinha, inteiro, cozido/10minutos': 'Ovo cozido',
  'Ovo, de galinha, inteiro, frito': 'Ovo frito',
  'Ovo, de galinha, inteiro, cru': 'Ovo cru',
  'Merluza, filé, assado': 'Peixe assado (merluza)',
  'Pescada, filé, frito': 'Peixe frito (pescada)',
  'Sardinha, assada': 'Sardinha assada',
  'Atum, conserva em óleo': 'Atum em conserva',
  'Pão, trigo, francês': 'Pão francês',
  'Pão, trigo, forma, integral': 'Pão de forma integral',
  'Pão, milho, forma': 'Pão de milho de forma',
  'Batata, inglesa, cozida': 'Batata cozida',
  'Batata, doce, cozida': 'Batata-doce cozida',
  'Mandioca, cozida': 'Mandioca cozida',
  'Cuscuz, de milho, cozido com sal': 'Cuscuz de milho',
  'Macarrão, molho bolognesa': 'Macarrão à bolonhesa',
  'Alface, americana, crua': 'Alface americana',
  'Alface, crespa, crua': 'Alface crespa',
  'Tomate, com semente, cru': 'Tomate',
  'Cenoura, cozida': 'Cenoura cozida',
  'Brócolis, cozido': 'Brócolis cozido',
  'Abobrinha, italiana, cozida': 'Abobrinha cozida',
  'Chuchu, cozido': 'Chuchu cozido',
  'Couve, manteiga, refogada': 'Couve refogada',
  'Iogurte, natural': 'Iogurte natural',
  'Banana, prata, crua': 'Banana-prata',
  'Mamão, Papaia, cru': 'Mamão papaia',
  'Aveia, flocos, crua': 'Aveia em flocos',
  'Queijo, minas, frescal': 'Queijo minas frescal',
  'Tapioca, com manteiga': 'Tapioca com manteiga',
  'Café, infusão 10%': 'Café coado',
};

/** Segundo termo que é, na verdade, um corte da carne do primeiro termo. */
const CUTS = /^(peito|coxa|sobrecoxa|asa|coração|fígado|filé|lombo|costela|pernil|bisteca|orelha|pé|língua)$/i;
/** Segundo termo que é um produto feito do primeiro ("Soja, farinha" → "Farinha de soja"). */
const PRODUCTS = /^(farinha|fubá|flocos|extrato|óleo|polvilho|amido|creme|leite|farelo|germe)$/i;
/** Descrições que não ajudam no nome (o padrão é sem pele e sem gordura). */
const DROP = /^(sem pele|sem gordura|inteiro|inteira|de galinha|tipo 1)$/i;
const RAW = /^(cru|crua|crus|cruas)$/i;
/** Tubérculos ficam na categoria de verduras, mas crus não se comem: aí "cru" continua no nome. */
const TUBER = /^(mandioca|batata|inhame|cará|aipim|mandioquinha)/i;
/** "Lingüiça, porco" → "Linguiça de porco". */
const ANIMAL = /^(porco|frango|boi|peru|galinha|carneiro|cabrito)$/i;
/** Em frutas e verduras "cru" é o estado normal; em carnes e cereais é informação importante. */
const RAW_IS_DEFAULT = new Set(['Frutas e derivados', 'Verduras, hortaliças e derivados']);

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatFoodName(name: string, category?: string | null): string {
  const trimmed = name.trim();
  if (MAP[trimmed]) return MAP[trimmed];
  if (!trimmed.includes(',')) return trimmed; // já é um nome natural (histórico, produtos)

  const parts = trimmed
    .replace(/\/\d+\s*minutos?/gi, '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  let [base, ...rest] = parts;

  // "Carne, bovina, maminha, grelhada" → "Maminha grelhada"
  if (/^carne$/i.test(base) && /^(bovina|suína)$/i.test(rest[0] ?? '') && rest[1]) {
    base = upper(rest[1]);
    rest = rest.slice(2);
  } else if (rest[0] && CUTS.test(rest[0])) {
    // "Frango, peito, ..." → "Peito de frango ..."
    base = `${upper(rest[0])} de ${lower(base)}`;
    rest = rest.slice(1);
  } else if (rest[0] && PRODUCTS.test(rest[0])) {
    base = `${upper(rest[0])} de ${lower(base)}`;
    rest = rest.slice(1);
  } else if (/^ovo$/i.test(base) && /^(clara|gema)$/i.test(rest[1] ?? '')) {
    base = `${upper(rest[1])} de ovo`;
    rest = rest.slice(2);
  }

  if (rest[0] && ANIMAL.test(rest[0])) {
    base = `${base} de ${lower(rest[0])}`;
    rest = rest.slice(1);
  }
  // "Laranja, da terra, suco" → "Suco de laranja da terra"
  const juice = rest.findIndex((d) => /^suco$/i.test(d));
  if (juice >= 0) {
    base = `Suco de ${lower(base)}`;
    rest = rest.filter((_, i) => i !== juice);
  }

  const dropRaw = category ? RAW_IS_DEFAULT.has(category) && !TUBER.test(base) : false;
  const descriptors = rest
    .filter((d) => !DROP.test(d) && !(dropRaw && RAW.test(d)))
    .map((d) => d.replace(/^pó$/i, 'em pó').replace(/^conserva em .+$/i, 'em conserva'));
  return [base, ...descriptors].join(' ').replace(/\s+/g, ' ').replace(/Lingüiça/g, 'Linguiça').trim();
}
