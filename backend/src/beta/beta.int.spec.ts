/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminGuard } from '../admin/admin.guard';
import { AdminService } from '../admin/admin.service';
import { AccountService } from '../account/account.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { BETA_INVITE_COOKIE } from '../auth/auth.types';
import { GoogleAuthGuard } from '../auth/guards/google-auth.guard';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { BetaConfig } from './beta.config';
import { BETA_FULL_MESSAGE, INVITE_INVALID_MESSAGE } from './beta.errors';
import { BetaService } from './beta.service';
import { WaitlistService } from './waitlist.service';

describeDb('Acesso por convite do beta (banco real)', () => {
  let prisma: PrismaService;
  const env: Record<string, string | undefined> = {};
  const config = { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] } as unknown as ConfigService;
  let betaConfig: BetaConfig;
  let beta: BetaService;
  let auth: AuthService;
  let admin: AdminService;
  let waitlist: WaitlistService;
  let guard: AdminGuard;
  let jwt: JwtService;
  let controller: AuthController;

  beforeAll(() => {
    prisma = createTestPrisma();
    betaConfig = new BetaConfig(config);
    beta = new BetaService(prisma, betaConfig);
    jwt = new JwtService({ secret: 'x'.repeat(40) });
    auth = new AuthService(prisma, jwt, config, beta);
    admin = new AdminService(prisma, beta, betaConfig);
    waitlist = new WaitlistService(prisma, betaConfig);
    guard = new AdminGuard(prisma, betaConfig);
    controller = new AuthController(auth, config);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await cleanDb(prisma);
    for (const k of Object.keys(env)) delete env[k];
    env.APP_URL = 'https://bocado.test';
    env.REGISTRATION_MODE = 'invite';
  });

  let n = 0;
  const reg = (invite?: string, over: Record<string, string> = {}) => {
    n += 1;
    return auth.register({ name: 'Pessoa Teste', email: `beta${Date.now()}${n}@teste.local`, password: 'senha-forte-1', inviteCode: invite, ...over } as any);
  };
  const newInvite = (data: Partial<{ maxUses: number; expiresAt: Date | null; revokedAt: Date | null; uses: number }> = {}) =>
    prisma.betaInvite.create({ data: { code: beta.newCode(), label: 'Teste', maxUses: 1, ...data } });
  const rejects = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      return (e as Error).message;
    }
    throw new Error('deveria ter rejeitado');
  };

  // ---------------------------------------------------------------- convite (e-mail)
  describe('cadastro com convite', () => {
    it('convite válido cria o usuário, consome um uso e registra quem entrou', async () => {
      const inv = await newInvite({ maxUses: 2 });
      const user = await reg(inv.code);
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: inv.id } })).uses).toBe(1);
      expect(await prisma.betaInviteUse.findUnique({ where: { userId: user.id } })).toMatchObject({ inviteId: inv.id });
      await reg(inv.code);
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: inv.id } })).uses).toBe(2);
    });

    it('código em minúsculas e com espaços também vale', async () => {
      const inv = await newInvite();
      await expect(reg(`  ${inv.code.toLowerCase()} `)).resolves.toBeDefined();
    });

    it('expirado, revogado, esgotado, inexistente e ausente: a MESMA mensagem genérica, e nenhum usuário é criado', async () => {
      const expired = await newInvite({ expiresAt: new Date(Date.now() - 1000) });
      const revoked = await newInvite({ revokedAt: new Date() });
      const used = await newInvite({ maxUses: 1, uses: 1 });
      const before = await prisma.user.count();
      const messages = [
        await rejects(reg(expired.code)),
        await rejects(reg(revoked.code)),
        await rejects(reg(used.code)),
        await rejects(reg('ZZZZZZZZ')),
        await rejects(reg(undefined)),
        await rejects(reg('')),
      ];
      expect(new Set(messages)).toEqual(new Set([INVITE_INVALID_MESSAGE]));
      expect(await prisma.user.count()).toBe(before);
      expect(await prisma.betaInviteUse.count()).toBe(0);
    });

    it('convite sem data de validade nunca expira', async () => {
      const inv = await newInvite({ expiresAt: null });
      await expect(reg(inv.code)).resolves.toBeDefined();
    });

    it('concorrência: 2 cadastros simultâneos no mesmo convite de uso único, só um conclui', async () => {
      const inv = await newInvite({ maxUses: 1 });
      const results = await Promise.allSettled([reg(inv.code), reg(inv.code), reg(inv.code)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
      const row = await prisma.betaInvite.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.uses).toBe(1);
      expect(await prisma.betaInviteUse.count({ where: { inviteId: inv.id } })).toBe(1);
    });

    it('o convite NÃO é consumido quando a criação do usuário falha (e-mail repetido)', async () => {
      const first = await newInvite();
      const dup = await reg(first.code);
      const second = await newInvite();
      await expect(auth.register({ name: 'Outra', email: dup.email, password: 'senha-forte-1', inviteCode: second.code } as any)).rejects.toBeInstanceOf(ConflictException);
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: second.id } })).uses).toBe(0);
      // falha no meio da transação: usuário desfeito junto
      const third = await newInvite();
      const before = await prisma.user.count();
      await expect(
        beta.admitNewUser(async (tx) => {
          const u = await tx.user.create({ data: { email: `x${Date.now()}@teste.local`, name: 'X' } });
          await tx.betaInviteUse.create({ data: { inviteId: third.id, userId: u.id } }); // força conflito depois
          return u;
        }, third.code),
      ).rejects.toBeDefined();
      expect(await prisma.user.count()).toBe(before);
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: third.id } })).uses).toBe(0);
    });

    it('modo "open" ignora o convite (não consome e não exige)', async () => {
      env.REGISTRATION_MODE = 'open';
      const inv = await newInvite();
      await expect(reg(undefined)).resolves.toBeDefined();
      await expect(reg(inv.code)).resolves.toBeDefined();
      await expect(reg('INVALIDO')).resolves.toBeDefined();
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: inv.id } })).uses).toBe(0);
      expect(await prisma.betaInviteUse.count()).toBe(0);
    });

    it('login e contas existentes não dependem do modo', async () => {
      env.REGISTRATION_MODE = 'open';
      const u = await reg(undefined, { password: 'senha-forte-1' });
      env.REGISTRATION_MODE = 'invite';
      await expect(auth.login({ email: u.email, password: 'senha-forte-1' } as any)).resolves.toMatchObject({ id: u.id });
    });
  });

  // ---------------------------------------------------------------- vagas
  describe('BETA_MAX_USERS', () => {
    it('bloqueia NOVOS cadastros no limite, mesmo com convite válido, sem consumir o convite', async () => {
      const inv = await newInvite({ maxUses: 5 });
      env.BETA_MAX_USERS = String((await prisma.user.count()) + 1);
      await reg(inv.code);
      expect(await rejects(reg(inv.code))).toBe(BETA_FULL_MESSAGE);
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: inv.id } })).uses).toBe(1);
      expect(await beta.seatsOpen()).toBe(false);
      // vale também no modo aberto
      env.REGISTRATION_MODE = 'open';
      expect(await rejects(reg(undefined))).toBe(BETA_FULL_MESSAGE);
    });

    it('com vaga sobrando, seatsOpen é true; sem limite, sempre true', async () => {
      expect(await beta.seatsOpen()).toBe(true);
      env.BETA_MAX_USERS = String((await prisma.user.count()) + 3);
      expect(await beta.seatsOpen()).toBe(true);
    });

    it('cadastros simultâneos não furam o limite', async () => {
      env.REGISTRATION_MODE = 'open';
      env.BETA_MAX_USERS = String((await prisma.user.count()) + 2);
      const results = await Promise.allSettled([reg(), reg(), reg(), reg(), reg()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    });

    it('/auth/providers informa o modo e as vagas', async () => {
      expect(await controller.providers()).toMatchObject({ registration: 'invite', seatsOpen: true });
      await makeUser(prisma, 'Vaga'); // BETA_MAX_USERS precisa ser >= 1
      env.BETA_MAX_USERS = String(await prisma.user.count());
      expect(await controller.providers()).toMatchObject({ registration: 'invite', seatsOpen: false });
    });
  });

  // ---------------------------------------------------------------- Google
  describe('Google', () => {
    const google = (over: Record<string, unknown> = {}) => ({
      googleId: `g${Date.now()}${Math.random()}`,
      email: `g${Date.now()}${Math.random()}@teste.local`,
      emailVerified: true,
      name: 'Pessoa Google',
      ...over,
    });
    const res = () => {
      const out: any = { redirected: null, cleared: [] as string[], cookies: {} as Record<string, unknown> };
      out.redirect = (url: string) => (out.redirected = url);
      out.cookie = (name: string, value: string, opts: unknown) => (out.cookies[name] = { value, opts });
      out.clearCookie = (name: string) => out.cleared.push(name);
      return out;
    };
    const callback = async (user: any, cookie?: string) => {
      const r = res();
      await controller.googleCallback({ user, cookies: cookie ? { [BETA_INVITE_COOKIE]: cookie } : {} } as any, r);
      return r;
    };

    it('conta existente (por googleId ou e-mail verificado) entra sem convite', async () => {
      const g = google();
      const created = await auth.createGoogleUser(g as any, null).catch(() => null);
      expect(created).toBeNull(); // modo invite: sem convite não cria
      env.REGISTRATION_MODE = 'open';
      const u = await auth.createGoogleUser(g as any, null);
      env.REGISTRATION_MODE = 'invite';
      expect(await auth.resolveGoogleLogin(g as any)).toMatchObject({ user: { id: u.id } });
      // existente só por e-mail: vincula o googleId e entra
      const local = await makeUser(prisma, 'Local');
      const linked = await auth.resolveGoogleLogin(google({ email: local.email }) as any);
      expect(linked).toMatchObject({ user: { id: local.id } });
      // e-mail não verificado não vincula
      await expect(auth.resolveGoogleLogin(google({ email: local.email, emailVerified: false }) as any)).rejects.toBeDefined();
    });

    it('a estratégia nunca cria o usuário: conta nova só volta como "newAccount"', async () => {
      const before = await prisma.user.count();
      const out = await auth.resolveGoogleLogin(google() as any);
      expect(out).toHaveProperty('newAccount');
      expect(await prisma.user.count()).toBe(before);
    });

    it('callback: novo SEM convite é recusado (login?error=invite) e não cria usuário', async () => {
      const before = await prisma.user.count();
      const r = await callback({ newAccount: google() });
      expect(r.redirected).toBe('https://bocado.test/login?error=invite');
      expect(await prisma.user.count()).toBe(before);
      const bad = await callback({ newAccount: google() }, jwt.sign({ purpose: 'outro', code: 'ABCDEFGH' }));
      expect(bad.redirected).toContain('error=invite');
      const garbage = await callback({ newAccount: google() }, 'lixo');
      expect(garbage.redirected).toContain('error=invite');
    });

    it('callback: novo COM o convite do cookie entra, consome o uso e abre a sessão', async () => {
      const inv = await newInvite();
      const g = google();
      const r = await callback({ newAccount: g }, auth.signInviteCookie(inv.code));
      expect(r.redirected).toBe('https://bocado.test/');
      expect(r.cookies).toHaveProperty('bocado_session');
      const u = await prisma.user.findUniqueOrThrow({ where: { googleId: g.googleId } });
      expect(await prisma.betaInviteUse.findUnique({ where: { userId: u.id } })).toMatchObject({ inviteId: inv.id });
      // o mesmo convite de uso único não serve de novo
      const again = await callback({ newAccount: google() }, auth.signInviteCookie(inv.code));
      expect(again.redirected).toContain('error=invite');
    });

    it('callback: vagas esgotadas redireciona para ?error=full', async () => {
      const inv = await newInvite();
      await makeUser(prisma, 'Vaga');
      env.BETA_MAX_USERS = String(await prisma.user.count());
      const r = await callback({ newAccount: google() }, auth.signInviteCookie(inv.code));
      expect(r.redirected).toBe('https://bocado.test/login?error=full');
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: inv.id } })).uses).toBe(0);
    });

    it('callback: conta existente entra mesmo em modo invite', async () => {
      const u = await makeUser(prisma, 'Existente');
      const r = await callback({ user: u });
      expect(r.redirected).toBe('https://bocado.test/');
    });

    it('?invite= vira cookie assinado de 10 min (httpOnly, path /api/auth/google); sem convite válido, o cookie é limpo', async () => {
      const g = new GoogleAuthGuard(config, auth);
      const inv = await newInvite();
      const run = (invite?: string) => {
        const r = res();
        const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ query: invite ? { invite } : {} }), getResponse: () => r }) };
        g.getAuthenticateOptions(ctx);
        return r;
      };
      const ok = run(inv.code.toLowerCase());
      const c = ok.cookies[BETA_INVITE_COOKIE];
      expect(c.opts).toMatchObject({ httpOnly: true, path: '/api/auth/google', maxAge: 600_000 });
      expect(auth.readInviteCookie(c.value)).toBe(inv.code);
      expect(auth.readInviteCookie(`${c.value}x`)).toBeNull(); // adulterado
      const bad = run('curto');
      expect(bad.cookies[BETA_INVITE_COOKIE]).toBeUndefined();
      expect(bad.cleared).toContain(BETA_INVITE_COOKIE);
    });

    it('o guard do callback limpa o cookie do convite', async () => {
      const { GoogleCallbackGuard } = await import('../auth/guards/google-auth.guard');
      env.GOOGLE_CLIENT_ID = 'x';
      env.GOOGLE_CLIENT_SECRET = 'y';
      const g = new GoogleCallbackGuard(config);
      const r = res();
      const ctx: any = { switchToHttp: () => ({ getRequest: () => ({ cookies: {}, query: {} }), getResponse: () => r }) };
      expect(() => g.canActivate(ctx)).toThrow(); // state inválido
      expect(r.cleared).toContain(BETA_INVITE_COOKIE);
    });
  });

  // ---------------------------------------------------------------- lista de espera
  describe('lista de espera', () => {
    const body = (over: Record<string, unknown> = {}) => ({ email: `W${Date.now()}${Math.random()}@Teste.Local `.trim().toLowerCase(), consent: true, ...over }) as any;

    it('grava e-mail normalizado, nome e consentimento (sem IP nem user-agent)', async () => {
      const b = body({ name: 'Maria' });
      expect(await waitlist.join(b)).toEqual({ ok: true });
      const row = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: b.email } });
      expect(row).toMatchObject({ name: 'Maria', status: 'PENDING' });
      expect(row.consentAt).toBeInstanceOf(Date);
      expect(Object.keys(row).sort()).toEqual(['consentAt', 'createdAt', 'email', 'id', 'inviteId', 'invitedAt', 'name', 'status']);
    });

    it('e-mail repetido responde igual e não altera nada', async () => {
      const b = body({ name: 'Primeiro' });
      const a = await waitlist.join(b);
      const again = await waitlist.join({ ...b, name: 'Outro nome' });
      expect(again).toEqual(a);
      expect(await prisma.waitlistEntry.count({ where: { email: b.email } })).toBe(1);
      expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: b.email } })).name).toBe('Primeiro');
    });

    it('honeypot preenchido: responde igual e não grava', async () => {
      const b = body({ website: 'http://spam.example' });
      expect(await waitlist.join(b)).toEqual({ ok: true });
      expect(await prisma.waitlistEntry.count()).toBe(0);
    });

    it('limite de 3 por hora por e-mail', async () => {
      const b = body();
      for (let i = 0; i < 3; i++) await waitlist.join(b);
      await expect(waitlist.join(b)).rejects.toBeInstanceOf(HttpException);
      await expect(waitlist.join(b)).rejects.toMatchObject({ status: 429 });
      await expect(waitlist.join(body())).resolves.toEqual({ ok: true }); // outro e-mail não é afetado
    });

    describe('Turnstile', () => {
      const realFetch = global.fetch;
      afterEach(() => {
        global.fetch = realFetch;
      });
      it('sem TURNSTILE_SECRET, não consulta o Cloudflare', async () => {
        const spy = jest.fn();
        global.fetch = spy as any;
        await waitlist.join(body());
        expect(spy).not.toHaveBeenCalled();
      });
      it('com secret: exige o token e valida na API (success)', async () => {
        env.TURNSTILE_SECRET = 'segredo';
        await expect(waitlist.join(body())).rejects.toBeInstanceOf(BadRequestException);
        const spy = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });
        global.fetch = spy as any;
        await expect(waitlist.join(body({ turnstileToken: 'tok' }))).resolves.toEqual({ ok: true });
        expect(spy.mock.calls[0][0]).toContain('challenges.cloudflare.com/turnstile');
        expect(String(spy.mock.calls[0][1].body)).toContain('secret=segredo');
        expect(String(spy.mock.calls[0][1].body)).not.toContain('remoteip'); // sem IP
      });
      it('token recusado, erro de rede ou timeout = 400, e nada é gravado', async () => {
        env.TURNSTILE_SECRET = 'segredo';
        for (const impl of [
          async () => ({ json: async () => ({ success: false }) }),
          async () => {
            throw new Error('rede');
          },
          async () => {
            throw new DOMException('timeout', 'TimeoutError');
          },
        ]) {
          global.fetch = jest.fn(impl as any) as any;
          await expect(waitlist.join(body({ turnstileToken: 'tok' }))).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(await prisma.waitlistEntry.count()).toBe(0);
      });
    });
  });

  // ---------------------------------------------------------------- admin
  describe('admin', () => {
    const ctxFor = (userId?: string): any => ({ switchToHttp: () => ({ getRequest: () => ({ user: userId ? { id: userId, email: 'x' } : undefined }) }) });

    it('AdminGuard: 403 para não admin, sem sessão ou sem ADMIN_EMAILS; ok para admin (case-insensitive)', async () => {
      const admin1 = await makeUser(prisma, 'Admin');
      const other = await makeUser(prisma, 'Outro');
      await expect(guard.canActivate(ctxFor(admin1.id))).rejects.toBeInstanceOf(ForbiddenException); // lista vazia
      env.ADMIN_EMAILS = ` ${admin1.email.toUpperCase()} , outro@x.com `;
      await expect(guard.canActivate(ctxFor(admin1.id))).resolves.toBe(true);
      await expect(guard.canActivate(ctxFor(other.id))).rejects.toBeInstanceOf(ForbiddenException);
      await expect(guard.canActivate(ctxFor())).rejects.toBeInstanceOf(ForbiddenException);
      // e-mail de admin que ainda não tem conta não vira admin: vale só para contas existentes
      env.ADMIN_EMAILS = 'ninguem@teste.local';
      await expect(guard.canActivate(ctxFor(other.id))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('convite gerado a partir da lista liga a entrada, muda o status e devolve a mensagem pronta', async () => {
      const root = await makeUser(prisma, 'Root');
      await waitlist.join({ email: 'maria@teste.local', name: 'Maria Souza', consent: true } as any);
      const entry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: 'maria@teste.local' } });
      const out = await admin.inviteFromWaitlist(root.id, entry.id);

      const invite = await prisma.betaInvite.findUniqueOrThrow({ where: { code: out.code } });
      expect(invite).toMatchObject({ maxUses: 1, uses: 0, label: 'maria@teste.local', createdById: root.id });
      const days = (invite.expiresAt!.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(13.9);
      expect(days).toBeLessThanOrEqual(14);
      const row = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(row).toMatchObject({ status: 'INVITED', inviteId: invite.id });
      expect(row.invitedAt).toBeInstanceOf(Date);
      expect(out.link).toBe(`https://bocado.test/register?invite=${out.code}`);
      expect(out.message).toMatch(/^Oi, Maria! Seu convite para o Bocado: https:\/\/bocado\.test\/register\?invite=[A-Z2-9]{8}\. Vale até \d{2}\/\d{2}\/\d{4}\. Qualquer dúvida é só responder\.$/);

      // "Reenviar texto": mesmo convite, nenhum novo
      const again = await admin.inviteFromWaitlist(root.id, entry.id);
      expect(again.code).toBe(out.code);
      expect(await prisma.betaInvite.count()).toBe(1);
    });

    it('mensagem sem nome: "Oi!"', async () => {
      const root = await makeUser(prisma, 'Root');
      await waitlist.join({ email: 'semnome@teste.local', consent: true } as any);
      const entry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: 'semnome@teste.local' } });
      expect((await admin.inviteFromWaitlist(root.id, entry.id)).message).toMatch(/^Oi! Seu convite/);
    });

    it('JOINED ao cadastrar (pelo e-mail ou pelo convite ligado à entrada)', async () => {
      const root = await makeUser(prisma, 'Root');
      await waitlist.join({ email: 'joao@teste.local', consent: true } as any);
      const entry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: 'joao@teste.local' } });
      const { code } = await admin.inviteFromWaitlist(root.id, entry.id);
      // a pessoa se cadastra com OUTRO e-mail, mas pelo convite ligado à entrada
      await reg(code);
      expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe('JOINED');

      // pelo e-mail, sem convite ligado (modo aberto)
      env.REGISTRATION_MODE = 'open';
      await waitlist.join({ email: 'ana@teste.local', consent: true } as any);
      await auth.register({ name: 'Ana', email: 'ana@teste.local', password: 'senha-forte-1' } as any);
      expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: 'ana@teste.local' } })).status).toBe('JOINED');
    });

    it('convite manual, listagem com status, revogação e estatísticas', async () => {
      const root = await makeUser(prisma, 'Root');
      env.BETA_MAX_USERS = '999';
      const manual = await admin.createInvite(root.id, { label: 'Pessoal do trabalho', maxUses: 5, expiresInDays: 7 } as any);
      const open = await admin.createInvite(root.id, { label: 'Sem validade', maxUses: 1 } as any);
      expect((await prisma.betaInvite.findUniqueOrThrow({ where: { id: open.id } })).expiresAt).toBeNull();
      await reg(manual.code);

      const list = await admin.invites();
      expect(list.find((i) => i.id === manual.id)).toMatchObject({ uses: 1, maxUses: 5, status: 'active' });
      let stats = await admin.stats();
      expect(stats).toMatchObject({ seatsLimit: 999, invitesActive: 2, invitesUsed: 1, waitlistPending: 0 });

      await admin.revokeInvite(manual.id);
      expect((await admin.invites()).find((i) => i.id === manual.id)!.status).toBe('revoked');
      await rejects(reg(manual.code));
      stats = await admin.stats();
      expect(stats.invitesActive).toBe(1);
      await expect(admin.revokeInvite('00000000-0000-4000-8000-000000000000')).rejects.toBeDefined();
    });

    it('lista paginada (50), mais antigos primeiro, com filtro de status; remover revoga convite não usado', async () => {
      const root = await makeUser(prisma, 'Root');
      for (let i = 0; i < 53; i++) {
        await prisma.waitlistEntry.create({ data: { email: `p${String(i).padStart(2, '0')}@teste.local`, consentAt: new Date(), createdAt: new Date(Date.now() - (100 - i) * 1000) } });
      }
      const p1 = await admin.waitlist(undefined, 1);
      const p2 = await admin.waitlist(undefined, 2);
      expect(p1.items).toHaveLength(50);
      expect(p2.items).toHaveLength(3);
      expect(p1.total).toBe(53);
      expect(p1.items[0].email).toBe('p00@teste.local');
      expect(p1.items.some((x: any) => 'consentAt' in x)).toBe(false);

      const entry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: 'p00@teste.local' } });
      const { code } = await admin.inviteFromWaitlist(root.id, entry.id);
      expect((await admin.waitlist('INVITED')).items.map((x) => x.email)).toEqual(['p00@teste.local']);
      await admin.removeFromWaitlist(entry.id);
      expect(await prisma.waitlistEntry.findUnique({ where: { id: entry.id } })).toBeNull();
      await rejects(reg(code)); // o convite ligado a ela foi revogado
      await expect(admin.removeFromWaitlist(entry.id)).rejects.toBeDefined();
    });
  });

  // ---------------------------------------------------------------- conta
  it('exclusão de conta: BetaInviteUse cai por Cascade, o convite permanece e a lista não é recriada', async () => {
    const inv = await newInvite({ maxUses: 3 });
    await waitlist.join({ email: 'saida@teste.local', consent: true } as any);
    const user = await reg(inv.code, { email: 'saida@teste.local' });
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: 'saida@teste.local' } })).status).toBe('JOINED');

    await new AccountService(prisma).deleteAccount(user.id, { confirmation: 'EXCLUIR', password: 'senha-forte-1' } as any);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.betaInviteUse.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.betaInvite.findUnique({ where: { id: inv.id } })).not.toBeNull();
    // não recria a entrada na lista
    expect(await prisma.waitlistEntry.count({ where: { email: 'saida@teste.local' } })).toBe(1);
    expect(await prisma.waitlistEntry.count()).toBe(1);
  });
});
