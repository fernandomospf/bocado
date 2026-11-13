// Converte a aba de composição centesimal da planilha oficial da TACO (NEPA/Unicamp) em JSON enxuto.
// Uso: node convert.js <taco.xlsx> <saida.json>
const XLSX = require('xlsx');
const fs = require('fs');

const [, , input, output] = process.argv;
const wb = XLSX.readFile(input);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

// Colunas da aba "CMVCol taco3"
const COL = { number: 0, name: 1, kcal: 3, protein: 5, fat: 6, carbs: 8 };

const stats = { nonNumeric: {}, foods: 0, categories: [] };
const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 10) / 10;
  const key = String(v).trim() || '(vazio)';
  stats.nonNumeric[key] = (stats.nonNumeric[key] || 0) + 1;
  return 0; // "NA", "Tr", "*" e vazios viram 0
};

let category = null;
const foods = [];
const seenNumbers = new Set();
for (const r of rows) {
  const first = r[COL.number];
  if (typeof first === 'number') {
    if (seenNumbers.has(first)) continue;
    seenNumbers.add(first);
    // "*" na energia = "as análises estão sendo reavaliadas": sem dado, o alimento fica de fora (não vira 0 kcal)
    if (String(r[COL.kcal]).trim() === '*') {
      stats.excluded = [...(stats.excluded || []), `${first} ${String(r[COL.name]).trim()}`];
      continue;
    }
    foods.push({
      // Remove as marcas das notas ¹ e ² da legenda (teor alcoólico): "Cerveja, pilsen 2" → "Cerveja, pilsen"
      name: String(r[COL.name])
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^(Cana, aguardente|Cerveja, pilsen) [12]$/, '$1'),
      category,
      kcal: num(r[COL.kcal]),
      protein: num(r[COL.protein]),
      carbs: num(r[COL.carbs]),
      fat: num(r[COL.fat]),
    });
  } else if (typeof first === 'string' && first.trim() && r.slice(1).every((c) => c === '')) {
    category = first.trim();
    if (!stats.categories.includes(category)) stats.categories.push(category);
  }
}

const names = new Map();
for (const f of foods) names.set(f.name, (names.get(f.name) || 0) + 1);
const dupes = [...names].filter(([, n]) => n > 1);

// Um alimento por linha: diff legível e arquivo enxuto
fs.writeFileSync(output, '[\n' + foods.map((f) => '  ' + JSON.stringify(f)).join(',\n') + '\n]\n');
console.log('excluídos (energia "*"):', stats.excluded);
console.log('alimentos:', foods.length, '| números TACO de', Math.min(...seenNumbers), 'a', Math.max(...seenNumbers));
console.log('categorias:', stats.categories.length, stats.categories);
console.log('valores não numéricos convertidos em 0:', stats.nonNumeric);
console.log('nomes duplicados:', dupes);
console.log('sem categoria:', foods.filter((f) => !f.category).length);
