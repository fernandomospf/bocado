import { buildWeeklyReport, pendingWeekStart, type ReportInput, weekEndOf, weekStartOf } from './weekly.math';

// 2026-11-15 é domingo
describe('weekStartOf / weekEndOf', () => {
  it('início na SEGUNDA: segunda a domingo', () => {
    expect(weekStartOf('2026-11-15', 'MONDAY')).toBe('2026-11-09'); // domingo pertence à semana que começou na segunda
    expect(weekStartOf('2026-11-16', 'MONDAY')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-12', 'MONDAY')).toBe('2026-11-09');
    expect(weekEndOf('2026-11-09')).toBe('2026-11-15');
  });

  it('início no DOMINGO: domingo a sábado', () => {
    expect(weekStartOf('2026-11-15', 'SUNDAY')).toBe('2026-11-15');
    expect(weekStartOf('2026-11-21', 'SUNDAY')).toBe('2026-11-15'); // sábado
    expect(weekStartOf('2026-11-22', 'SUNDAY')).toBe('2026-11-22');
    expect(weekEndOf('2026-11-15')).toBe('2026-11-21');
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(weekStartOf('2027-01-01', 'MONDAY')).toBe('2026-12-28');
    expect(weekEndOf('2026-12-28')).toBe('2027-01-03');
    expect(weekStartOf('2026-12-01', 'SUNDAY')).toBe('2026-11-29');
  });
});

describe('pendingWeekStart', () => {
  it('início na SEGUNDA: domingo antes das 18h ainda mostra a semana anterior', () => {
    expect(pendingWeekStart('2026-11-15', 17, 'MONDAY')).toBe('2026-11-02');
  });

  it('início na SEGUNDA: domingo a partir das 18h destaca a semana corrente (segunda a hoje)', () => {
    expect(pendingWeekStart('2026-11-15', 18, 'MONDAY')).toBe('2026-11-09');
    expect(pendingWeekStart('2026-11-15', 23, 'MONDAY')).toBe('2026-11-09');
  });

  it('início na SEGUNDA: da segunda em diante, a semana anterior continua disponível', () => {
    expect(pendingWeekStart('2026-11-16', 9, 'MONDAY')).toBe('2026-11-09');
    expect(pendingWeekStart('2026-11-20', 22, 'MONDAY')).toBe('2026-11-09');
    expect(pendingWeekStart('2026-11-22', 10, 'MONDAY')).toBe('2026-11-09'); // domingo cedo, ainda a anterior
  });

  it('início no DOMINGO: do domingo ao sábado, a semana que terminou no sábado anterior', () => {
    expect(pendingWeekStart('2026-11-15', 0, 'SUNDAY')).toBe('2026-11-08');
    expect(pendingWeekStart('2026-11-18', 12, 'SUNDAY')).toBe('2026-11-08');
    expect(pendingWeekStart('2026-11-21', 23, 'SUNDAY')).toBe('2026-11-08');
    expect(pendingWeekStart('2026-11-22', 8, 'SUNDAY')).toBe('2026-11-15'); // a nova semana começou
  });

  it('início no DOMINGO: a hora não muda nada', () => {
    expect(pendingWeekStart('2026-11-15', 8, 'SUNDAY')).toBe(pendingWeekStart('2026-11-15', 20, 'SUNDAY'));
  });
});

// ---------------------------------------------------------------------------

const TARGETS = { kcal: 2000, protein: 120, carbs: 230, fat: 65 };
const day = (date: string, kcal: number, protein = 100, byMeal: Record<string, number> = { LUNCH: kcal }) => ({
  date,
  totals: { kcal, protein, carbs: 200, fat: 60 },
  byMeal,
});

const WEEK = '2026-11-09'; // segunda
const dates = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(9 + i).padStart(2, '0')}`);

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    weekStart: WEEK,
    days: dates(5).map((d) => day(d, 1800)),
    targets: TARGETS,
    tdee: 2400,
    sex: 'FEMALE',
    hideWeight: false,
    weights: [],
    ...over,
  };
}

describe('buildWeeklyReport', () => {
  it('sempre devolve 7 dias, com os não registrados em 0 e logged=false', () => {
    const r = buildWeeklyReport(input());
    expect(r.days).toHaveLength(7);
    expect(r.days.map((d) => d.logged)).toEqual([true, true, true, true, true, false, false]);
    expect(r.days[5]).toMatchObject({ date: '2026-11-14', kcal: 0, goalKcal: 2000 });
  });

  it('menos de 4 dias: só days e a contagem, sem médias nem balanço', () => {
    const r = buildWeeklyReport(input({ days: dates(3).map((d) => day(d, 1800)) }));
    expect(r).toMatchObject({ loggedDays: 3, insufficientData: true });
    expect(Object.keys(r).sort()).toEqual(['days', 'insufficientData', 'loggedDays', 'weekEnd', 'weekStart']);
  });

  it('exatamente 4 dias já gera o relatório', () => {
    expect(buildWeeklyReport(input({ days: dates(4).map((d) => day(d, 1800)) })).insufficientData).toBe(false);
  });

  it('dias sem registro ficam fora das médias e dos balanços (não contam como 0 kcal)', () => {
    const r = buildWeeklyReport(input({ days: [day('2026-11-09', 1500), day('2026-11-10', 1700), day('2026-11-11', 1900), day('2026-11-12', 2100)] }));
    expect(r.avg!.kcal).toBe(1800); // (1500+1700+1900+2100) / 4, e não / 7
    expect(r.balanceVsTargetKcal).toBe(800); // 4×2000 − 7200
    expect(r.balanceVsExpenditure!.kcal).toBe(2400); // 4×2400 − 7200
  });

  it('balanço versus a meta: positivo = abaixo da meta; acima da meta fica negativo', () => {
    const below = buildWeeklyReport(input({ days: dates(4).map((d) => day(d, 1900)) }));
    const above = buildWeeklyReport(input({ days: dates(4).map((d) => day(d, 2200)) }));
    expect(below.balanceVsTargetKcal).toBe(400);
    expect(above.balanceVsTargetKcal).toBe(-800);
  });

  it('balanço versus o gasto e o equivalente em kg (÷ 7700, 1 casa), rotulado como estimativa pelo cliente', () => {
    const r = buildWeeklyReport(input({ days: dates(7).map((d) => day(d, 1700)), tdee: 2400 }));
    expect(r.balanceVsExpenditure).toEqual({ kcal: 4900, kg: 0.6, tdee: 2400 }); // 4900 / 7700 = 0,636
  });

  it('dias na meta (±10%) e proteína >= 90% da meta', () => {
    const r = buildWeeklyReport(
      input({
        days: [day('2026-11-09', 2000, 120), day('2026-11-10', 2200, 108), day('2026-11-11', 2201, 107), day('2026-11-12', 1799, 130)],
      }),
    );
    expect(r.daysOnTarget).toBe(2); // 2000 e 2200 (limite incluso); 2201 e 1799 ficam fora
    expect(r.daysProteinHit).toBe(3); // 120, 108 (=90%) e 130; 107 não
  });

  it('destaques: dia com mais proteína, refeição com mais de 45% das kcal e sequência', () => {
    const r = buildWeeklyReport(
      input({
        days: [
          day('2026-11-09', 1800, 90, { LUNCH: 1200, DINNER: 600 }),
          day('2026-11-10', 1800, 150, { LUNCH: 1200, DINNER: 600 }),
          day('2026-11-11', 1800, 100, { LUNCH: 1200, DINNER: 600 }),
          day('2026-11-12', 1800, 100, { LUNCH: 1200, DINNER: 600 }),
        ],
      }),
    );
    expect(r.highlights).toEqual([
      { kind: 'topProtein', date: '2026-11-10', protein: 150 },
      { kind: 'mealShare', mealType: 'LUNCH', share: 0.67 },
      { kind: 'streak', days: 4 },
    ]);
  });

  it('sem refeição acima de 45% e sem sequência de 3: só o dia de mais proteína', () => {
    const spread = { BREAKFAST: 450, LUNCH: 450, SNACK: 450, DINNER: 450 };
    const r = buildWeeklyReport(
      input({ days: ['2026-11-09', '2026-11-11', '2026-11-13', '2026-11-15'].map((d) => day(d, 1800, 100, spread)) }),
    );
    expect(r.highlights!.map((h) => h.kind)).toEqual(['topProtein']);
  });

  it('nota de baixa ingestão: média abaixo do piso (1200 F / 1500 M)', () => {
    const low = (sex: 'FEMALE' | 'MALE', kcal: number) => buildWeeklyReport(input({ sex, days: dates(5).map((d) => day(d, kcal)) })).lowIntakeNote;
    expect(low('FEMALE', 1150)).toBe(true);
    expect(low('FEMALE', 1200)).toBe(false);
    expect(low('MALE', 1450)).toBe(true);
    expect(low('MALE', 1500)).toBe(false);
  });

  describe('peso', () => {
    const w = (date: string, weightKg: number) => ({ date, weightKg });

    it('menos de 2 registros na semana: weight null com o motivo', () => {
      const r = buildWeeklyReport(input({ weights: [w('2026-11-05', 70), w('2026-11-10', 69.5)] }));
      expect(r).toMatchObject({ weight: null, weightNote: 'needTwoThisWeek' });
    });

    it('sem registro na semana anterior: weight null com o motivo', () => {
      const r = buildWeeklyReport(input({ weights: [w('2026-11-09', 70), w('2026-11-12', 69.4)] }));
      expect(r).toMatchObject({ weight: null, weightNote: 'needPreviousWeek' });
    });

    it('com 2+ registros na semana e 1+ na anterior: médias, variação medida e esperada lado a lado', () => {
      const r = buildWeeklyReport(
        input({
          days: dates(7).map((d) => day(d, 1700)),
          tdee: 2400,
          weights: [w('2026-11-04', 71), w('2026-11-09', 70.4), w('2026-11-13', 70.2)],
        }),
      );
      expect(r.weightNote).toBeNull();
      expect(r.weight).toEqual({
        thisWeekKg: 70.3, // média móvel de 7 dias no último registro da semana (70,4 e 70,2)
        previousWeekKg: 71,
        measuredKg: -0.7,
        expectedKg: -0.6, // −4900 / 7700
      });
    });

    it('hideWeightInReports: sem peso e sem o equivalente em kg do balanço', () => {
      const r = buildWeeklyReport(
        input({ hideWeight: true, weights: [w('2026-11-04', 71), w('2026-11-09', 70.4), w('2026-11-13', 70.2)] }),
      );
      expect(r).toMatchObject({ weight: null, weightNote: 'hidden' });
      expect(r.balanceVsExpenditure!.kg).toBeNull();
      expect(r.balanceVsExpenditure!.kcal).toBeGreaterThan(0); // as kcal continuam
    });
  });
});
