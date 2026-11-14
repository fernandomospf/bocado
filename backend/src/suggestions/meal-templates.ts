/**
 * Pratos brasileiros comuns, usados no lugar de combinar alimentos livremente.
 * Cada item aponta para um nome EXATO da TACO (validado em teste) e tem um papel:
 * - protein: a porção é calculada para cobrir a proteína que falta;
 * - fill: o carboidrato que completa as kcal restantes;
 * - fixed: quantidade fixa (feijão em 1 concha, salada, fruta).
 *
 * Onde a TACO não tem o alimento (tilápia, macarrão cozido, sopa pronta), usamos o equivalente que existe,
 * sem inventar valores: "Peixe assado (merluza)", "Macarrão à bolonhesa", sopa montada com músculo e legumes.
 */

export type SlotRole = 'protein' | 'fill' | 'fixed';
export type TemplateMoment = 'DINNER' | 'SNACK';

export interface TemplateSlot {
  food: string;
  role: SlotRole;
  /** Só para fixed: gramas padrão (ajustadas aos limites da categoria). */
  grams?: number;
}

export interface MealTemplate {
  id: string;
  title: string;
  moment: TemplateMoment;
  slots: TemplateSlot[];
}

const FRANGO_GRELHADO = 'Frango, peito, sem pele, grelhado';
const FRANGO_COZIDO = 'Frango, peito, sem pele, cozido';
const CARNE_MOIDA = 'Carne, bovina, acém, moído, cozido';
const PATINHO = 'Carne, bovina, patinho, sem gordura, grelhado';
const OVO_COZIDO = 'Ovo, de galinha, inteiro, cozido/10minutos';
const OVO_FRITO = 'Ovo, de galinha, inteiro, frito';
const ARROZ = 'Arroz, tipo 1, cozido';
const FEIJAO = 'Feijão, carioca, cozido';
const FEIJAO_PRETO = 'Feijão, preto, cozido';
const BATATA = 'Batata, inglesa, cozida';
const BATATA_DOCE = 'Batata, doce, cozida';
const MANDIOCA = 'Mandioca, cozida';
const PAO_FRANCES = 'Pão, trigo, francês';
const PAO_INTEGRAL = 'Pão, trigo, forma, integral';
const CUSCUZ = 'Cuscuz, de milho, cozido com sal';
const ALFACE = 'Alface, crespa, crua';
const TOMATE = 'Tomate, com semente, cru';
const CENOURA = 'Cenoura, cozida';
const BROCOLIS = 'Brócolis, cozido';
const ABOBRINHA = 'Abobrinha, italiana, cozida';
const CHUCHU = 'Chuchu, cozido';
const IOGURTE = 'Iogurte, natural';
const AVEIA = 'Aveia, flocos, crua';
const BANANA = 'Banana, prata, crua';
const MAMAO = 'Mamão, Papaia, cru';
const QUEIJO = 'Queijo, minas, frescal';
const ATUM = 'Atum, conserva em óleo';

const p = (food: string): TemplateSlot => ({ food, role: 'protein' });
const fill = (food: string): TemplateSlot => ({ food, role: 'fill' });
const fixed = (food: string, grams: number): TemplateSlot => ({ food, role: 'fixed', grams });
/** Salada simples: alface + tomate (100 g no total). */
const salad = [fixed(ALFACE, 50), fixed(TOMATE, 50)];

