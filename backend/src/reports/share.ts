import { createHash, randomBytes, randomInt } from 'node:crypto';

/** Código de acesso: 8 caracteres de um alfabeto sem ambíguos (sem 0/O/1/I/L). Mostrado UMA vez; só o bcrypt fica no banco. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const MAX_FAILED = 5;
export const LOCK_MINUTES = 15;
/** Bloqueios do link até ele ser revogado sozinho. */
export const MAX_LOCKS = 3;
export const DEVICE_COOKIE = 'bocado_rs';
export const EXPIRY_DAYS = [1, 7, 30] as const;

export const generateCode = () => Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
export const generateToken = () => randomBytes(24).toString('base64url');
export const generateDeviceToken = () => randomBytes(32).toString('base64url');
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Normaliza o que a pessoa digitou (caixa, espaços e hífens). */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, '');
export const isWellFormedCode = (code: string) => code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));

/** Caminhos do cookie de aparelho: só a página do link e a API pública daquele link. */
export const cookiePaths = (token: string) => [`/r/${token}`, `/api/public/reports/${token}`];

export const MSG = {
  generic: 'Código incorreto ou link indisponível.',
  locked: 'Muitas tentativas. Tente de novo em 15 minutos.',
  noSlot: 'Este código já foi usado no número máximo de aparelhos. Peça um novo link.',
} as const;
