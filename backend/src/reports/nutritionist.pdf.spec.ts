import 'reflect-metadata';
import { ForbiddenException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// pdf-parse 1.x (CommonJS): a 2.x usa módulos ESM do pdfjs, que o Jest padrão não carrega
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (data: Buffer) => Promise<{ text: string; numpages: number }>;
import { DISCLAIMER, NutritionistReportData, pdfFilename, renderNutritionistPdf } from './nutritionist.pdf';
import { PublicReportsController } from './shares.controller';

const day = (n: number, registered = true) => ({
  date: `2026-11-${String(10 + n).padStart(2, '0')}`,
  registered,
  kcal: registered ? 1800 + n : 0,
  protein: registered ? 110.5 : 0,
  carbs: registered ? 200 : 0,
  fat: registered ? 60.2 : 0,
  meals: registered ? [{ type: 'LUNCH', items: [{ name: 'Feijão carioca', grams: 120 }, { name: 'Pão de queijo', grams: 50 }] }] : [],
});

const DATA: NutritionistReportData = {
  name: 'Maria da Conceição',
  from: '2026-11-10',
  to: '2026-11-14',
  hideCalories: false,
  foods: true,
  targets: { kcal: 2000, protein: 120, carbs: 230, fat: 65 },
  days: [day(0), day(1), day(2, false), day(3), day(4)],
  loggedDays: 4,
  totalDays: 5,
  averages: { kcal: 1801.5, protein: 110.5, carbs: 200, fat: 60.2 },
  weight: { start: { date: '2026-11-10', trendKg: 92.9 }, end: { date: '2026-11-14', trendKg: 91.9 }, entries: 3 },
  water: { loggedDays: 4, avgMl: 2100 },
  workouts: { count: 2, totalMinutes: 90 },
};

async function textOf(buf: Buffer) {
  return (await pdfParse(buf)).text;
}

describe('PDF do relatório para o nutricionista', () => {
  it('é um PDF A4 com as seções, acentos corretos, resumo com % da meta e o rodapé com "Página X de Y"', async () => {
    const buf = await renderNutritionistPdf(DATA);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const t = await textOf(buf);
    for (const s of ['Relatório de alimentação', 'Maria da Conceição', 'Período: 10/11/2026 a 14/11/2026', 'Gerado em', 'Resumo', 'Dias registrados: 4 de 5', 'Média por dia', 'Registrado', 'Meta', '% da meta', 'Energia (kcal)', 'Proteína (g)', 'Carboidratos (g)', 'Gorduras (g)', 'Outros registros', 'Dia a dia', 'sem registro']) {
      expect(t).toContain(s);
    }
    expect(t).toContain('92,9 kg'); // vírgula decimal, número inteiro na mesma linha
    expect(t).toContain('91,9 kg em 14/11/2026');
    expect(t).toContain('Água: média de 2.100 ml');
    expect(t).toContain('Treinos: 2 treinos, 90 min no total');
    expect(t).toMatch(/Energia \(kcal\)[\s\S]*90%/); // 1801,5 / 2000 = 90%
    expect(t).toContain(DISCLAIMER.slice(0, 40));
    expect(t).toMatch(/Página 1 de 1/);
  });

  it('respeita as opções: com alimentos aparecem as refeições; sem, não', async () => {
    const withFoods = await textOf(await renderNutritionistPdf(DATA));
    expect(withFoods).toContain('Almoço: Feijão carioca (120 g), Pão de queijo (50 g)');
    const without = await textOf(await renderNutritionistPdf({ ...DATA, foods: false, days: DATA.days.map(({ meals, ...d }) => d) }));
    expect(without).not.toContain('Feijão carioca');
  });

  it('sem nome (opção) o cabeçalho não traz o nome; sem calorias saem as colunas de kcal; sem peso, sem a linha de peso', async () => {
    const t = await textOf(await renderNutritionistPdf({ ...DATA, name: '', hideCalories: true, weight: null }));
    expect(t).not.toContain('Maria da Conceição');
    expect(t).not.toContain('Energia (kcal)');
    expect(t).not.toMatch(/\bkcal\b/);
    expect(t).not.toContain('Peso (tendência');
    expect(t).toContain('Proteína (g)');
  });

  it('período longo gera várias páginas, com o cabeçalho da tabela repetido e "Página X de Y"', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...day(0), date: `2026-${String(8 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` }));
    const t = await textOf(await renderNutritionistPdf({ ...DATA, foods: false, days: many.map(({ meals, ...d }) => d), totalDays: 80, loggedDays: 80 }));
    expect(t).toMatch(/Página 1 de [2-9]/);
    expect(t).toMatch(/Página 2 de [2-9]/);
    expect((t.match(/P \(g\)/g) ?? []).length).toBeGreaterThanOrEqual(2); // cabeçalho repetido
  });

  it('nome do arquivo: relatorio-bocado-AAAA-MM-DD_a_AAAA-MM-DD.pdf', () => {
    expect(pdfFilename('2026-11-14', '2026-11-20')).toBe('relatorio-bocado-2026-11-14_a_2026-11-20.pdf');
  });
});

describe('PDF do link público: mesmas exigências da tela', () => {
  const make = (view: unknown) => {
    const shares = { view: jest.fn().mockResolvedValue(view), unlock: jest.fn() };
    const res = { setHeader: jest.fn() };
    const ctl = new PublicReportsController(shares as never, new ConfigService({}));
    return { shares, res, call: (cookie?: string) => ctl.pdf({ token: 'T'.repeat(24) }, { cookies: cookie ? { bocado_rs: cookie } : {} } as never, res as never) };
  };

  it('sem cookie de aparelho válido: recusa, não gera PDF e NUNCA consome vaga (não chama unlock)', async () => {
    const { shares, call } = make({ state: 'code' });
    await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    await expect(call('cookie-errado')).rejects.toBeInstanceOf(ForbiddenException);
    expect(shares.unlock).not.toHaveBeenCalled();
  });

  it('com cookie válido: entrega o PDF como anexo com o nome certo', async () => {
    const { call, res } = make({ state: 'report', report: DATA });
    const out = await call('cookie-bom');
    expect(out).toBeInstanceOf(StreamableFile);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="relatorio-bocado-2026-11-10_a_2026-11-14.pdf"');
  });
});
