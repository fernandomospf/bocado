import Anthropic from '@anthropic-ai/sdk';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiFeature } from '@prisma/client';
import { AiQuotaService } from '../ai-usage/ai-quota.service';
import { DEFAULT_MODEL } from '../ai-usage/ai-usage.config';
import { AnalysisCacheService } from './analysis.cache';
import { analysisCacheKey } from './analysis.normalize';
import { extractItemObjects, parseLooseJson, toNumber } from './analysis.parse';
import { BY_WEIGHT_PROMPT_ADDON, byWeightUserText, rescaleToTotal } from './by-weight';
import { ANALYSIS_TOOL, ANALYSIS_TOOL_NAME, LABEL_SYSTEM_PROMPT, LABEL_TOOL, SYSTEM_PROMPT } from './analysis.prompt';
import { coerceLabel, LabelDraft } from './label';

export type Confidence = 'low' | 'medium' | 'high';

export interface AnalyzedItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
  /** Valor estimado pela IA (sempre true nas análises por quilo). */
  estimated?: boolean;
}

export type FatLevel = 'none' | 'little' | 'lots';
export type FatKind = 'oil' | 'butter' | 'sauce' | 'unknown';

/** Palpite da IA sobre a gordura de preparo, que fica FORA dos itens (o usuário confirma no app). */
export interface PreparationFatGuess {
  level: FatLevel;
  kind: FatKind;
  reason: string;
}

