import { join } from 'node:path';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

// pdfmake 0.3 (servidor, sem navegador): fontes TTF embutidas em backend/assets/fonts (suportam acentos do português)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake') as {
  setFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(doc: TDocumentDefinitions): { getBuffer(): Promise<Buffer> };
};

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
pdfmake.setFonts({
  Roboto: {
    normal: join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
});

/** Os mesmos dados da tela (ReportsService.nutritionist): uma única fonte para tela e PDF. */
export interface NutritionistReportData {
  name: string;
  from: string;
  to: string;
  hideCalories: boolean;
  foods?: boolean;
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  days: { date: string; registered: boolean; kcal: number; protein: number; carbs: number; fat: number; meals?: { type: string; items: { name: string; grams: number }[] }[] }[];
  loggedDays: number;
  totalDays: number;
  averages: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
  weight: { start: { date: string; trendKg: number }; end: { date: string; trendKg: number }; entries: number } | null;
  water: { loggedDays: number; avgMl: number } | null;
  workouts: { count: number; totalMinutes: number } | null;
}

export const DISCLAIMER = 'Dados registrados pela própria pessoa no Bocado; as estimativas por foto e descrição são aproximadas.';
const MEAL_LABEL: Record<string, string> = { BREAKFAST: 'Café da manhã', LUNCH: 'Almoço', SNACK: 'Lanche', DINNER: 'Jantar' };

const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const br = (iso: string) => iso.split('-').reverse().join('/');
const brShort = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

export const pdfFilename = (from: string, to: string) => `relatorio-bocado-${from}_a_${to}.pdf`;

const GRID = { hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => '#999999', paddingTop: () => 3, paddingBottom: () => 3 };

/** A4 retrato, margens de 15 mm, cabeçalho de tabela repetido, rodapé em todas as páginas. Sem cores de julgamento (só preto e cinza). */
export function buildNutritionistDoc(d: NutritionistReportData, generatedAt = new Date()): TDocumentDefinitions {
  const hide = d.hideCalories;
  const generated = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(generatedAt);
  const pct = (v: number | null, goal: number) => (v === null || goal <= 0 ? '—' : `${nf0.format(Math.round((v / goal) * 100))}%`);

  const avgRows: TableCell[][] = [
    ...(hide ? [] : [['Energia (kcal)', d.averages.kcal === null ? '—' : nf0.format(d.averages.kcal), nf0.format(d.targets.kcal), pct(d.averages.kcal, d.targets.kcal)]]),
    ['Proteína (g)', d.averages.protein === null ? '—' : nf1.format(d.averages.protein), nf0.format(d.targets.protein), pct(d.averages.protein, d.targets.protein)],
    ['Carboidratos (g)', d.averages.carbs === null ? '—' : nf1.format(d.averages.carbs), nf0.format(d.targets.carbs), pct(d.averages.carbs, d.targets.carbs)],
    ['Gorduras (g)', d.averages.fat === null ? '—' : nf1.format(d.averages.fat), nf0.format(d.targets.fat), pct(d.averages.fat, d.targets.fat)],
  ].map((r) => r.map((c, i) => ({ text: c, alignment: i === 0 ? 'left' : 'right' }) as TableCell));

  const head = (cells: string[]): TableCell[] => cells.map((c, i) => ({ text: c, bold: true, alignment: i === 0 ? 'left' : 'right', fillColor: '#eeeeee' }));

  const others: Content[] = [];
  if (d.weight) others.push({ text: `Peso (tendência de 7 dias): ${nf1.format(d.weight.start.trendKg)} kg em ${br(d.weight.start.date)} e ${nf1.format(d.weight.end.trendKg)} kg em ${br(d.weight.end.date)} (${d.weight.entries} ${d.weight.entries === 1 ? 'pesagem' : 'pesagens'})` });
  if (d.water) others.push({ text: `Água: média de ${nf0.format(d.water.avgMl)} ml por dia, em ${d.water.loggedDays} ${d.water.loggedDays === 1 ? 'dia registrado' : 'dias registrados'}` });
  if (d.workouts) others.push({ text: `Treinos: ${d.workouts.count} ${d.workouts.count === 1 ? 'treino' : 'treinos'}, ${nf0.format(d.workouts.totalMinutes)} min no total` });

  const dayHead = head(['Data', ...(hide ? [] : ['kcal']), 'P (g)', 'C (g)', 'G (g)']);
  const cols = dayHead.length;
  const dayBody: TableCell[][] = [];
  for (const day of d.days) {
    if (day.registered) {
      dayBody.push([
        { text: brShort(day.date) },
        ...(hide ? [] : [{ text: nf0.format(day.kcal), alignment: 'right' as const }]),
        { text: nf1.format(day.protein), alignment: 'right' },
        { text: nf1.format(day.carbs), alignment: 'right' },
        { text: nf1.format(day.fat), alignment: 'right' },
      ]);
      const meals = (day.meals ?? []).filter((m) => m.items.length > 0);
      if (d.foods && meals.length) {
        dayBody.push([{ text: meals.map((m) => `${MEAL_LABEL[m.type] ?? m.type}: ${m.items.map((i) => `${i.name} (${nf1.format(i.grams)} g)`).join(', ')}`).join('\n'), colSpan: cols, fontSize: 8.5, color: '#444444', margin: [8, 0, 0, 2] }, ...Array(cols - 1).fill({})]);
      }
    } else {
      dayBody.push([{ text: brShort(day.date) }, { text: 'sem registro', italics: true, color: '#555555', colSpan: cols - 1 }, ...Array(cols - 2).fill({})]);
    }
  }

  const content: Content[] = [
    { text: 'Relatório de alimentação', style: 'title' },
    ...(d.name ? [{ text: d.name, bold: true, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
    { text: `Período: ${br(d.from)} a ${br(d.to)}` },
    { text: `Gerado em ${generated}`, margin: [0, 0, 0, 10] },

    { text: 'Resumo', style: 'h2' },
    { text: `Dias registrados: ${d.loggedDays} de ${d.totalDays}. As médias consideram só os dias registrados.`, margin: [0, 0, 0, 6] },
    { table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: [head(['Média por dia', 'Registrado', 'Meta', '% da meta']), ...avgRows] }, layout: GRID },

    ...(others.length ? [{ text: 'Outros registros', style: 'h2' }, { ul: others }] : []),

    { text: 'Dia a dia', style: 'h2' },
    { table: { headerRows: 1, widths: ['auto', ...Array(cols - 1).fill('*')], body: [dayHead, ...dayBody] }, layout: GRID },
  ];

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [42.5, 42.5, 42.5, 56], // 15 mm
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#000000' },
    styles: { title: { fontSize: 18, bold: true }, h2: { fontSize: 13, bold: true, margin: [0, 12, 0, 6] } },
    info: { title: `Relatório de alimentação ${br(d.from)} a ${br(d.to)}`, creator: 'Bocado' },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      margin: [42.5, 8, 42.5, 0],
      columns: [
        { text: DISCLAIMER, fontSize: 8, color: '#444444', width: '*' },
        { text: `Página ${currentPage} de ${pageCount}`, fontSize: 8, color: '#444444', alignment: 'right', width: 'auto' },
      ],
      columnGap: 12,
    }),
  };
}

export async function renderNutritionistPdf(data: NutritionistReportData): Promise<Buffer> {
  return pdfmake.createPdf(buildNutritionistDoc(data)).getBuffer();
}