export const MEAL_TEMPLATES: MealTemplate[] = [
  // ---------------- Jantar ----------------
  { id: 'frango-arroz-feijao', title: 'Frango grelhado com arroz, feijão e salada', moment: 'DINNER', slots: [p(FRANGO_GRELHADO), fill(ARROZ), fixed(FEIJAO, 86), ...salad] },
  { id: 'frango-batata-brocolis', title: 'Frango grelhado com batata e brócolis', moment: 'DINNER', slots: [p(FRANGO_GRELHADO), fill(BATATA), fixed(BROCOLIS, 100)] },
  { id: 'frango-integral-legumes', title: 'Frango grelhado com arroz integral e legumes', moment: 'DINNER', slots: [p(FRANGO_GRELHADO), fill('Arroz, integral, cozido'), fixed(CENOURA, 60), fixed(ABOBRINHA, 60)] },
  { id: 'carne-moida-arroz-legumes', title: 'Carne moída com arroz e legumes', moment: 'DINNER', slots: [p(CARNE_MOIDA), fill(ARROZ), fixed(CENOURA, 60), fixed(CHUCHU, 60)] },
  { id: 'carne-moida-arroz-feijao', title: 'Carne moída com arroz, feijão e salada', moment: 'DINNER', slots: [p(CARNE_MOIDA), fill(ARROZ), fixed(FEIJAO, 86), ...salad] },
  { id: 'patinho-arroz-feijao', title: 'Bife de patinho com arroz, feijão preto e salada', moment: 'DINNER', slots: [p(PATINHO), fill(ARROZ), fixed(FEIJAO_PRETO, 86), ...salad] },
  { id: 'patinho-batata-doce', title: 'Bife de patinho com batata-doce e brócolis', moment: 'DINNER', slots: [p(PATINHO), fill(BATATA_DOCE), fixed(BROCOLIS, 100)] },
  { id: 'contrafile-arroz', title: 'Contrafilé grelhado com arroz e salada', moment: 'DINNER', slots: [p('Carne, bovina, contra-filé, sem gordura, grelhado'), fill(ARROZ), ...salad] },
  { id: 'omelete-pao', title: 'Ovos com salada e pão', moment: 'DINNER', slots: [p(OVO_FRITO), fill(PAO_FRANCES), ...salad] },
  { id: 'ovo-arroz-feijao', title: 'Ovos cozidos com arroz, feijão e salada', moment: 'DINNER', slots: [p(OVO_COZIDO), fill(ARROZ), fixed(FEIJAO, 86), ...salad] },
  { id: 'peixe-batata-legumes', title: 'Peixe assado com batata e legumes', moment: 'DINNER', slots: [p('Merluza, filé, assado'), fill(BATATA), fixed(CENOURA, 60), fixed(BROCOLIS, 60)] },
  { id: 'peixe-frito-arroz', title: 'Peixe frito com arroz e salada', moment: 'DINNER', slots: [p('Pescada, filé, frito'), fill(ARROZ), ...salad] },
  { id: 'atum-arroz', title: 'Atum com arroz e salada', moment: 'DINNER', slots: [p(ATUM), fill(ARROZ), ...salad] },
  { id: 'sardinha-arroz', title: 'Sardinha assada com arroz e salada', moment: 'DINNER', slots: [p('Sardinha, assada'), fill(ARROZ), ...salad] },
  { id: 'macarrao-bolonhesa', title: 'Macarrão à bolonhesa com carne moída', moment: 'DINNER', slots: [p(CARNE_MOIDA), fill('Macarrão, molho bolognesa')] },
  { id: 'cuscuz-ovo', title: 'Cuscuz com ovos e tomate', moment: 'DINNER', slots: [p(OVO_COZIDO), fill(CUSCUZ), fixed(TOMATE, 60)] },
  { id: 'sopa-carne-legumes', title: 'Sopa de legumes com carne', moment: 'DINNER', slots: [p('Carne, bovina, músculo, sem gordura, cozido'), fill(BATATA), fixed(CENOURA, 60), fixed(CHUCHU, 60)] },
  { id: 'frango-mandioca', title: 'Frango desfiado com mandioca e salada', moment: 'DINNER', slots: [p(FRANGO_COZIDO), fill(MANDIOCA), ...salad] },
  { id: 'coxa-arroz-feijao-couve', title: 'Coxa de frango com arroz, feijão preto e couve', moment: 'DINNER', slots: [p('Frango, coxa, sem pele, cozida'), fill(ARROZ), fixed(FEIJAO_PRETO, 86), fixed('Couve, manteiga, refogada', 50)] },
  { id: 'carne-panela-mandioca', title: 'Carne de panela com mandioca e cenoura', moment: 'DINNER', slots: [p('Carne, bovina, acém, sem gordura, cozido'), fill(MANDIOCA), fixed(CENOURA, 80)] },
  { id: 'lentilha-arroz-ovo', title: 'Lentilha com arroz e ovos', moment: 'DINNER', slots: [p(OVO_COZIDO), fill(ARROZ), fixed('Lentilha, cozida', 80)] },
  { id: 'frango-polenta', title: 'Frango grelhado com polenta e salada', moment: 'DINNER', slots: [p(FRANGO_GRELHADO), fill('Polenta, pré-cozida'), ...salad] },

  // ---------------- Lanche (ceia) ----------------
  { id: 'iogurte-banana-aveia', title: 'Iogurte com banana e aveia', moment: 'SNACK', slots: [p(IOGURTE), fill(AVEIA), fixed(BANANA, 80)] },
  { id: 'pao-com-ovo', title: 'Pão com ovo', moment: 'SNACK', slots: [p(OVO_FRITO), fill(PAO_FRANCES)] },
  { id: 'tapioca-queijo', title: 'Tapioca com queijo', moment: 'SNACK', slots: [p(QUEIJO), fill('Tapioca, com manteiga')] },
  { id: 'sanduiche-frango', title: 'Sanduíche de frango', moment: 'SNACK', slots: [p(FRANGO_COZIDO), fill(PAO_INTEGRAL), fixed(ALFACE, 50), fixed(TOMATE, 50)] },
  { id: 'pao-queijo-mamao', title: 'Pão com queijo e mamão', moment: 'SNACK', slots: [p(QUEIJO), fill(PAO_FRANCES), fixed(MAMAO, 100)] },
  { id: 'iogurte-mamao-aveia', title: 'Iogurte com mamão e aveia', moment: 'SNACK', slots: [p(IOGURTE), fill(AVEIA), fixed(MAMAO, 100)] },
  { id: 'sanduiche-atum', title: 'Sanduíche de atum', moment: 'SNACK', slots: [p(ATUM), fill(PAO_INTEGRAL), fixed(TOMATE, 50)] },
  { id: 'ovos-banana', title: 'Ovos cozidos com banana', moment: 'SNACK', slots: [p(OVO_COZIDO), fill(BANANA)] },
  { id: 'cuscuz-queijo', title: 'Cuscuz com queijo', moment: 'SNACK', slots: [p(QUEIJO), fill(CUSCUZ)] },
  { id: 'batata-doce-frango', title: 'Batata-doce com frango desfiado', moment: 'SNACK', slots: [p(FRANGO_COZIDO), fill(BATATA_DOCE)] },
];

/** Todos os nomes da TACO usados nos modelos (para carregar de uma vez e validar). */
export const TEMPLATE_FOOD_NAMES = [...new Set(MEAL_TEMPLATES.flatMap((t) => t.slots.map((s) => s.food)))];
