import { Prisma } from '@prisma/client';

/**
 * Prisma em memória, só com o que o módulo de suplementos usa (testes unitários sem banco). O comportamento fiel ao
 * Postgres (unicidade, cascata, `distinct`) é conferido nos testes com banco real (supplements.int.spec.ts).
 */
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const tick = () => new Date(Date.UTC(2026, 0, 1) + ++seq * 1000);
const val = (v: unknown) => (v instanceof Date ? v.getTime() : v);

export function fakePrisma() {
  const plans: Row[] = [];
  const logs: Row[] = [];
  const profiles = new Map<string, Row>();

  const cond = (value: unknown, c: unknown, row: Row, key: string): boolean => {
    if (key === 'plan') return plans.some((p) => p.id === row.planId && match(p, c as Row));
    if (c instanceof Date) return val(value) === c.getTime();
    if (c && typeof c === 'object') {
      const o = c as Row;
      const v = val(value) as number | string;
      if ('in' in o && !(o.in as unknown[]).includes(value)) return false;
      if ('gte' in o && !(v >= val(o.gte)!)) return false;
      if ('lte' in o && !(v <= val(o.lte)!)) return false;
      if ('lt' in o && !(v < val(o.lt)!)) return false;
      if ('not' in o && value === o.not) return false;
      return true;
    }
    return value === c;
  };
  const match = (row: Row, where: Row = {}) => Object.entries(where).every(([k, c]) => cond(row[k], c, row, k));
  const order = (rows: Row[], by: Row | Row[] = []) => {
    const keys = ([] as Row[]).concat(by).flatMap((o) => Object.entries(o));
    return [...rows].sort((a, b) => {
      for (const [k, dir] of keys) {
        const x = val(a[k]) as number;
        const y = val(b[k]) as number;
        if (x !== y) return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  };
  const withPlan = (l: Row) => ({ ...l, plan: plans.find((p) => p.id === l.planId) });
  const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

  const prisma = {
    profile: {
      findUnique: async ({ where }: Row) => profiles.get(where.userId) ?? null,
    },
    supplementPlan: {
      findMany: async ({ where, orderBy }: Row = {}) => order(plans.filter((p) => match(p, where)), orderBy),
      findFirst: async ({ where }: Row) => plans.find((p) => match(p, where)) ?? null,
      count: async ({ where }: Row = {}) => plans.filter((p) => match(p, where)).length,
      create: async ({ data }: Row) => {
        const row = { id: uuid(), archivedAt: null, createdAt: tick(), updatedAt: tick(), slots: ['ANY'], ...data };
        plans.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        const row = plans.find((p) => p.id === where.id)!;
        Object.assign(row, data, { updatedAt: tick() });
        return row;
      },
      deleteMany: async ({ where }: Row) => {
        const gone = plans.filter((p) => match(p, where));
        for (const p of gone) {
          plans.splice(plans.indexOf(p), 1);
          for (let i = logs.length - 1; i >= 0; i--) if (logs[i].planId === p.id) logs.splice(i, 1); // cascata
        }
        return { count: gone.length };
      },
    },
    intakeLog: {
      findMany: async ({ where, orderBy, distinct }: Row = {}) => {
        let rows = order(logs.filter((l) => match(l, where)), orderBy);
        if (distinct) {
          const seen = new Set<unknown>();
          rows = rows.filter((r) => (seen.has(r[distinct[0]]) ? false : (seen.add(r[distinct[0]]), true)));
        }
        return rows.map(withPlan);
      },
      findFirst: async ({ where }: Row) => {
        const l = logs.find((x) => match(x, where));
        return l ? withPlan(l) : null;
      },
      groupBy: async ({ where }: Row) => {
        const by = new Map<string, number>();
        for (const l of logs.filter((x) => match(x, where))) by.set(l.planId, Math.max(by.get(l.planId) ?? 0, l.date.getTime()));
        return [...by].map(([planId, t]) => ({ planId, _max: { date: new Date(t) } }));
      },
      create: async ({ data }: Row) => {
        if (logs.some((l) => l.planId === data.planId && l.date.getTime() === data.date.getTime() && l.slot === data.slot)) throw p2002();
        const row = { id: uuid(), createdAt: tick(), takenAt: null, site: null, note: null, doseUnitLabel: null, ...data };
        logs.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        const row = logs.find((l) => l.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      deleteMany: async ({ where }: Row) => {
        const gone = logs.filter((l) => match(l, where));
        for (const l of gone) logs.splice(logs.indexOf(l), 1);
        return { count: gone.length };
      },
    },
  };

  return {
    prisma,
    plans,
    logs,
    /** Perfil de teste (nascimento, módulo ligado). */
    setProfile: (userId: string, over: Row = {}) => profiles.set(userId, { birthDate: new Date('1990-01-01T00:00:00Z'), supplementsEnabled: true, ...over }),
  };
}
