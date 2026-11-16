import { macroAnchor, rebalanceMacros } from '../profile/nutrition';
import { addDays } from '../weight/weight.math';
import { type AdaptiveInput, type AdaptiveProfile, evaluateAdaptive, usableThreshold } from './adaptive.math';

const TODAY = '2026-11-15';
const WINDOW_START = addDays(TODAY, -27);
const at = (i: number) => addDays(WINDOW_START, i); // i = 0 é o dia 1 da janela

const FEMALE: AdaptiveProfile = {
  sex: 'FEMALE',
  birthDate: new Date('1996-06-01T00:00:00Z'), // 30 anos
  heightCm: 165,
  weightKg: 70,
  activityLevel: 'MODERATE',
  goal: 'MAINTAIN',
  targets: { kcal: 2200, protein: 112, carbs: 275, fat: 61 },
};
// TMB 1420 e gasto por fórmula 2201 para esse perfil

/** 28 dias com a mesma ingestão e uma pesagem por dia, com o peso seguindo `weight(i)`. */
function series(over: { intake?: number | ((i: number) => number | null); weight?: (i: number) => number | null; profile?: Partial<AdaptiveProfile>; input?: Partial<AdaptiveInput> } = {}): AdaptiveInput {
  const intake = over.intake ?? 2200;
  const weight = over.weight ?? (() => 70);
  const days = [];
  const weights = [];
  for (let i = 0; i < 28; i++) {
    const kcal = typeof intake === 'function' ? intake(i) : intake;
    if (kcal !== null) days.push({ date: at(i), kcal });
    const w = weight(i);
    if (w !== null) weights.push({ date: at(i), weightKg: w });
  }
  return {
    today: TODAY,
    enabled: true,
    snoozedUntil: null,
    lastDecisionDate: null,
    firstMealDate: addDays(TODAY, -40),
    days,
    weights,
    profile: { ...FEMALE, ...over.profile },
    ...over.input,
  };
}

/** Perda linear de `kg` entre as datas médias das pontas (dia 4 e dia 25: 21 dias). */
const losing = (kg: number, start = 70) => (i: number) => start - (kg / 21) * (i - 3);

describe('evaluateAdaptive: estimativa', () => {
  it('peso estável: o gasto estimado é igual à ingestão média', () => {
    const r = evaluateAdaptive(series({ intake: 2200 }));
    expect(r.estimate).toMatchObject({ tdee: 2200, avgIntake: 2200, confidence: 'HIGH', weightStartKg: 70, weightEndKg: 70 });
    expect(r.state).toBe('no_change'); // meta de 2.200 = gasto de 2.200 (manter)
  });

  it('perda de 0,5 kg em 3 semanas comendo 2.000: gasto ≈ 2.000 + 0,5 × 7700 / 21', () => {
    const r = evaluateAdaptive(series({ intake: 2000, weight: losing(0.5), profile: { goal: 'LOSE', targets: { kcal: 1750, protein: 140, carbs: 150, fat: 50 } } }));
    expect(r.estimate!.tdee).toBe(Math.round(2000 + (0.5 * 7700) / 21)); // 2183
    expect(r.estimate!.weightStartKg).toBe(70);
    expect(r.estimate!.weightEndKg).toBe(69.5);
  });

  it('ganho de peso: o gasto estimado fica abaixo da ingestão', () => {
    const r = evaluateAdaptive(series({ intake: 2400, weight: (i) => 70 + (0.5 / 21) * (i - 3) }));
    expect(r.estimate!.tdee).toBe(Math.round(2400 - (0.5 * 7700) / 21)); // 2217
  });

  it('dias com registro incompleto (< max(800, 40% da meta)) saem do cálculo e não criam gasto falso', () => {
    expect(usableThreshold(2200)).toBe(880);
    expect(usableThreshold(1500)).toBe(800);
    // 5 dias com só 300 kcal: se contassem, a média cairia e o gasto estimado também
    const r = evaluateAdaptive(series({ intake: (i) => (i % 6 === 2 ? 300 : 2200) }));
    expect(r.progress.usableDays).toBe(23);
    expect(r.estimate!.avgIntake).toBe(2200);
    expect(r.estimate!.tdee).toBe(2200);
    expect(r.estimate!.confidence).toBe('MEDIUM'); // 23 dias: abaixo dos 24 da confiança alta
  });

  it('confiança MÉDIA usa a média entre a estimativa e o gasto por fórmula', () => {
    const r = evaluateAdaptive(series({ intake: (i) => (i % 6 === 2 ? 300 : 2300) }));
    expect(r.estimate!.confidence).toBe('MEDIUM');
    expect(r.estimate!.tdee).toBe(2300);
    expect(r.estimate!.usedTdee).toBe(Math.round((2300 + 2201) / 2));
  });

  it('confiança ALTA usa a estimativa direto', () => {
    const r = evaluateAdaptive(series({ intake: 2300 }));
    expect(r.estimate).toMatchObject({ confidence: 'HIGH', tdee: 2300, usedTdee: 2300 });
  });
});

