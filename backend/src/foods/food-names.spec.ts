import { formatFoodName } from './food-names';

const VEG = 'Verduras, hortaliças e derivados';
const FRUIT = 'Frutas e derivados';

describe('formatFoodName (TACO → nome natural)', () => {
  it.each([
    // exemplos do pedido
    ['Pão, milho, forma', undefined, 'Pão de milho de forma'],
    ['Carne, bovina, acém, moído, cozido', undefined, 'Carne moída (acém) cozida'],
    ['Alface, americana, crua', VEG, 'Alface americana'],
    // mapa dos mais comuns
    ['Frango, peito, sem pele, grelhado', undefined, 'Peito de frango grelhado'],
    ['Arroz, tipo 1, cozido', undefined, 'Arroz branco cozido'],
    ['Ovo, de galinha, inteiro, cozido/10minutos', undefined, 'Ovo cozido'],
    ['Pão, trigo, francês', undefined, 'Pão francês'],
  ])('%s → %s', (name, category, expected) => {
    expect(formatFoodName(name, category)).toBe(expected);
  });

  it.each([
    // regra genérica
    ['Carne, bovina, maminha, grelhada', 'Carnes e derivados', 'Maminha grelhada'],
    ['Frango, coxa, com pele, assada', 'Carnes e derivados', 'Coxa de frango com pele assada'],
    ['Porco, costela, assada', 'Carnes e derivados', 'Costela de porco assada'],
    ['Soja, farinha', 'Leguminosas e derivados', 'Farinha de soja'],
    ['Ovo, de galinha, clara, cozida/10minutos', 'Ovos e derivados', 'Clara de ovo cozida'],
    ['Laranja, da terra, suco', FRUIT, 'Suco de laranja da terra'],
    ['Leite, de vaca, desnatado, pó', 'Leite e derivados', 'Leite de vaca desnatado em pó'],
    ['Lingüiça, porco, grelhada', 'Carnes e derivados', 'Linguiça de porco grelhada'],
    ['Sardinha, conserva em óleo', 'Pescados e frutos do mar', 'Sardinha em conserva'],
    ['Maçã, Fuji, com casca, crua', FRUIT, 'Maçã Fuji com casca'],
  ])('%s → %s', (name, category, expected) => {
    expect(formatFoodName(name, category)).toBe(expected);
  });

  it('"cru" some em frutas e verduras, mas fica em carnes, cereais e tubérculos', () => {
    expect(formatFoodName('Jaca, crua', FRUIT)).toBe('Jaca');
    expect(formatFoodName('Frango, coxa, sem pele, crua', 'Carnes e derivados')).toBe('Coxa de frango crua');
    expect(formatFoodName('Feijão, carioca, cru', 'Leguminosas e derivados')).toBe('Feijão carioca cru');
    expect(formatFoodName('Mandioca, crua', VEG)).toBe('Mandioca crua');
  });

  it('nome que já é natural fica como está', () => {
    expect(formatFoodName('Ovos mexidos')).toBe('Ovos mexidos');
    expect(formatFoodName('Quibebe')).toBe('Quibebe');
  });
});
