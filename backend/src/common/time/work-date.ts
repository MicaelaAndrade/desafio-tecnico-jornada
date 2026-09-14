import { DateTime } from 'luxon';

/**
 * Data civil no formato ISO `YYYY-MM-DD`, sem hora e sem fuso.
 *
 * Representa o "dia de trabalho" ao qual uma marcação pertence (ver ADR-0004).
 * É deliberadamente uma string, e não um `Date`: um `Date` sempre carrega um
 * instante e, portanto, um fuso implícito — o que é justamente a fonte do clássico
 * erro de "um dia a menos" ao formatar uma coluna `DATE`.
 *
 * TODA conversão entre esta representação e o mundo externo (banco, HTTP) passa
 * por este módulo. Nenhum outro ponto do código deve manipular `workDate` na mão.
 */
export type WorkDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidWorkDateError extends Error {
  constructor(value: unknown) {
    super(`Valor inválido para workDate: ${String(value)} (esperado YYYY-MM-DD)`);
    this.name = 'InvalidWorkDateError';
  }
}

export function isWorkDate(value: unknown): value is WorkDate {
  return typeof value === 'string' && ISO_DATE.test(value) && DateTime.fromISO(value).isValid;
}

export function assertWorkDate(value: unknown): WorkDate {
  if (!isWorkDate(value)) throw new InvalidWorkDateError(value);
  return value;
}

/**
 * Resolve a que dia civil um instante pertence, no fuso informado.
 *
 * É a regra central do ADR-0004: o dia da jornada é o dia vivido no LOCAL onde a
 * marcação aconteceu, não no fuso contratual do colaborador nem em UTC.
 */
export function resolveWorkDate(instant: Date, timeZone: string): WorkDate {
  const dt = DateTime.fromJSDate(instant, { zone: timeZone });
  if (!dt.isValid) {
    throw new Error(`Não foi possível resolver o dia da jornada: ${dt.invalidExplanation}`);
  }
  return dt.toFormat('yyyy-MM-dd');
}

/**
 * Converte o valor devolvido pelo Prisma para uma coluna `@db.Date`.
 *
 * O Prisma expõe `DATE` como um `Date` de JavaScript posicionado à meia-noite UTC.
 * A leitura precisa usar os getters UTC: `getFullYear()` e afins aplicariam o fuso
 * do processo e deslocariam a data em um dia para qualquer servidor a oeste de
 * Greenwich — incluindo o Brasil inteiro.
 */
export function workDateFromDb(value: Date): WorkDate {
  const year = value.getUTCFullYear().toString().padStart(4, '0');
  const month = (value.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = value.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converte de volta para o `Date` que o Prisma espera numa coluna `@db.Date`:
 * meia-noite UTC do dia civil, sem qualquer deslocamento.
 */
export function workDateToDb(value: WorkDate): Date {
  const [year, month, day] = assertWorkDate(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/** Primeiro dia da competência (mês) informada. */
export function firstDayOfMonth(year: number, month: number): WorkDate {
  return DateTime.fromObject({ year, month, day: 1 }, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}

/** Último dia da competência (mês) informada. */
export function lastDayOfMonth(year: number, month: number): WorkDate {
  return DateTime.fromObject({ year, month }, { zone: 'utc' }).endOf('month').toFormat('yyyy-MM-dd');
}

/** Sequência inclusiva de dias civis entre `from` e `to`. */
export function eachWorkDate(from: WorkDate, to: WorkDate): WorkDate[] {
  const start = DateTime.fromISO(assertWorkDate(from), { zone: 'utc' });
  const end = DateTime.fromISO(assertWorkDate(to), { zone: 'utc' });
  if (end < start) return [];

  const days: WorkDate[] = [];
  for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
    days.push(cursor.toFormat('yyyy-MM-dd'));
  }
  return days;
}

/** `true` para sábado ou domingo. Usado apenas para exibição — ver premissa 4 no README. */
export function isWeekend(value: WorkDate): boolean {
  const weekday = DateTime.fromISO(assertWorkDate(value), { zone: 'utc' }).weekday;
  return weekday === 6 || weekday === 7;
}
