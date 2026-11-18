import { CanActivate, ExecutionContext, Global, INestApplication, Injectable, Logger, Module, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ExportModule } from '../export/export.module';
import { PrismaService } from '../prisma/prisma.service';
import { fakePrisma } from '../testing/supplements-fake';
import { SupplementsModule } from './supplements.module';

/**
 * HTTP de verdade (app Nest num porto efêmero, Prisma em memória): guard, filtro de exceções, middleware no-store,
 * validação e cabeçalhos. O usuário vem do cabeçalho x-test-user (no app real é o JwtAuthGuard).
 */
const fake = fakePrisma();

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const id = req.headers['x-test-user'];
    if (!id) throw new UnauthorizedException();
    req.user = { id, email: '' };
    return true;
  }
}
@Global()
@Module({ providers: [{ provide: PrismaService, useValue: fake.prisma }], exports: [PrismaService] })
class FakePrismaModule {}
@Module({ imports: [FakePrismaModule, SupplementsModule, ExportModule], providers: [{ provide: APP_GUARD, useClass: TestAuthGuard }] })
class TestModule {}

const SECRET = 'Segredo-XYZ-Nome';
const plan = { name: SECRET, category: 'MEDICATION', administration: 'INJECTION', doseAmount: 0.5, doseUnit: 'ML', scheduleType: 'DAILY', startDate: '2026-10-01', trackSite: true };

let app: INestApplication;
let base: string;
const ADULT = 'adult';
const ADULT_OFF = 'adult-off';
const MINOR = 'minor';

beforeAll(async () => {
  fake.setProfile(ADULT);
  fake.setProfile(ADULT_OFF, { supplementsEnabled: false });
  fake.setProfile(MINOR, { birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - 15, 0, 1)), supplementsEnabled: false });
  const nest = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false });
  nest.setGlobalPrefix('api');
  nest.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await nest.listen(0, '127.0.0.1');
  app = nest;
  base = (await nest.getUrl()).replace('[::1]', '127.0.0.1');
});
afterAll(async () => app.close());

