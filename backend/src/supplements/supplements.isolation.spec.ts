import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ExportService, MEALS_HEADER } from '../export/export.service';

/**
 * Suplementos e medicações ficam isolados: nenhum outro módulo do backend lê ou escreve estas tabelas. Esta varredura
 * falha se alguém, por engano, ligar o módulo a relatórios, casa, admin, IA, água, meta adaptativa etc.
 */
const SRC = join(__dirname, '..');
const ALLOWED = new Set(['supplements', 'testing']); // o módulo em si e o fake dos testes
const MENTIONS = /supplement|intakelog|intake_log|suplement/i;
// Só o perfil guarda as duas preferências, e a exportação tem a opção à parte (conferida abaixo)
const EXCEPTIONS = new Set(['profile/dto/profile.dto.ts', 'profile/profile.service.ts', 'export/export.controller.ts', 'export/export.service.ts', 'app.module.ts', 'main.ts']);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (dir === SRC && ALLOWED.has(name)) continue;
      sources(p, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

describe('isolamento do módulo de suplementos', () => {
  const files = sources(SRC).map((p) => p.slice(SRC.length + 1));

  it('nenhum outro módulo menciona suplementos (casa, admin, relatórios, receitas, IA, água, adaptativa, sugestões, conta...)', () => {
    const offenders = files.filter((f) => !EXCEPTIONS.has(f) && MENTIONS.test(readFileSync(join(SRC, f), 'utf8')));
    expect(offenders).toEqual([]);
    // sanidade: a varredura de fato olha os módulos sensíveis
    for (const dir of ['admin/', 'household/', 'reports/', 'recipes/', 'analysis/', 'suggestions/', 'adaptive/', 'water/', 'account/']) {
      expect(files.some((f) => f.startsWith(dir))).toBe(true);
    }
  });

  it('as exceções fazem só o que devem: a exportação à parte e as duas preferências', () => {
    const read = (f: string) => readFileSync(join(SRC, f), 'utf8');
    expect(read('export/export.service.ts').match(/intakeLog/g)?.length).toBe(2); // resumo e CSV, nada mais
    const profile = read('profile/profile.service.ts');
    expect(profile.match(/supplement/gi)?.every((m) => /supplement/i.test(m))).toBe(true);
    expect(profile).not.toMatch(/supplementPlan|intakeLog/);
  });

  it('exclusão de conta: os modelos saem por cascata (onDelete: Cascade no schema)', () => {
    const schema = readFileSync(join(SRC, '..', 'prisma', 'schema.prisma'), 'utf8');
    const block = (name: string) => schema.slice(schema.indexOf(`model ${name} `)).split('\n}')[0];
    expect(block('SupplementPlan')).toMatch(/user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
    expect(block('IntakeLog')).toMatch(/user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/);
    expect(block('IntakeLog')).toMatch(/plan\s+SupplementPlan\s+@relation\(fields: \[planId\], references: \[id\], onDelete: Cascade\)/);
  });
});

describe('exportação: o módulo não entra por padrão', () => {
  it('summary e os CSVs de refeições, peso, água e treinos não tocam as tabelas de suplementos', async () => {
    // Um Prisma SEM `intakeLog`/`supplementPlan`: qualquer acesso lança TypeError
    const empty = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      meal: { count, findMany: empty },
      mealItem: { count },
      weightEntry: { count, findMany: empty },
      workout: { count, findMany: empty },
      waterEntry: { count, groupBy: empty },
      waterDay: { findMany: empty },
      profile: { findUnique: jest.fn().mockResolvedValue({ kcalTarget: 2000, goalWeightKg: null, workoutEstimateEnabled: false, weightKg: 70 }) },
    };
    const svc = new ExportService(prisma as never);
    expect(await svc.summary('u', '2026-11-01', '2026-11-18')).not.toHaveProperty('supplements');
    for (const gen of [svc.mealsCsv('u', '2026-11-01', '2026-11-18'), svc.weightCsv('u', '2026-11-01', '2026-11-18'), svc.waterCsv('u', '2026-11-01', '2026-11-18'), svc.workoutsCsv('u', '2026-11-01', '2026-11-18')]) {
      let text = '';
      for await (const chunk of gen) text += chunk;
      expect(text.length).toBeGreaterThan(0);
    }
    expect(MEALS_HEADER).not.toContain('Item');
  });
});
