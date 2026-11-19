import { isPrivateRoute, scrubPrivateRequest } from './private-routes';

describe('rotas privadas no monitoramento', () => {
  it('reconhece bem-estar, jejum, GLP-1, suplementos e as exportações sensíveis', () => {
    for (const url of [
      '/api/wellbeing/2026-11-19',
      '/api/wellbeing?from=2026-11-01&to=2026-11-19',
      '/api/fasting/current',
      '/api/fasting',
      '/api/glp1/summary?today=2026-11-19',
      '/api/supplements/plans',
      '/api/export/fasting.csv?period=30d',
      '/api/export/wellbeing/summary',
    ]) {
      expect(isPrivateRoute(url)).toBe(true);
    }
  });
  it('não confunde com rotas comuns', () => {
    for (const url of ['/api/meals', '/api/fasting-tips', '/api/export/meals.csv', '/api/wellbeingx', undefined]) {
      expect(isPrivateRoute(url)).toBe(false);
    }
  });
  it('em rota privada tira corpo, query string, cookies e cabeçalhos; nas outras não mexe', () => {
    const scrubbed = scrubPrivateRequest({
      method: 'PUT',
      url: '/api/wellbeing/2026-11-19?x=1',
      query_string: 'x=1',
      data: { nausea: 2, note: 'texto' },
      cookies: { bocado_session: 'abc' },
      headers: { cookie: 'abc' },
    });
    expect(scrubbed).toEqual({ method: 'PUT', url: '/api/wellbeing/2026-11-19' });
    const common = { method: 'GET', url: '/api/meals?x=1', data: { a: 1 } };
    expect(scrubPrivateRequest(common)).toBe(common);
    expect(scrubPrivateRequest(undefined)).toBeUndefined();
  });
});
