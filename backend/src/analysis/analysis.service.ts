import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ANALYSIS_TOOL, ANALYSIS_TOOL_NAME, SYSTEM_PROMPT } from './analysis.prompt';

export type Confidence = 'low' | 'medium' | 'high';

export interface AnalyzedItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
}

export interface AnalysisResult {
  title: string;
  notes: string | null;
  items: AnalyzedItem[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
}

const SUPPORTED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type SupportedMedia = (typeof SUPPORTED_MEDIA)[number];

const clamp = (n: unknown, max: number) => {
  const num = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
  const v = Number.isFinite(num) ? num : 0;
  return Math.round(Math.min(Math.max(v, 0), max) * 10) / 10;
};

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY')?.trim();
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 }) : null;
    this.model = config.get<string>('ANTHROPIC_MODEL')?.trim() || 'claude-sonnet-5-5';
  }

  async analyzePhoto(image: Buffer, mimeType: string, hint?: string): Promise<AnalysisResult> {
    if (!SUPPORTED_MEDIA.includes(mimeType as SupportedMedia)) {
      throw new BadRequestException('Formato de imagem não suportado. Use JPG, PNG ou WebP.');
    }
    const text = hint
      ? `Estime os nutrientes desta refeição. Dica do usuário: ${hint}`
      : 'Estime os nutrientes desta refeição.';

    return this.run([
      {
        type: 'image',
        source: { type: 'base64', media_type: mimeType as SupportedMedia, data: image.toString('base64') },
      },
      { type: 'text', text },
    ]);
  }

  async analyzeText(description: string): Promise<AnalysisResult> {
    return this.run([
      { type: 'text', text: `Estime os nutrientes desta refeição descrita pelo usuário: ${description}` },
    ]);
  }

  private async run(content: Anthropic.ContentBlockParam[]): Promise<AnalysisResult> {
    if (!this.client) {
      throw new ServiceUnavailableException('Análise por IA não configurada no servidor');
    }

    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content }],
      });
    } catch (err) {
      throw this.toHttpError(err);
    }

    const block = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === ANALYSIS_TOOL_NAME,
    );
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const summary = summarizeResponse(message, block, text);
    this.logger.debug(`Resposta da IA: ${summary}`);

    if (message.stop_reason === 'max_tokens') {
      this.logger.warn(`Análise truncada por max_tokens: ${summary}`);
      throw new ServiceUnavailableException('A análise ficou incompleta. Tente uma descrição mais curta.');
    }

    const raw: unknown = block ? block.input : extractJson(text);
    if (!raw) {
      this.logger.warn(`Análise sem tool_use nem JSON válido: ${summary}`);
      throw new ServiceUnavailableException('A análise não retornou um resultado válido. Tente de novo.');
    }

    try {
      return this.normalize(coerceAnalysis(raw));
    } catch (err) {
      if (err instanceof UnprocessableEntityException) {
        this.logger.warn(`Análise rejeitada (422): ${summary}`);
      }
      throw err;
    }
  }

  private toHttpError(err: unknown): HttpException {
    const generic = new ServiceUnavailableException('Não foi possível analisar agora. Tente de novo em instantes.');

    if (err instanceof Anthropic.APIError) {
      const status = err.status;
      const msg = err.message ?? '';
      const lower = msg.toLowerCase();
      this.logger.error(`Falha na chamada ao Claude (modelo ${this.model}): ${status} ${msg}`);

      if (status === 401 || status === 403) {
        return new ServiceUnavailableException('Chave da IA inválida no servidor.');
      }
      if (status === 404 || lower.includes('model')) {
        return new ServiceUnavailableException('Modelo de IA não encontrado. Verifique ANTHROPIC_MODEL.');
      }
      if (lower.includes('credit balance')) {
        return new ServiceUnavailableException('Créditos da IA esgotados no servidor.');
      }
      if (status === 429) {
        return new HttpException('Muitas análises seguidas. Aguarde um minuto.', HttpStatus.TOO_MANY_REQUESTS);
      }
      return generic;
    }

    this.logger.error(`Falha inesperada na análise: ${err instanceof Error ? err.message : String(err)}`);
    return generic;
  }

  /** Nunca confia cegamente na saída do modelo: valida, limita e arredonda. */
  private normalize(raw: Record<string, unknown>): AnalysisResult {
    if (raw.isFood === false) {
      throw new UnprocessableEntityException('Não encontramos comida aqui. Tente outra foto ou descreva a refeição.');
    }
    const rawItems = Array.isArray(raw.items) ? raw.items.slice(0, 30) : [];
    const items: AnalyzedItem[] = rawItems
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map((i) => ({
        name: String(i.name ?? 'Alimento').slice(0, 120).trim() || 'Alimento',
        grams: clamp(i.grams, 5000),
        kcal: clamp(i.kcal, 10000),
        protein: clamp(i.protein, 1000),
        carbs: clamp(i.carbs, 1000),
        fat: clamp(i.fat, 1000),
        confidence: (['low', 'medium', 'high'] as const).includes(i.confidence as Confidence)
          ? (i.confidence as Confidence)
          : 'low',
      }));

    if (!items.length) {
      throw new UnprocessableEntityException('Não conseguimos identificar os alimentos. Tente descrever a refeição.');
    }

    const totals = items.reduce(
      (t, i) => ({
        kcal: t.kcal + i.kcal,
        protein: t.protein + i.protein,
        carbs: t.carbs + i.carbs,
        fat: t.fat + i.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );

    return {
      title: String(raw.title ?? 'Refeição').slice(0, 80),
      notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, 280) : null,
      items,
      totals: {
        kcal: Math.round(totals.kcal),
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs * 10) / 10,
        fat: Math.round(totals.fat * 10) / 10,
      },
    };
  }
}

