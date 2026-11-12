/**
 * Diagnóstico da análise por IA: faz a MESMA chamada do AnalysisService e imprime a resposta crua.
 * Uso (na pasta backend): npx ts-node --transpile-only scripts/debug-analysis.ts ["descrição"]
 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ANALYSIS_TOOL, SYSTEM_PROMPT } from '../src/analysis/analysis.prompt';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvFile(resolve(__dirname, '../.env'));
loadEnvFile(resolve(__dirname, '../../.env'));

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5';
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY não encontrada no ambiente nem no .env.');
    process.exit(1);
  }

  const description = process.argv[2] ?? '2 ovos mexidos com pouco sal e café preto';
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });

  console.log(`Modelo: ${model}`);
  const message = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: `Estime os nutrientes desta refeição descrita pelo usuário: ${description}` }],
      },
    ],
  });

  console.log('stop_reason:', message.stop_reason);
  console.log('usage:', JSON.stringify(message.usage));
  console.log('content:');
  console.log(JSON.stringify(message.content, null, 2));
}

main().catch((err) => {
  console.error('Falha:', err instanceof Error ? err.message : err);
  process.exit(1);
});