export interface AnalysisResult {
  title: string;
  notes: string | null;
  items: AnalyzedItem[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  hasCookedFood: boolean;
  preparationFat: PreparationFatGuess;
  /** Só no prato por quilo: o peso da balança, a que as gramas dos itens somam exatamente. */
  totalGrams?: number;
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

  /**
   * O cache e a cota são opcionais: sem eles (testes) toda descrição vai para a IA e nada é medido. Com a cota, TODA
   * chamada ao SDK passa por reserve → settle/fail, e quem chama informa o userId.
   */
  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly cache?: AnalysisCacheService,
    @Optional() private readonly quota?: AiQuotaService,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY')?.trim();
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 }) : null;
  }

  /** Modelo da funcionalidade: ANTHROPIC_MODEL_<FEATURE>, depois ANTHROPIC_MODEL, depois o padrão. */
  modelFor(feature: AiFeature): string {
    return (
      this.config.get<string>(`ANTHROPIC_MODEL_${feature}`)?.trim() ||
      this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
      DEFAULT_MODEL
    );
  }

  /** `totalGrams` (50 a 3000) liga o modo por quilo: as gramas dos itens são reescaladas para somar esse peso. */
  async analyzePhoto(image: Buffer, mimeType: string, hint?: string, userId?: string, totalGrams?: number): Promise<AnalysisResult> {
    if (!SUPPORTED_MEDIA.includes(mimeType as SupportedMedia)) {
      throw new BadRequestException('Formato de imagem não suportado. Use JPG, PNG ou WebP.');
    }
    const byWeight = totalGrams !== undefined;
    const text = byWeight
      ? byWeightUserText(totalGrams, hint)
      : hint
        ? `Estime os nutrientes desta refeição. Dica do usuário: ${hint}`
        : 'Estime os nutrientes desta refeição.';

    // Conta na cota de foto, como qualquer análise de foto (a reserva acontece dentro de run → invoke)
    const result = await this.run(
      [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType as SupportedMedia, data: image.toString('base64') },
        },
        { type: 'text', text },
      ],
      'PHOTO',
      userId,
      byWeight ? SYSTEM_PROMPT + BY_WEIGHT_PROMPT_ADDON : SYSTEM_PROMPT,
    );
    return byWeight ? this.toByWeight(result, totalGrams) : result;
  }

  /** O servidor, não o modelo, garante que as gramas somem o peso da balança. */
  private toByWeight(result: AnalysisResult, totalGrams: number): AnalysisResult {
    const items = rescaleToTotal(result.items, totalGrams).map((i) => ({ ...i, estimated: true }));
    const sum = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => items.reduce((s, i) => s + i[k], 0);
    return {
      ...result,
      items,
      totalGrams,
      totals: {
        kcal: Math.round(sum('kcal')),
        protein: Math.round(sum('protein') * 10) / 10,
        carbs: Math.round(sum('carbs') * 10) / 10,
        fat: Math.round(sum('fat') * 10) / 10,
      },
    };
  }

  /**
   * Lê a embalagem (frente opcional + tabela nutricional) e devolve um RASCUNHO para revisão.
   * Nada é salvo aqui, e as imagens não são armazenadas (ficam só na memória desta requisição).
   */
  async analyzeLabel(
    images: { buffer: Buffer; mimeType: string; role: 'front' | 'table' }[],
    barcode: string | null,
    userId?: string,
  ): Promise<LabelDraft> {
    for (const img of images) {
      if (!SUPPORTED_MEDIA.includes(img.mimeType as SupportedMedia)) {
        throw new BadRequestException('Formato de imagem não suportado. Use JPG, PNG ou WebP.');
      }
    }
    const content: Anthropic.ContentBlockParam[] = images.flatMap((img) => [
      { type: 'text' as const, text: img.role === 'table' ? 'Tabela nutricional:' : 'Frente da embalagem:' },
      {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: img.mimeType as SupportedMedia, data: img.buffer.toString('base64') },
      },
    ]);
    content.push({ type: 'text', text: 'Extraia o produto e a tabela nutricional.' });

    const raw = await this.callTool({
      system: LABEL_SYSTEM_PROMPT,
      tool: LABEL_TOOL,
      content,
      maxTokens: 1500,
      truncatedMessage: 'A leitura da embalagem ficou incompleta. Tente de novo.',
      feature: 'LABEL',
      userId,
    });
    return coerceLabel(raw, barcode);
  }

  /**
   * Descrição em texto: consulta o cache (chave = descrição normalizada + modelo + versão do prompt) antes de chamar
   * o Claude e grava só resultados válidos. Fotos e rótulos nunca passam por aqui.
   */
  async analyzeText(description: string, userId?: string): Promise<AnalysisResult> {
    // O modelo de TEXT entra na chave do cache (junto com a versão do prompt)
    const key = analysisCacheKey(description, this.modelFor('TEXT'));
    const cached = await this.cache?.get(key);
    if (cached) {
      // Acerto de cache: nenhuma chamada ao SDK, então não reserva nem consome cota
      this.logger.log('analysis cache hit');
      return cached;
    }
    if (this.cache) this.logger.log('analysis cache miss');

    const result = await this.run(
      [{ type: 'text', text: `Estime os nutrientes desta refeição descrita pelo usuário: ${description}` }],
      'TEXT',
      userId,
    );
    await this.cache?.set(key, result);
    return result;
  }

  /** Há chave da IA configurada no servidor? */
  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Chamada genérica com ferramenta (tool_choice auto + parse tolerante), usada por outros módulos
   * (ex.: sugestões). Devolve o input da ferramenta, ou o JSON extraído do texto, para o chamador normalizar.
   */
  async callTool(params: {
    system: string;
    tool: Anthropic.Tool;
    content: Anthropic.ContentBlockParam[];
    maxTokens: number;
    truncatedMessage: string;
    feature: AiFeature;
    userId?: string;
  }): Promise<unknown> {
    return (await this.invoke(params)).raw;
  }

  private async run(
    content: Anthropic.ContentBlockParam[],
    feature: AiFeature,
    userId?: string,
    system: string = SYSTEM_PROMPT,
  ): Promise<AnalysisResult> {
    const { raw, summary } = await this.invoke({
      system,
      tool: ANALYSIS_TOOL,
      content,
      maxTokens: 2000,
      truncatedMessage: 'A análise ficou incompleta. Tente uma descrição mais curta.',
      feature,
      userId,
    });

    const stats: CoerceStats = { discarded: 0 };
    const coerced = coerceAnalysis(raw, stats);
    if (stats.discarded > 0) {
      this.logger.warn(`Análise: ${stats.discarded} item(ns) irreparável(is) descartado(s): ${summary}`);
    }

    try {
      return this.normalize(coerced);
    } catch (err) {
      if (err instanceof UnprocessableEntityException) {
        this.logger.warn(`Análise rejeitada (422): ${summary}`);
      }
      throw err;
    }
  }

  private async invoke(params: {
    system: string;
    tool: Anthropic.Tool;
    content: Anthropic.ContentBlockParam[];
    maxTokens: number;
    truncatedMessage: string;
    feature: AiFeature;
    userId?: string;
  }): Promise<{ raw: unknown; summary: string }> {
    if (!this.client) {
      throw new ServiceUnavailableException('Análise por IA não configurada no servidor');
    }

    const model = this.modelFor(params.feature);
    // Cota: reserva ANTES (pode recusar com 429 e código); depois settle com os tokens do SDK ou fail
    const reservation = this.quota && params.userId ? await this.quota.reserve(params.userId, params.feature, model) : null;

    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model,
        max_tokens: params.maxTokens,
        system: params.system,
        tools: [params.tool],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: params.content }],
      });
    } catch (err) {
      if (reservation) await this.quota?.fail(reservation).catch(() => undefined); // falha não consome cota
      throw this.toHttpError(err, model);
    }
    // A chamada voltou: os tokens foram gastos mesmo que a resposta não sirva, então a reserva fecha como OK
    if (reservation) await this.quota?.settle(reservation, message.usage).catch((e) => this.logger.warn(`settle falhou: ${(e as Error).message}`));

    const block = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === params.tool.name,
    );
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const summary = summarizeResponse(message, block, text);
    this.logger.debug(`Resposta da IA (${params.tool.name}): ${summary}`);

    if (message.stop_reason === 'max_tokens') {
      this.logger.warn(`Resposta truncada por max_tokens: ${summary}`);
      throw new ServiceUnavailableException(params.truncatedMessage);
    }

    const raw: unknown = block ? block.input : extractJson(text);
    if (!raw) {
      this.logger.warn(`Resposta sem tool_use nem JSON válido: ${summary}`);
      throw new ServiceUnavailableException('A análise não retornou um resultado válido. Tente de novo.');
    }
    return { raw, summary };
  }

  private toHttpError(err: unknown, model: string): HttpException {
    const generic = new ServiceUnavailableException('Não foi possível analisar agora. Tente de novo em instantes.');

    if (err instanceof Anthropic.APIError) {
      const status = err.status;
      const msg = err.message ?? '';
      const lower = msg.toLowerCase();
      this.logger.error(`Falha na chamada ao Claude (modelo ${model}): ${status} ${msg}`);

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
      hasCookedFood: raw.hasCookedFood === true,
      preparationFat: coercePreparationFat(raw.preparationFat),
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

const FIELD_ALIASES: Record<Exclude<keyof AnalyzedItem, 'estimated'>, string[]> = {
  name: ['name', 'nome'],
  grams: ['grams', 'gramas', 'quantity', 'quantidade', 'peso'],
  kcal: ['kcal', 'calorias', 'calories'],
  protein: ['protein', 'proteina', 'proteína', 'proteinas', 'proteínas', 'proteins'],
  carbs: ['carbs', 'carboidratos', 'carbohydrates'],
  fat: ['fat', 'gordura', 'gorduras', 'fats'],
  confidence: ['confidence', 'confianca', 'confiança'],
};

const NUMERIC_FIELDS = ['grams', 'kcal', 'protein', 'carbs', 'fat'] as const;

const CONFIDENCES: readonly Confidence[] = ['low', 'medium', 'high'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const parseMaybeJson = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  const parsed = parseLooseJson(v);
  return parsed === null ? v : parsed;
};

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

/** items pode vir como array ou como string com JSON (às vezes malformado). Conta os itens que não deu para aproveitar. */
function resolveItems(value: unknown): { list: unknown[]; discarded: number } {
  if (Array.isArray(value)) return { list: value, discarded: 0 };
  if (typeof value !== 'string' || !value.trim()) return { list: [], discarded: 0 };

  const parsed = parseLooseJson(value);
  if (Array.isArray(parsed)) return { list: parsed, discarded: 0 };

  const list = extractItemObjects(value);
  const candidates = value.match(/\{[^{}]*\}/g)?.length ?? 0;
  return { list, discarded: Math.max(candidates - list.length, list.length ? 0 : 1) };
}

export interface CoerceStats {
  discarded: number;
}

/**
 * Aceita as variações reais do modelo (items como string JSON malformada, nomes em português, números com unidade
 * ou lixo grudado) e devolve o formato do schema. `stats.discarded` recebe quantos itens eram irreparáveis.
 */
export function coerceAnalysis(raw: unknown, stats?: CoerceStats): Record<string, unknown> {
  const obj = parseMaybeJson(raw);
  if (!isRecord(obj)) return { isFood: true, items: [] };

  const { list, discarded } = resolveItems(pick(obj, ITEMS_KEYS));
  const records = list.map(parseMaybeJson).filter(isRecord);

  const items = records.map((item) => {
    const out: Record<string, unknown> = {};
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      out[field] = pick(item, aliases);
    }
    for (const field of NUMERIC_FIELDS) out[field] = toNumber(out[field]);
    const confidence = typeof out.confidence === 'string' ? out.confidence.trim().toLowerCase() : '';
    out.confidence = CONFIDENCES.includes(confidence as Confidence) ? confidence : 'low';
    return out;
  });

  if (stats) stats.discarded = discarded + (list.length - records.length);

  return {
    ...obj,
    isFood: obj.isFood === false || obj.isFood === 'false' ? false : true,
    items,
    hasCookedFood: obj.hasCookedFood === true || obj.hasCookedFood === 'true',
    preparationFat: coercePreparationFat(obj.preparationFat),
  };
}

const FAT_LEVELS: readonly FatLevel[] = ['none', 'little', 'lots'];
const FAT_KINDS: readonly FatKind[] = ['oil', 'butter', 'sauce', 'unknown'];
const NO_FAT: PreparationFatGuess = { level: 'none', kind: 'unknown', reason: '' };

/** Ausente ou inválido vira "sem gordura, tipo desconhecido": a pergunta aparece com "Nada" marcado. */
export function coercePreparationFat(value: unknown): PreparationFatGuess {
  const obj = parseMaybeJson(value);
  if (!isRecord(obj)) return { ...NO_FAT };
  const level = typeof obj.level === 'string' ? obj.level.trim().toLowerCase() : '';
  const kind = typeof obj.kind === 'string' ? obj.kind.trim().toLowerCase() : '';
  return {
    level: FAT_LEVELS.includes(level as FatLevel) ? (level as FatLevel) : 'none',
    kind: FAT_KINDS.includes(kind as FatKind) ? (kind as FatKind) : 'unknown',
    reason: typeof obj.reason === 'string' ? obj.reason.trim().slice(0, 120) : '',
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
