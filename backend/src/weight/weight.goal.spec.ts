import { bmiOf, goalProblem, goalProgress, LOW_BMI_MESSAGE } from './weight.goal';

const base = { heightCm: 170, currentKg: 80 };

describe('goalProblem (IMC mínimo e coerência com o objetivo)', () => {
  it('IMC da meta abaixo de 18,5 é recusado, com a mensagem de segurança, para qualquer objetivo', () => {
    // 170 cm: 18,5 de IMC = 53,5 kg
    expect(bmiOf(53.5, 170)).toBeCloseTo(18.5, 1);
    for (const goal of ['LOSE', 'MAINTAIN', 'GAIN'] as const) {
      expect(goalProblem({ ...base, goal, goalKg: 53 })).toBe(LOW_BMI_MESSAGE);
    }
    expect(goalProblem({ ...base, goal: 'LOSE', goalKg: 54 })).toBeNull(); // IMC 18,7
    expect(goalProblem({ ...base, goal: 'LOSE', goalKg: 53.5 })).toBeNull(); // no limite: 18,51
  });

  it('LOSE: meta abaixo do peso atual com diferença de pelo menos 0,5 kg', () => {
    expect(goalProblem({ ...base, goal: 'LOSE', goalKg: 79.5 })).toBeNull();
    expect(goalProblem({ ...base, goal: 'LOSE', goalKg: 79.6 })).toMatch(/perder peso.*0,5 kg/);
    expect(goalProblem({ ...base, goal: 'LOSE', goalKg: 85 })).toMatch(/ajuste o objetivo em Perfil/);
  });

  it('GAIN: meta acima do peso atual', () => {
    expect(goalProblem({ ...base, goal: 'GAIN', goalKg: 80.1 })).toBeNull();
    expect(goalProblem({ ...base, goal: 'GAIN', goalKg: 80 })).toMatch(/ganhar massa/);
    expect(goalProblem({ ...base, goal: 'GAIN', goalKg: 70 })).toMatch(/Perfil/);
  });

  it('MAINTAIN: no máximo 2 kg de diferença (para cima ou para baixo)', () => {
    expect(goalProblem({ ...base, goal: 'MAINTAIN', goalKg: 78 })).toBeNull();
    expect(goalProblem({ ...base, goal: 'MAINTAIN', goalKg: 82 })).toBeNull();
    expect(goalProblem({ ...base, goal: 'MAINTAIN', goalKg: 77.9 })).toMatch(/manter o peso/);
    expect(goalProblem({ ...base, goal: 'MAINTAIN', goalKg: 82.1 })).toMatch(/manter o peso/);
  });

  it('as mensagens não culpam nem prometem prazo', () => {
    const all = [goalProblem({ ...base, goal: 'LOSE', goalKg: 90 }), goalProblem({ ...base, goal: 'GAIN', goalKg: 70 }), goalProblem({ ...base, goal: 'MAINTAIN', goalKg: 95 }), LOW_BMI_MESSAGE];
    for (const m of all) expect(m).not.toMatch(/falhou|preguiça|atrasad|culpa|dias|semanas/i);
  });
});

describe('goalProgress', () => {
  it('perder peso: início 94, agora 91,8, meta 85', () => {
    const g = goalProgress({ startKg: 94, currentKg: 91.8, targetKg: 85 });
    expect(g).toMatchObject({ direction: 'down', remainingKg: 6.8, reached: false, targetKg: 85, startKg: 94, currentKg: 91.8 });
    expect(g.progressPct).toBeCloseTo(24.4, 1);
  });

  it('ganhar peso: início 60, agora 62, meta 66', () => {
    const g = goalProgress({ startKg: 60, currentKg: 62, targetKg: 66 });
    expect(g).toMatchObject({ direction: 'up', remainingKg: 4, reached: false });
    expect(g.progressPct).toBeCloseTo(33.3, 1);
  });

  it('o progresso é limitado a 0 e 100 (andou para o outro lado ou passou da meta)', () => {
    expect(goalProgress({ startKg: 94, currentKg: 96, targetKg: 85 }).progressPct).toBe(0);
    const past = goalProgress({ startKg: 94, currentKg: 83, targetKg: 85 });
    expect(past.progressPct).toBe(100);
    expect(past.remainingKg).toBe(0);
    expect(past.reached).toBe(true);
  });

  it('reached: a 0,3 kg da meta (no limite) ou depois de cruzar, nas duas direções', () => {
    expect(goalProgress({ startKg: 94, currentKg: 85.3, targetKg: 85 }).reached).toBe(true); // 0,3 exato
    expect(goalProgress({ startKg: 94, currentKg: 85.4, targetKg: 85 }).reached).toBe(false);
    expect(goalProgress({ startKg: 60, currentKg: 65.7, targetKg: 66 }).reached).toBe(true);
    expect(goalProgress({ startKg: 60, currentKg: 65.6, targetKg: 66 }).reached).toBe(false);
    expect(goalProgress({ startKg: 60, currentKg: 67, targetKg: 66 }).reached).toBe(true); // passou
    expect(goalProgress({ startKg: 94, currentKg: 84, targetKg: 85 }).reached).toBe(true);
  });

  it('início igual à meta (manter): 100% e alcançada', () => {
    expect(goalProgress({ startKg: 70, currentKg: 70, targetKg: 70 })).toMatchObject({ progressPct: 100, reached: true, remainingKg: 0 });
  });
});