/** Resumo seguro da resposta para logs: nunca inclui a API key nem imagens (só existem no request). */
function summarizeResponse(message: Anthropic.Message, block: Anthropic.ToolUseBlock | undefined, text: string) {
  const types = message.content.map((b) => b.type).join(',') || '(vazio)';
  const body = block ? JSON.stringify(block.input) : text;
  return `stop_reason=${message.stop_reason} blocos=[${types}] ${block ? 'input' : 'texto'}=${body.slice(0, 500)}`;
}

const ITEMS_KEYS = ['items', 'itens', 'alimentos', 'foods'];

const FIELD_ALIASES: Record<keyof AnalyzedItem, string[]> = {
  name: ['name', 'nome'],
  grams: ['grams', 'gramas', 'quantity', 'quantidade', 'peso'],
  kcal: ['kcal', 'calorias', 'calories'],
  protein: ['protein', 'proteina', 'proteína', 'proteinas', 'proteínas', 'proteins'],
  carbs: ['carbs', 'carboidratos', 'carbohydrates'],
  fat: ['fat', 'gordura', 'gorduras', 'fats'],
  confidence: ['confidence', 'confianca', 'confiança'],
};

const NUMERIC_FIELDS = ['grams', 'kcal', 'protein', 'carbs', 'fat'] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseMaybeJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

/** "12,5" → 12.5, "120 g" → 120, "180 kcal" → 180. Valores não numéricos ficam como estão (clamp zera). */
function toNumber(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const match = v.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : v;
}

/** Aceita as variações reais do modelo (strings JSON, nomes em português, números com unidade) e devolve o formato do schema. */
export function coerceAnalysis(raw: unknown): Record<string, unknown> {
  const obj = parseMaybeJson(raw);
  if (!isRecord(obj)) return { isFood: true, items: [] };

  const itemsRaw = parseMaybeJson(pick(obj, ITEMS_KEYS));
  const items = (Array.isArray(itemsRaw) ? itemsRaw : [])
    .map(parseMaybeJson)
    .filter(isRecord)
    .map((item) => {
      const out: Record<string, unknown> = {};
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        out[field] = pick(item, aliases);
      }
      for (const field of NUMERIC_FIELDS) out[field] = toNumber(out[field]);
      if (typeof out.confidence === 'string') out.confidence = out.confidence.trim().toLowerCase();
      return out;
    });

  return {
    ...obj,
    isFood: obj.isFood === false || obj.isFood === 'false' ? false : true,
    items,
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
