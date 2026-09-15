/** Converte minutos em "8h 30m", preservando o sinal para saldos negativos. */
export function formatarMinutos(minutos: number): string {
  const sinal = minutos < 0 ? '-' : '';
  const absoluto = Math.abs(minutos);
  const horas = Math.floor(absoluto / 60);
  const resto = absoluto % 60;

  return `${sinal}${horas}h ${String(resto).padStart(2, '0')}m`;
}

/** Saldo com sinal explícito, para leitura rápida na folha de ponto. */
export function formatarSaldo(minutos: number): string {
  if (minutos === 0) return '0h 00m';
  return `${minutos > 0 ? '+' : ''}${formatarMinutos(minutos)}`;
}

/** "2026-09-14" → "14/09" */
export function formatarDiaCurto(workDate: string): string {
  const [, mes, dia] = workDate.split('-');
  return `${dia}/${mes}`;
}

/** "2026-09-14" → "seg, 14/09" */
export function formatarDiaComSemana(workDate: string): string {
  const semana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const [ano, mes, dia] = workDate.split('-').map(Number);
  // Construído em UTC para que o rótulo não mude conforme o fuso do navegador.
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return `${semana[data.getUTCDay()]}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

export function ehFimDeSemana(workDate: string): boolean {
  const [ano, mes, dia] = workDate.split('-').map(Number);
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return diaSemana === 0 || diaSemana === 6;
}

/** Fuso IANA do dispositivo — enviado ao servidor para posicionar a marcação. */
export function fusoDoDispositivo(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * País inferido a partir do locale do navegador, usado como sugestão inicial.
 * O colaborador pode corrigir antes de confirmar a marcação.
 */
export function paisSugerido(): string {
  const locale = navigator.language ?? 'pt-BR';
  const regiao = locale.split('-')[1];
  return (regiao ?? 'BR').toUpperCase().slice(0, 2);
}

export const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
