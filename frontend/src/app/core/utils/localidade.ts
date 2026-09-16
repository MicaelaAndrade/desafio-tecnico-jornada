/**
 * Coerência entre o fuso detectado e o país declarado na marcação.
 *
 * O fuso vem do dispositivo e é o que calcula a jornada; o país é digitado pelo
 * colaborador e serve de registro de auditoria. Nada impede que os dois se
 * contradigam — declarar `DE` com o relógio em São Paulo — e uma divergência
 * silenciosa é justamente a que ninguém percebe até o fechamento.
 */

/**
 * País de cada fuso em que a operação acontece.
 *
 * Deliberadamente não é a tabela IANA inteira. Um fuso ausente daqui não produz
 * aviso nenhum: diante do desconhecido é melhor calar do que acusar divergência
 * onde talvez não exista. O objetivo é pegar o erro de digitação óbvio, não
 * arbitrar geografia.
 *
 * A relação também não é biunívoca no sentido inverso — `Europe/Zurich` é usado
 * por Liechtenstein, `Europe/Oslo` por Svalbard — e é por isso que a checagem
 * só olha de fuso para país, nunca ao contrário.
 */
const PAIS_POR_FUSO: Readonly<Record<string, string>> = {
  'America/Araguaina': 'BR',
  'America/Bahia': 'BR',
  'America/Belem': 'BR',
  'America/Boa_Vista': 'BR',
  'America/Campo_Grande': 'BR',
  'America/Cuiaba': 'BR',
  'America/Eirunepe': 'BR',
  'America/Fortaleza': 'BR',
  'America/Maceio': 'BR',
  'America/Manaus': 'BR',
  'America/Noronha': 'BR',
  'America/Porto_Velho': 'BR',
  'America/Recife': 'BR',
  'America/Rio_Branco': 'BR',
  'America/Santarem': 'BR',
  'America/Sao_Paulo': 'BR',
  'Atlantic/Azores': 'PT',
  'Atlantic/Madeira': 'PT',
  'Europe/Amsterdam': 'NL',
  'Europe/Athens': 'GR',
  'Europe/Berlin': 'DE',
  'Europe/Brussels': 'BE',
  'Europe/Bucharest': 'RO',
  'Europe/Budapest': 'HU',
  'Europe/Copenhagen': 'DK',
  'Europe/Dublin': 'IE',
  'Europe/Helsinki': 'FI',
  'Europe/Lisbon': 'PT',
  'Europe/London': 'GB',
  'Europe/Madrid': 'ES',
  'Europe/Oslo': 'NO',
  'Europe/Paris': 'FR',
  'Europe/Prague': 'CZ',
  'Europe/Rome': 'IT',
  'Europe/Stockholm': 'SE',
  'Europe/Vienna': 'AT',
  'Europe/Warsaw': 'PL',
  'Europe/Zurich': 'CH',
};

/**
 * Nome por extenso dos países da operação.
 *
 * Existe para o texto da tela: "DE" só é evidente para quem já conhece a tabela
 * ISO, e o campo é preenchido por quem está batendo o ponto, não por quem
 * mantém o sistema. Um país fora desta lista continua aceito — apenas aparece
 * pela sigla, sem nome.
 */
const NOME_POR_PAIS: Readonly<Record<string, string>> = {
  AT: 'Áustria',
  BE: 'Bélgica',
  BR: 'Brasil',
  CH: 'Suíça',
  CZ: 'Tchéquia',
  DE: 'Alemanha',
  DK: 'Dinamarca',
  ES: 'Espanha',
  FI: 'Finlândia',
  FR: 'França',
  GB: 'Reino Unido',
  GR: 'Grécia',
  HU: 'Hungria',
  IE: 'Irlanda',
  IT: 'Itália',
  NL: 'Países Baixos',
  NO: 'Noruega',
  PL: 'Polônia',
  PT: 'Portugal',
  RO: 'Romênia',
  SE: 'Suécia',
};

/** País correspondente ao fuso, ou `null` quando não há opinião a respeito. */
export function paisDoFuso(fuso: string): string | null {
  return PAIS_POR_FUSO[fuso] ?? null;
}

/** Nome por extenso do país, ou `null` quando a sigla não é conhecida. */
export function nomeDoPais(pais: string): string | null {
  return NOME_POR_PAIS[pais.trim().toUpperCase()] ?? null;
}

/**
 * Verdadeiro apenas quando há certeza suficiente para avisar: o fuso é conhecido,
 * o país está completo e os dois discordam.
 *
 * Um país ainda pela metade ("D") não é divergência — é alguém digitando.
 */
export function divergeDoFuso(fuso: string, pais: string): boolean {
  const esperado = paisDoFuso(fuso);
  if (esperado === null) return false;

  const declarado = pais.trim().toUpperCase();
  return declarado.length === 2 && declarado !== esperado;
}
