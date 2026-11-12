import { coerceAnalysis } from './analysis.service';

const ovos = { name: 'Ovos mexidos', grams: 110, kcal: 190, protein: 13, carbs: 1.5, fat: 14.5, confidence: 'medium' };

describe('coerceAnalysis', () => {
  it('mantém items como array normal', () => {
    const out = coerceAnalysis({ isFood: true, title: 'Café da manhã', items: [ovos] });
    expect(out.isFood).toBe(true);
    expect(out.title).toBe('Café da manhã');
    expect(out.items).toEqual([ovos]);
  });

  it('aceita a resposta inteira como string JSON', () => {
    const out = coerceAnalysis(JSON.stringify({ isFood: true, items: [ovos] }));
    expect(out.items).toEqual([ovos]);
  });

  it('aceita items como string JSON', () => {
    const out = coerceAnalysis({ isFood: true, items: JSON.stringify([ovos]) });
    expect(out.items).toEqual([ovos]);
  });

  it('aceita nomes de campo em português e em inglês alternativo', () => {
    const out = coerceAnalysis({
      alimentos: [
        { nome: 'Café preto', gramas: 50, calorias: 2, proteína: 0.1, carboidratos: 0.3, gordura: 0, confiança: 'High' },
        { nome: 'Pão', peso: 50, calories: 135, proteins: 4, carbohydrates: 28, fats: 1, confianca: 'low' },
      ],
    });
    expect(out.items).toEqual([
      { name: 'Café preto', grams: 50, kcal: 2, protein: 0.1, carbs: 0.3, fat: 0, confidence: 'high' },
      { name: 'Pão', grams: 50, kcal: 135, protein: 4, carbs: 28, fat: 1, confidence: 'low' },
    ]);
  });

  it('aceita itens e foods como nomes da lista', () => {
    expect(coerceAnalysis({ itens: [ovos] }).items).toEqual([ovos]);
    expect(coerceAnalysis({ foods: [ovos] }).items).toEqual([ovos]);
  });

  it('extrai números de strings com vírgula decimal e unidade', () => {
    const out = coerceAnalysis({
      items: [{ name: 'Ovos', grams: '120 g', kcal: '180 kcal', protein: '12,5', carbs: '1,2 g', fat: '13', confidence: 'medium' }],
    });
    expect(out.items).toEqual([
      { name: 'Ovos', grams: 120, kcal: 180, protein: 12.5, carbs: 1.2, fat: 13, confidence: 'medium' },
    ]);
  });

  it('trata isFood ausente como true e respeita isFood false', () => {
    expect(coerceAnalysis({ items: [ovos] }).isFood).toBe(true);
    expect(coerceAnalysis({ isFood: false, items: [] }).isFood).toBe(false);
  });

  it('devolve items vazio para entradas inutilizáveis', () => {
    expect(coerceAnalysis('não é json').items).toEqual([]);
    expect(coerceAnalysis(null).items).toEqual([]);
    expect(coerceAnalysis({ items: 'texto solto' }).items).toEqual([]);
  });
});
