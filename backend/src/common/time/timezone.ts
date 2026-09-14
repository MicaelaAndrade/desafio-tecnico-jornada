import { DateTime, IANAZone } from 'luxon';

export class InvalidTimezoneError extends Error {
  constructor(value: unknown) {
    super(`Fuso horário inválido: ${String(value)} (esperado identificador IANA, ex.: America/Sao_Paulo)`);
    this.name = 'InvalidTimezoneError';
  }
}

/**
 * Aceita apenas identificadores IANA (`America/Sao_Paulo`, `Europe/Lisbon`).
 *
 * Abreviações como "BRT" ou "CET" são recusadas de propósito: são ambíguas entre
 * regiões e não carregam regras de horário de verão.
 */
export function isValidTimezone(value: unknown): value is string {
  return typeof value === 'string' && value.includes('/') && IANAZone.isValidZone(value);
}

export function assertValidTimezone(value: unknown): string {
  if (!isValidTimezone(value)) throw new InvalidTimezoneError(value);
  return value;
}

/**
 * Offset em minutos em relação a UTC para um instante específico num fuso.
 *
 * Depende do instante, e não apenas do fuso: `Europe/Lisbon` é UTC+0 no inverno e
 * UTC+1 no verão. Este valor é congelado no registro (ver ADR-0004, item 4) para
 * que o horário local histórico não mude quando a tz database for atualizada.
 */
export function offsetMinutesAt(instant: Date, timeZone: string): number {
  const dt = DateTime.fromJSDate(instant, { zone: assertValidTimezone(timeZone) });
  return dt.offset;
}

/**
 * Horário local `HH:mm` reconstruído a partir do offset congelado no registro,
 * e não da tz database atual. É o que garante reprodutibilidade histórica.
 */
export function localTimeFromFrozenOffset(instant: Date, utcOffsetMinutes: number): string {
  return DateTime.fromJSDate(instant, { zone: 'utc' })
    .plus({ minutes: utcOffsetMinutes })
    .toFormat('HH:mm');
}

/** Rótulo curto do fuso no instante informado (ex.: "BRT", "WEST"). Apenas para exibição. */
export function zoneLabelAt(instant: Date, timeZone: string): string {
  return (
    DateTime.fromJSDate(instant, { zone: assertValidTimezone(timeZone) }).toFormat('ZZZZ') ??
    timeZone
  );
}

/** Formata um instante no fuso informado, para logs e relatórios legíveis. */
export function formatInZone(instant: Date, timeZone: string, format = "yyyy-MM-dd HH:mm 'UTC'ZZ"): string {
  return DateTime.fromJSDate(instant, { zone: assertValidTimezone(timeZone) }).toFormat(format);
}
