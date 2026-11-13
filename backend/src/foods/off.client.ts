import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Produto do Open Food Facts já mapeado para o nosso formato (valores por 100 g). */
export interface OffProduct {
  name: string;
  brand: string | null;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  serving: { grams: number; label: string } | null;
}

export type OffLookup =
  | { status: 'found'; product: OffProduct }
  /** O OFF não tem o produto, ou tem sem os valores mínimos: entra no cache negativo. */
  | { status: 'missing' }
  /** Falha de rede, timeout ou erro do servidor: não entra no cache (pode ser passageiro). */
  | { status: 'error' };

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity';
const TIMEOUT_MS = 5000;
const KJ_PER_KCAL = 4.184;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** O OFF devolve números ora como number, ora como string. */
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : null;
}

/**
 * Mapeia a resposta do OFF. Devolve null quando o produto é incompleto: sem nome, sem energia
 * (nem em kcal nem em kJ), faltando proteína, carboidrato ou gordura, ou com valores impossíveis.
 */
export function mapOffProduct(product: Record<string, unknown> | null | undefined): OffProduct | null {
  if (!product) return null;
  const name = text(product.product_name_pt) ?? text(product.product_name);
  if (!name) return null;

  const n = (product.nutriments ?? {}) as Record<string, unknown>;
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']); // energy_100g do OFF é em kJ
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== null ? kj / KJ_PER_KCAL : null);
  const protein = num(n['proteins_100g']);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  // Dados impossíveis (ex.: valores por porção gravados como por 100 g): melhor ler o rótulo
  if (kcal > 900 || protein + carbs + fat > 100) return null;

  const servingGrams = num(product.serving_quantity);
  const servingLabel = text(product.serving_size);
  const brand = text(product.brands)?.split(',')[0]?.trim() || null;

  return {
    name: name.slice(0, 120),
    brand: brand ? brand.slice(0, 80) : null,
    per100: { kcal: round1(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) },
    serving:
      servingGrams && servingGrams > 0 && servingGrams <= 5000
        ? { grams: round1(servingGrams), label: (servingLabel ?? `${round1(servingGrams)} g`).slice(0, 60) }
        : null,
  };
}

/** Cliente do Open Food Facts (somente leitura). */
@Injectable()
export class OffClient {
  private readonly logger = new Logger(OffClient.name);
  private readonly userAgent: string;

  constructor(config: ConfigService) {
    // O OFF pede um contato no User-Agent; ele vem do ambiente (OFF_CONTACT), nunca fixo no código
    const contact = config.get<string>('OFF_CONTACT')?.trim();
    this.userAgent = contact ? `Bocado/1.0 (${contact})` : 'Bocado/1.0';
  }

  async lookup(code: string): Promise<OffLookup> {
    try {
      const res = await fetch(`${OFF_URL}/${encodeURIComponent(code)}?fields=${FIELDS}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) return { status: 'missing' };
      if (!res.ok) {
        this.logger.warn(`Open Food Facts respondeu ${res.status} para ${code}`);
        return { status: 'error' };
      }
      const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
      if (body.status !== 1) return { status: 'missing' };
      const product = mapOffProduct(body.product);
      return product ? { status: 'found', product } : { status: 'missing' };
    } catch (err) {
      this.logger.warn(`Falha ao consultar o Open Food Facts (${code}): ${err instanceof Error ? err.message : err}`);
      return { status: 'error' };
    }
  }
}