describe('evaluateAdaptive: dados insuficientes e limites (collecting)', () => {
  it('menos de 21 dias de histórico', () => {
    const r = evaluateAdaptive(series({ input: { firstMealDate: addDays(TODAY, -10) } }));
    expect(r.state).toBe('collecting');
    expect(r.estimate).toBeUndefined();
    expect(r.progress.daysSinceStart).toBe(10);
  });

  it('sem registros de refeição nenhum', () => {
    expect(evaluateAdaptive(series({ input: { firstMealDate: null, days: [] } })).state).toBe('collecting');
  });

  it('menos de 2 pesagens na ponta inicial ou na final', () => {
    const onlyOneStart = evaluateAdaptive(series({ weight: (i) => (i === 0 || (i > 6 && i < 28) ? 70 : null) }));
    expect(onlyOneStart.state).toBe('collecting');
    const onlyOneEnd = evaluateAdaptive(series({ weight: (i) => (i <= 21 ? 70 : null) }));
    expect(onlyOneEnd.state).toBe('collecting');
  });

  it('poucos dias utilizáveis ou poucas pesagens: confiança baixa vira "coletando", sem estimativa', () => {
    const fewDays = evaluateAdaptive(series({ intake: (i) => (i % 3 === 0 ? 300 : 2200) }));
    expect(fewDays.state).toBe('collecting');
    expect(fewDays.estimate).toBeUndefined();
    const fewWeighIns = evaluateAdaptive(series({ weight: (i) => (i === 1 || i === 2 || i === 22 || i === 23 ? 70 : null) }));
    expect(fewWeighIns.state).toBe('collecting');
  });

  it('resultado absurdo (gasto acima de 2,4× a TMB ou longe da fórmula) → confiança baixa, sem sugestão', () => {
    const tooHigh = evaluateAdaptive(series({ intake: 6000 }));
    expect(tooHigh.state).toBe('collecting');
    expect(tooHigh.suggestion).toBeUndefined();
    const belowBmr = evaluateAdaptive(series({ intake: 1300 })); // abaixo de 1,0× a TMB (1420)
    expect(belowBmr.state).toBe('collecting');
    const farFromFormula = evaluateAdaptive(series({ intake: 3000 })); // dentro de 2,4× a TMB, mas > 35% da fórmula
    expect(farFromFormula.state).toBe('collecting');
  });

  it('o progresso informa o que falta', () => {
    const r = evaluateAdaptive(series({ input: { firstMealDate: addDays(TODAY, -10) } }));
    expect(r.progress).toMatchObject({ usableDays: 28, weighIns: 28, needed: { daysSinceStart: 21, usableDays: 20, weighIns: 7, weighInsPerEnd: 2 } });
  });
});

describe('evaluateAdaptive: meta sugerida', () => {
  it('amortece em 150 kcal por ajuste, mesmo que o gasto indique mais', () => {
    const r = evaluateAdaptive(series({ intake: 2200, profile: { targets: { ...FEMALE.targets, kcal: 1900 } } })); // manter em 2.200
    expect(r.state).toBe('suggestion');
    expect(r.suggestion).toMatchObject({ currentKcal: 1900, newKcal: 2050, formulaTdee: 2201 });
  });

  it('só sugere com diferença de pelo menos 100 kcal', () => {
    expect(evaluateAdaptive(series({ profile: { targets: { ...FEMALE.targets, kcal: 2110 } } })).state).toBe('no_change'); // 90
    const r = evaluateAdaptive(series({ profile: { targets: { ...FEMALE.targets, kcal: 2100 } } })); // 100
    expect(r.state).toBe('suggestion');
    expect(r.suggestion!.newKcal).toBe(2200);
  });

  it('respeita o piso de calorias (1200 para mulheres)', () => {
    const r = evaluateAdaptive(series({ intake: 1450, profile: { goal: 'LOSE', targets: { kcal: 1300, protein: 140, carbs: 90, fat: 40 } } }));
    expect(r.estimate!.confidence).toBe('HIGH');
    expect(r.suggestion).toMatchObject({ currentKcal: 1300, newKcal: 1200 }); // 1450 × 0,8 = 1160, no piso
  });

  it('o objetivo define o fator (perder = 0,8; ganhar = 1,1)', () => {
    const gain = evaluateAdaptive(series({ intake: 2200, profile: { goal: 'GAIN', targets: { ...FEMALE.targets, kcal: 2300 } } }));
    expect(gain.suggestion!.newKcal).toBe(2420); // 2200 × 1,1
    const lose = evaluateAdaptive(series({ intake: 2200, profile: { goal: 'LOSE', targets: { ...FEMALE.targets, kcal: 1900 } } }));
    expect(lose.suggestion!.newKcal).toBe(1760); // 2200 × 0,8
  });

  it('macros sugeridos: proteína em gramas fixa, gordura no mesmo %, carboidrato completa', () => {
    const r = evaluateAdaptive(series({ profile: { targets: { kcal: 1900, protein: 112, carbs: 230, fat: 60 } } }));
    const m = r.suggestion!.macros;
    expect(m.protein).toBe(112);
    const expected = rebalanceMacros(r.suggestion!.newKcal, macroAnchor({ kcal: 1900, protein: 112, carbs: 230, fat: 60 }));
    expect(m).toEqual(expected);
    expect(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - r.suggestion!.newKcal)).toBeLessThan(10);
  });
});

