import type { DoseUnit, InjectionSite, Slot } from '@prisma/client';

/** Rótulos em português (puro). A dose é exibida EXATAMENTE como a pessoa a digitou: nada é arredondado nem convertido. */

export const UNIT_LABEL: Record<DoseUnit, string> = {
  ML: 'ml',
  MG: 'mg',
  MCG: 'mcg',
  G: 'g',
  UI: 'UI',
  TABLET: 'comprimido',
  CAPSULE: 'cápsula',
  SCOOP: 'dose/scoop',
  DROP: 'gotas',
  OTHER: '',
};

export const SITE_LABEL: Record<InjectionSite, string> = {
  ABDOMEN_L: 'Abdômen esquerdo',
  ABDOMEN_R: 'Abdômen direito',
  THIGH_L: 'Coxa esquerda',
  THIGH_R: 'Coxa direita',
  GLUTE_L: 'Glúteo esquerdo',
  GLUTE_R: 'Glúteo direito',
  DELTOID_L: 'Deltoide esquerdo',
  DELTOID_R: 'Deltoide direito',
  OTHER: 'Outro',
};

export const SLOT_LABEL: Record<Slot, string> = { ANY: 'Qualquer hora', MORNING: 'Manhã', AFTERNOON: 'Tarde', NIGHT: 'Noite' };

/** Unidade como a pessoa a vê: o rótulo padrão ou, em "Outro", o texto que ela escreveu. */
export function unitText(unit: DoseUnit, label: string | null | undefined): string {
  return unit === 'OTHER' ? (label ?? '').trim() : UNIT_LABEL[unit];
}

/** Número com vírgula decimal e todas as casas que a pessoa digitou ("0,5", "8", "2,25"). */
export function amountText(amount: number): string {
  return String(amount).replace('.', ',');
}

/** "0,5 ml". */
export function doseText(amount: number, unit: DoseUnit, label: string | null | undefined): string {
  return `${amountText(amount)} ${unitText(unit, label)}`.trim();
}
