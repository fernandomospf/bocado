import { ConfigService } from '@nestjs/config';
import { DEVICE_COOKIE } from './share';
import { PublicReportsController } from './shares.controller';

describe('cookie de aparelho do link', () => {
  const expiresAt = new Date('2026-12-01T00:00:00Z');
  const service = { unlock: jest.fn().mockResolvedValue({ deviceToken: 'tok-aparelho', expiresAt, created: true }) };
  const run = async (env: Record<string, string> = {}) => {
    const res = { cookie: jest.fn() };
    const ctl = new PublicReportsController(service as never, new ConfigService(env));
    await ctl.unlock({ token: 'T0KEN' + 'x'.repeat(20) }, { code: 'ABCD2345' }, { ip: '1.2.3.4', cookies: {} } as never, res as never);
    return res.cookie.mock.calls as [string, string, Record<string, unknown>][];
  };

  it('httpOnly, Secure, SameSite=Strict, restrito à página e à API do link e válido até a expiração', async () => {
    const calls = await run();
    const token = 'T0KEN' + 'x'.repeat(20);
    expect(calls.map((c) => c[2].path)).toEqual([`/r/${token}`, `/api/public/reports/${token}`]);
    for (const [name, value, opts] of calls) {
      expect(name).toBe(DEVICE_COOKIE);
      expect(value).toBe('tok-aparelho');
      expect(opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', expires: expiresAt });
    }
  });
  it('Secure só cai com COOKIE_SECURE=false (http local)', async () => {
    expect((await run({ COOKIE_SECURE: 'false' }))[0][2].secure).toBe(false);
  });
  it('o código nunca vai para a resposta nem para o cookie', async () => {
    const calls = await run();
    expect(JSON.stringify(calls)).not.toContain('ABCD2345');
  });
});