/** Resposta com `json()` tipado como `any` (o corpo varia por rota). */
type Res = Omit<Response, 'json'> & { json: () => Promise<any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
const call = (user: string | null, method: string, path: string, body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { ...(user ? { 'x-test-user': user } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as Promise<Res>;

const ROUTES: [string, string, unknown?][] = [
  ['GET', '/supplements/plans'],
  ['POST', '/supplements/plans', plan],
  ['GET', '/supplements/day?date=2026-11-18'],
  ['POST', '/supplements/log', { planId: '11111111-1111-4111-8111-111111111111', date: '2026-11-18' }],
  ['POST', '/supplements/log/skip', { planId: '11111111-1111-4111-8111-111111111111', date: '2026-11-18' }],
  ['GET', '/supplements/history?from=2026-11-01&to=2026-11-18'],
  ['GET', '/supplements/weight-markers?from=2026-11-01&to=2026-11-18'],
  ['GET', '/supplements/plans/11111111-1111-4111-8111-111111111111/calendar.ics?time=08:00'],
  ['GET', '/export/supplements/summary?period=7d&to=2026-11-18'],
  ['GET', '/export/supplements.csv?period=7d&to=2026-11-18'],
];

describe('acesso: 403 neutro', () => {
  it('menor de 18 anos: mensagem fixa, em todas as rotas do módulo e da exportação', async () => {
    for (const [m, p, b] of ROUTES) {
      const res = await call(MINOR, m, p, b);
      expect([m, p, res.status]).toEqual([m, p, 403]);
      expect((await res.json()).message).toBe('Este recurso não está disponível para menores de 18 anos.');
    }
  });

  it('módulo desligado (supplementsEnabled = false): 403 neutro em todas as rotas', async () => {
    for (const [m, p, b] of ROUTES) {
      const res = await call(ADULT_OFF, m, p, b);
      expect([m, p, res.status]).toEqual([m, p, 403]);
      expect((await res.json()).message).toBe('Este recurso não está ativado.');
    }
  });

  it('sem sessão: 401 (e nenhum dado)', async () => {
    expect((await call(null, 'GET', '/supplements/plans')).status).toBe(401);
  });
});

describe('Cache-Control: no-store em todas as respostas do módulo (sucesso e erro)', () => {
  it('200, 201, 204, 400, 403 e 404', async () => {
    const created = await call(ADULT, 'POST', '/supplements/plans', plan);
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const { id } = await created.json();
    const checks: [number, Res][] = [
      [200, await call(ADULT, 'GET', '/supplements/plans')],
      [200, await call(ADULT, 'GET', '/supplements/day?date=2026-11-18')],
      [200, await call(ADULT, 'GET', '/supplements/weight-markers?from=2026-11-01&to=2026-11-18')],
      [200, await call(ADULT, 'GET', '/supplements/history?from=2026-11-01&to=2026-11-18')],
      [400, await call(ADULT, 'GET', '/supplements/day?date=amanha')],
      [403, await call(ADULT_OFF, 'GET', '/supplements/plans')],
      [404, await call(ADULT, 'PATCH', '/supplements/plans/22222222-2222-4222-8222-222222222222', { notes: 'x' })],
      [200, await call(ADULT, 'GET', `/supplements/plans/${id}/calendar.ics?time=08:00`)],
      [204, await call(ADULT, 'DELETE', `/supplements/plans/${id}`)],
    ];
    for (const [status, res] of checks) {
      expect([status, res.status]).toEqual([status, status]);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('validação: nada do que a pessoa digitou volta na mensagem de erro', () => {
  it('rejeita campos fora do contrato (inclusive userId) e valores inválidos, sem repetir o valor', async () => {
    const bad: Record<string, unknown>[] = [
      { ...plan, name: '' },
      { ...plan, name: 'x'.repeat(61) },
      { ...plan, doseAmount: 0 },
      { ...plan, doseAmount: -1 },
      { ...plan, doseAmount: 100_001 },
      { ...plan, doseUnit: 'OTHER' },
      { ...plan, scheduleType: 'WEEKDAYS' },
      { ...plan, scheduleType: 'EVERY_N_DAYS', intervalDays: 1 },
      { ...plan, scheduleType: 'EVERY_N_DAYS', intervalDays: 91 },
      { ...plan, notes: 'n'.repeat(281) },
      { ...plan, userId: 'outro' },
    ];
    for (const body of bad) {
      const res = await call(ADULT, 'POST', '/supplements/plans', { ...body, name: body.name === '' || body.name === 'x'.repeat(61) ? body.name : SECRET });
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    }
  });

  it('a dose NÃO tem validação de faixa: valores altos, baixos e quebrados são aceitos como digitados', async () => {
    for (const doseAmount of [0.001, 7.25, 99_999, 100_000]) {
      const res = await call(ADULT, 'POST', '/supplements/plans', { ...plan, name: `Dose ${doseAmount}`, doseAmount });
      expect([doseAmount, res.status]).toEqual([doseAmount, 201]);
      expect((await res.json()).doseAmount).toBe(doseAmount);
    }
  });
});

describe('calendário .ics', () => {
  it('anexo com nome de arquivo genérico, sem nome nem dose do plano; horário inválido = 400', async () => {
    const { id } = await (await call(ADULT, 'POST', '/supplements/plans', { ...plan, name: 'Nome Reservado' })).json();
    const res = await call(ADULT, 'GET', `/supplements/plans/${id}/calendar.ics?time=07:30`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="bocado-lembrete.ics"');
    const body = await res.text();
    expect(body).toContain('SUMMARY:Lembrete do Bocado');
    expect(body).not.toMatch(/Nome Reservado|0,5/);
    expect((await call(ADULT, 'GET', `/supplements/plans/${id}/calendar.ics?time=25:99`)).status).toBe(400);
    expect((await call(ADULT, 'GET', `/supplements/plans/${id}/calendar.ics`)).status).toBe(400);
    // outro usuário: 404, nunca o arquivo
    expect((await call(ADULT_OFF, 'GET', `/supplements/plans/${id}/calendar.ics?time=07:30`)).status).toBe(403);
  });
});

describe('exportação de suplementos (dado sensível, opt-in)', () => {
  it('CSV só com o módulo ativado, sem cache; cabeçalho no formato das demais (BOM, ";", CRLF)', async () => {
    const res = await call(ADULT, 'GET', '/export/supplements.csv?period=7d&to=2026-11-18');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('bocado-suplementos-');
    // arrayBuffer: o text() do fetch descarta o BOM
    expect(Buffer.from(await res.arrayBuffer()).toString('utf8')).toBe('\ufeffData;Item;Dose;Unidade;Status;Local\r\n');
  });
});

describe('logs: nenhum corpo, nome ou detalhe de erro vai para o log', () => {
  it('erro interno (ex.: o Prisma carrega os argumentos da consulta): resposta e log genéricos', async () => {
    const calls: unknown[][] = [];
    const spies = (['log', 'error', 'warn', 'debug', 'verbose'] as const).map((k) => jest.spyOn(Logger.prototype, k).mockImplementation((...a: unknown[]) => void calls.push(a)));
    const spyConsole = (['log', 'error', 'warn'] as const).map((k) => jest.spyOn(console, k).mockImplementation((...a: unknown[]) => void calls.push(a)));
    const original = fake.prisma.supplementPlan.create;
    fake.prisma.supplementPlan.create = async () => {
      throw Object.assign(new Error(`Invalid \`prisma.supplementPlan.create()\` invocation: data: { name: "${SECRET}", doseAmount: 0.5 }`), { code: 'P2000' });
    };
    try {
      const res = await call(ADULT, 'POST', '/supplements/plans', { ...plan, name: SECRET });
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).not.toContain(SECRET);
      expect(JSON.parse(text)).toEqual({ statusCode: 500, message: 'Internal server error' });
      const logged = JSON.stringify(calls);
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('0.5');
      expect(logged).not.toMatch(/at .*\(.*\.ts/); // sem pilha
      expect(logged).toContain('POST /api/supplements/plans');
      expect(logged).toContain('detalhes omitidos');
    } finally {
      fake.prisma.supplementPlan.create = original;
      [...spies, ...spyConsole].forEach((s) => s.mockRestore());
    }
  });

  it('requisições normais (com corpo e query) não escrevem nada no log', async () => {
    const calls: unknown[][] = [];
    const spies = (['log', 'error', 'warn', 'debug', 'verbose'] as const).map((k) => jest.spyOn(Logger.prototype, k).mockImplementation((...a: unknown[]) => void calls.push(a)));
    try {
      await call(ADULT, 'POST', '/supplements/plans', { ...plan, name: SECRET });
      await call(ADULT, 'GET', '/supplements/history?from=2026-11-01&to=2026-11-18');
      await call(ADULT, 'POST', '/supplements/plans', { ...plan, name: '' }); // 400
      expect(JSON.stringify(calls)).not.toContain(SECRET);
      expect(calls).toHaveLength(0);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
