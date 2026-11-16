import { createHash } from 'node:crypto';
import { PROMPT_VERSION } from './analysis.prompt';

const NUMBER_WORDS: Record<string, string> = {
  um: '1',
  uma: '1',
  dois: '2',
  duas: '2',
  tres: '3',
  quatro: '4',
  cinco: '5',
  seis: '6',
  sete: '7',
  oito: '8',
  nove: '9',
  dez: '10',
};

/**
 * Forma canônica de uma descrição de refeição, só para montar a chave do cache: minúsculas, sem acentos, espaços
 * colapsados, sem pontuação no fim e com "um/uma/dois/duas…dez" em dígitos. Nunca é guardada nem enviada à IA.
 */
export function normalizeDescription(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.,;:!?…]+$/u, '');
  return base.replace(/\b[a-z]+\b/g, (w) => NUMBER_WORDS[w] ?? w);
}

/** sha256(descrição normalizada + modelo + versão do prompt): trocar o modelo ou o prompt invalida o cache. */
export function analysisCacheKey(description: string, model: string, promptVersion: number = PROMPT_VERSION): string {
  return createHash('sha256')
    .update(`${normalizeDescription(description)}\n${model}\n${promptVersion}`)
    .digest('hex');
}
