import { isLowIntake, proteinFloorDays, suggestProteinFloor, effectiveProteinFloor, summarizeWellbeing } from './glp1';

describe('piso de proteína (referência geral: 1,2 g/kg, editável)', () => {
  it('é o MAIOR entre a meta de proteína e 1,2 g por kg da tendência', () => {
    expect(suggestProteinFloor(100, 70)).toBe(100); // 1,2 x 70 = 84 < 100
    expect(suggestProteinFloor(80, 100)).toBe(120); // 1,2 x 100 = 120 > 80
  });
  it('é limitado a 200 g', () => {
    expect(suggestProteinFloor(150, 200)).toBe(200); // 1,2 x 200 = 240
    expect(suggestProteinFloor(230, 60)).toBe(200);
  });
  it('sem tendência de peso usa a meta de proteína', () => {
    expect(suggestProteinFloor(95, null)).toBe(95);
  });
  it('o valor editado vence a sugestão', () => {
    expect(effectiveProteinFloor(110, 90)).toBe(110);
    expect(effectiveProteinFloor(null, 90)).toBe(90);
  });
});

describe('aviso de baixa ingestão (piso de calorias do app: 1200 F / 1500 M)', () => {
  it('dispara quando a média dos últimos 5 dias registrados fica abaixo do piso', () => {
    expect(isLowIntake([1000, 1100, 1150, 900, 1180], 'FEMALE')).toBe(true);
    expect(isLowIntake([1400, 1300, 1450, 1200, 1480], 'MALE')).toBe(true);
  });
  it('NÃO dispara quando a média está no piso ou acima', () => {
    expect(isLowIntake([1200, 1200, 1200, 1200, 1200], 'FEMALE')).toBe(false);
    expect(isLowIntake([1600, 1700, 1500, 1800, 1550], 'MALE')).toBe(false);
    // 1.400 para ela é acima do piso; para ele (1.500) seria abaixo
    expect(isLowIntake([1400, 1400, 1400], 'FEMALE')).toBe(false);
    expect(isLowIntake([1400, 1400, 1400], 'MALE')).toBe(true);
  });
  it('só conta os 5 dias mais recentes (os mais antigos não entram)', () => {
    expect(isLowIntake([1800, 1800, 1800, 1800, 1800, 500, 500, 500], 'FEMALE')).toBe(false);
  });
  it('com menos de 3 dias registrados não há base para avaliar', () => {
    expect(isLowIntake([300, 400], 'FEMALE')).toBe(false);
    expect(isLowIntake([], 'MALE')).toBe(false);
  });
});

describe('resumo semanal do modo GLP-1', () => {
  it('conta os dias que bateram o piso de proteína', () => {
    expect(proteinFloorDays([{ protein: 130 }, { protein: 119.9 }, { protein: 120 }], 120)).toBe(2);
  });
  it('resume o bem-estar em contagens neutras por nível (náusea e intestino)', () => {
    const s = summarizeWellbeing([
      { nausea: 1, gi: 0 },
      { nausea: 1, gi: null },
      { nausea: 2, gi: 3 },
      { nausea: 0, gi: null },
    ]);
    expect(s).toEqual({ loggedDays: 4, nausea: [2, 1, 0], gi: [0, 0, 1] });
  });
});