describe('evaluateAdaptive: travas de segurança', () => {
  it('menor de 18 anos: recurso desligado, com a nota', () => {
    const r = evaluateAdaptive(series({ profile: { birthDate: new Date('2010-01-01T00:00:00Z') } }));
    expect(r).toMatchObject({ state: 'disabled', notes: ['under18'] });
  });

  it('desligado pela pessoa: disabled', () => {
    expect(evaluateAdaptive(series({ input: { enabled: false } })).state).toBe('disabled');
  });

  it('IMC abaixo de 18,5 com objetivo de perder: nenhuma sugestão', () => {
    const r = evaluateAdaptive(series({ intake: 1800, weight: () => 45, profile: { weightKg: 45, goal: 'LOSE', targets: { kcal: 1600, protein: 90, carbs: 150, fat: 50 } } }));
    expect(r.state).toBe('no_change');
    expect(r.notes).toContain('underweight_loss');
    expect(r.suggestion).toBeUndefined();
  });

  it('perda acima de 1% do peso por semana: nota, e nunca sugere reduzir mais as calorias', () => {
    const base = { intake: 1700, weight: losing(3), profile: { goal: 'LOSE' } as Partial<AdaptiveProfile> };
    const down = evaluateAdaptive(series({ ...base, profile: { ...base.profile, targets: { kcal: 2400, protein: 140, carbs: 250, fat: 70 } } }));
    expect(down.notes).toContain('fast_loss');
    expect(down.state).toBe('no_change'); // a sugestão seria reduzir de 2.400 para 2.250
    const up = evaluateAdaptive(series({ ...base, profile: { ...base.profile, targets: { kcal: 1700, protein: 140, carbs: 150, fat: 50 } } }));
    expect(up.notes).toContain('fast_loss');
    expect(up.state).toBe('suggestion'); // aumentar é permitido
    expect(up.suggestion!.newKcal).toBeGreaterThan(1700);
  });

  it('ingestão média abaixo do piso: nota de baixa ingestão e nenhuma sugestão de reduzir mais', () => {
    const r = evaluateAdaptive(series({ intake: 1150, weight: losing(1), profile: { goal: 'LOSE', targets: { kcal: 1500, protein: 120, carbs: 150, fat: 50 } } }));
    expect(r.estimate).toBeDefined(); // o gasto estimado é plausível (≥ TMB)
    expect(r.notes).toContain('low_intake');
    expect(r.state).toBe('no_change');
  });
});

describe('evaluateAdaptive: pausa', () => {
  it('snoozedUntil no futuro pausa; no dia exato ou depois, volta', () => {
    expect(evaluateAdaptive(series({ input: { snoozedUntil: addDays(TODAY, 3) } }))).toMatchObject({ state: 'paused', snoozedUntil: addDays(TODAY, 3) });
    expect(evaluateAdaptive(series({ input: { snoozedUntil: TODAY } })).state).not.toBe('paused');
  });

  it('uma decisão há menos de 14 dias pausa; com 14 dias ou mais, não', () => {
    expect(evaluateAdaptive(series({ input: { lastDecisionDate: addDays(TODAY, -13) } })).state).toBe('paused');
    expect(evaluateAdaptive(series({ input: { lastDecisionDate: addDays(TODAY, -14) } })).state).not.toBe('paused');
  });
});

describe('rebalanceMacros (mesmos casos do editor de metas do frontend)', () => {
  const anchor = { protein: 120, fatShare: 0.25 };
  it('mantém a proteína, a gordura no mesmo % e o carboidrato completa', () => {
    expect(rebalanceMacros(2000, anchor)).toEqual({ protein: 120, fat: 56, carbs: 254 });
  });
  it('proteína que não cabe: proteína e gordura reduzem juntas', () => {
    const m = rebalanceMacros(400, { protein: 120, fatShare: 0.25 });
    expect(m.protein).toBeLessThan(120);
    expect(m.carbs).toBeGreaterThanOrEqual(0);
  });
  it('kcal <= 0 zera tudo', () => {
    expect(rebalanceMacros(0, anchor)).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
});
