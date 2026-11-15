import { Injectable, Logger } from '@nestjs/common';
import { FoodSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Tipos com valor de referência; 'unknown' (palpite da IA) usa o de óleo. */
export type FatRefKind = 'oil' | 'butter' | 'sauce';
export type FatRefLevel = 'little' | 'lots';

interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FatPortion extends Macros {
  grams: number;
  /** Medida caseira, ex.: "1 colher de chá". */
  portion: string;
}

export interface FatKindRef {
  /** Nome no item, ex.: "óleo". */
  label: string;
  per100: Macros;
  /** true se os valores vieram da base TACO do banco; false = constantes abaixo. */
  fromTaco: boolean;
  little: FatPortion;
  lots: FatPortion;
}

export type PreparationFatTable = Record<FatRefKind, FatKindRef>;

/**
 * Valores por 100 g da Tabela TACO (4ª ed., NEPA/Unicamp), usados quando a base não estiver carregada:
 * "Óleo, de soja", "Manteiga, com sal" e "Maionese, tradicional com ovos".
 */
export const FAT_FALLBACK_PER100: Record<FatRefKind, Macros> = {
  oil: { kcal: 884, protein: 0, carbs: 0, fat: 100 },
  butter: { kcal: 726, protein: 0.4, carbs: 0.1, fat: 82.4 },
  sauce: { kcal: 302.2, protein: 0.6, carbs: 7.9, fat: 30.5 },
};

/** Alimento da TACO (searchName: minúsculas, sem acento e sem pontuação) usado como referência de cada tipo. */
export const FAT_TACO_SEARCH_NAMES: Record<FatRefKind, string> = {
  oil: 'oleo de soja',
  butter: 'manteiga com sal',
  sauce: 'maionese tradicional com ovos',
};

/** Quanto é "um pouco" e "bastante" de cada gordura, em gramas e em medida caseira. */
export const FAT_PORTIONS: Record<FatRefKind, Record<FatRefLevel, { grams: number; portion: string }>> = {
  oil: { little: { grams: 5, portion: '1 colher de chá' }, lots: { grams: 15, portion: '1 colher de sopa' } },
  butter: { little: { grams: 5, portion: '1 colher de chá' }, lots: { grams: 15, portion: '1 colher de sopa' } },
  sauce: { little: { grams: 20, portion: '1 colher de sopa cheia' }, lots: { grams: 50, portion: '3 colheres de sopa' } },
};

const LABELS: Record<FatRefKind, string> = { oil: 'óleo', butter: 'manteiga', sauce: 'molho' };
const KINDS: FatRefKind[] = ['oil', 'butter', 'sauce'];

const round1 = (n: number) => Math.round(n * 10) / 10;

function portionOf(per100: Macros, ref: { grams: number; portion: string }): FatPortion {
  const f = ref.grams / 100;
  return {
    grams: ref.grams,
    portion: ref.portion,
    kcal: round1(per100.kcal * f),
    protein: round1(per100.protein * f),
    carbs: round1(per100.carbs * f),
    fat: round1(per100.fat * f),
  };
}

/** Monta a tabela a partir dos valores da TACO encontrados (os que faltarem usam as constantes). */
export function buildPreparationFatTable(fromDb: Partial<Record<FatRefKind, Macros>>): PreparationFatTable {
  const table = {} as PreparationFatTable;
  for (const kind of KINDS) {
    const per100 = fromDb[kind] ?? FAT_FALLBACK_PER100[kind];
    table[kind] = {
      label: LABELS[kind],
      per100,
      fromTaco: Boolean(fromDb[kind]),
      little: portionOf(per100, FAT_PORTIONS[kind].little),
      lots: portionOf(per100, FAT_PORTIONS[kind].lots),
    };
  }
  return table;
}

@Injectable()
export class PreparationFatService {
  private readonly logger = new Logger(PreparationFatService.name);
  private cached: PreparationFatTable | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** A TACO não muda em execução: lê uma vez e guarda. Sem a base (ou com erro), usa as constantes. */
  async table(): Promise<PreparationFatTable> {
    if (this.cached) return this.cached;
    const fromDb: Partial<Record<FatRefKind, Macros>> = {};
    try {
      const rows = await this.prisma.food.findMany({
        where: { source: FoodSource.TACO, searchName: { in: Object.values(FAT_TACO_SEARCH_NAMES) } },
        select: { searchName: true, kcal100: true, protein100: true, carbs100: true, fat100: true },
      });
      for (const kind of KINDS) {
        const row = rows.find((r) => r.searchName === FAT_TACO_SEARCH_NAMES[kind]);
        if (row) fromDb[kind] = { kcal: row.kcal100, protein: row.protein100, carbs: row.carbs100, fat: row.fat100 };
      }
    } catch (err) {
      this.logger.warn(`TACO indisponível para gorduras de preparo: ${err instanceof Error ? err.message : err}`);
      return buildPreparationFatTable({}); // não guarda: tenta a base de novo na próxima
    }
    this.cached = buildPreparationFatTable(fromDb);
    return this.cached;
  }
}
