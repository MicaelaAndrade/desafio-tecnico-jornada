/**
 * Cenário de demonstração, compartilhado entre a carga no banco (`seed.ts`) e o
 * modo demonstração (`demo-server.ts`).
 *
 * Foi montado para exercitar o que o enunciado descreve: equipe dividida entre
 * Brasil e Europa, colaborador em viagem internacional, turno que cruza a
 * meia-noite, dia com marcação esquecida e uma correção aguardando homologação.
 *
 * A função recebe o cliente em vez de criá-lo, para que a mesma carga sirva ao
 * PostgreSQL e ao repositório em memória — não faz sentido manter duas versões do
 * cenário e arriscar que divirjam.
 */
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';

export const SENHA_PADRAO = 'jornada123';

/** Subconjunto do cliente Prisma que a carga utiliza. */
export interface ClienteDeCarga {
  user: {
    create(args: {
      data: Record<string, unknown>;
    }): Promise<{ id: string; name: string; email: string }>;
  };
  timeEntry: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  correctionRequest: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

export interface Marcacao {
  type: string;
  /** Horário local `HH:mm` no fuso informado. */
  local: string;
  /** Dias somados ao dia da jornada — usado por turnos que cruzam a meia-noite. */
  dayOffset?: number;
}

export const JORNADA_PADRAO: Marcacao[] = [
  { type: 'CLOCK_IN', local: '09:00' },
  { type: 'BREAK_START', local: '12:00' },
  { type: 'BREAK_END', local: '13:00' },
  { type: 'CLOCK_OUT', local: '18:00' },
];

export interface ResultadoDaCarga {
  usuarios: { papel: string; nome: string; email: string; local: string }[];
}

/** Dias úteis do mês corrente até ontem, no fuso de São Paulo. */
function diasUteisDoMes(): string[] {
  const hoje = DateTime.now().setZone('America/Sao_Paulo');
  const dias: string[] = [];

  for (
    let cursor = hoje.startOf('month');
    cursor < hoje.startOf('day');
    cursor = cursor.plus({ days: 1 })
  ) {
    if (cursor.weekday <= 5) dias.push(cursor.toFormat('yyyy-MM-dd'));
  }

  return dias;
}

export async function popularCenario(
  prisma: ClienteDeCarga,
  opcoes: { custoDoHash?: number } = {},
): Promise<ResultadoDaCarga> {
  // O custo do hash é reduzido no modo demonstração: são seis usuários criados a
  // cada inicialização, e ali a senha não protege nada.
  const passwordHash = await bcrypt.hash(SENHA_PADRAO, opcoes.custoDoHash ?? 10);

  const criarUsuario = (params: {
    name: string;
    email: string;
    role: string;
    baseTimezone: string;
    countryCode: string;
    managerId?: string;
    expectedDailyMinutes?: number;
  }) =>
    prisma.user.create({
      data: {
        ...params,
        email: params.email.toLowerCase(),
        passwordHash,
        expectedDailyMinutes: params.expectedDailyMinutes ?? 480,
      },
    });

  const registrarJornada = async (params: {
    userId: string;
    workDate: string;
    timezone: string;
    countryCode: string;
    marcacoes: Marcacao[];
    note?: string;
  }) => {
    for (const marcacao of params.marcacoes) {
      const instante = DateTime.fromISO(`${params.workDate}T${marcacao.local}`, {
        zone: params.timezone,
      }).plus({ days: marcacao.dayOffset ?? 0 });

      await prisma.timeEntry.create({
        data: {
          userId: params.userId,
          type: marcacao.type,
          occurredAt: instante.toJSDate(),
          timezone: params.timezone,
          countryCode: params.countryCode,
          // O offset é congelado no registro, como a aplicação faria em produção.
          utcOffsetMinutes: instante.offset,
          workDate: new Date(`${params.workDate}T00:00:00.000Z`),
          source: 'WEB',
          note: params.note,
          registeredById: params.userId,
        },
      });
    }
  };

  const rh = await criarUsuario({
    name: 'Helena Martins',
    email: 'helena.martins@ddgroup.example',
    role: 'HR',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
  });

  const gestor = await criarUsuario({
    name: 'Rafael Costa',
    email: 'rafael.costa@ddgroup.example',
    role: 'MANAGER',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
  });

  const ana = await criarUsuario({
    name: 'Ana Souza',
    email: 'ana.souza@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    managerId: gestor.id,
  });

  const bruno = await criarUsuario({
    name: 'Bruno Almeida',
    email: 'bruno.almeida@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'Europe/Lisbon',
    countryCode: 'PT',
    managerId: gestor.id,
  });

  const carla = await criarUsuario({
    name: 'Carla Nunes',
    email: 'carla.nunes@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'Europe/Berlin',
    countryCode: 'DE',
    expectedDailyMinutes: 420, // 7h — contrato alemão de jornada reduzida
    managerId: gestor.id,
  });

  // Contrato no Brasil, mas com os últimos dias cumpridos no escritório de Lisboa.
  const diego = await criarUsuario({
    name: 'Diego Ramos',
    email: 'diego.ramos@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    managerId: gestor.id,
  });

  const usuarios = [
    { papel: 'RH', nome: rh.name, email: rh.email, local: 'BR' },
    { papel: 'Gestor', nome: gestor.name, email: gestor.email, local: 'BR' },
    { papel: 'Colaborador', nome: ana.name, email: ana.email, local: 'BR' },
    { papel: 'Colaborador', nome: bruno.name, email: bruno.email, local: 'PT' },
    { papel: 'Colaborador', nome: carla.name, email: carla.email, local: 'DE' },
    { papel: 'Colaborador', nome: diego.name, email: diego.email, local: 'BR → PT (viagem)' },
  ];

  const dias = diasUteisDoMes();
  if (dias.length === 0) return { usuarios };

  const ultimoDia = dias[dias.length - 1];
  const diasDeViagem = new Set(dias.slice(-3));

  for (const dia of dias) {
    // Ana esqueceu a saída no último dia: é a pendência que o espelho sinaliza.
    await registrarJornada({
      userId: ana.id,
      workDate: dia,
      timezone: 'America/Sao_Paulo',
      countryCode: 'BR',
      marcacoes: dia === ultimoDia ? JORNADA_PADRAO.slice(0, 3) : JORNADA_PADRAO,
    });

    // Bruno cobre plantão noturno às quartas — a jornada atravessa a meia-noite.
    const plantaoNoturno = DateTime.fromISO(dia).weekday === 3;
    await registrarJornada({
      userId: bruno.id,
      workDate: dia,
      timezone: 'Europe/Lisbon',
      countryCode: 'PT',
      marcacoes: plantaoNoturno
        ? [
            { type: 'CLOCK_IN', local: '22:00' },
            { type: 'BREAK_START', local: '01:00', dayOffset: 1 },
            { type: 'BREAK_END', local: '01:30', dayOffset: 1 },
            { type: 'CLOCK_OUT', local: '06:30', dayOffset: 1 },
          ]
        : JORNADA_PADRAO,
    });

    await registrarJornada({
      userId: carla.id,
      workDate: dia,
      timezone: 'Europe/Berlin',
      countryCode: 'DE',
      marcacoes: [
        { type: 'CLOCK_IN', local: '08:30' },
        { type: 'BREAK_START', local: '12:30' },
        { type: 'BREAK_END', local: '13:00' },
        { type: 'CLOCK_OUT', local: '16:00' },
      ],
    });

    const emViagem = diasDeViagem.has(dia);
    await registrarJornada({
      userId: diego.id,
      workDate: dia,
      timezone: emViagem ? 'Europe/Lisbon' : 'America/Sao_Paulo',
      countryCode: emViagem ? 'PT' : 'BR',
      marcacoes: JORNADA_PADRAO,
      note: emViagem ? 'Semana no escritório de Lisboa' : undefined,
    });
  }

  await prisma.correctionRequest.create({
    data: {
      userId: ana.id,
      requestedById: ana.id,
      type: 'ADD',
      proposedType: 'CLOCK_OUT',
      proposedOccurredAt: DateTime.fromISO(`${ultimoDia}T18:00`, {
        zone: 'America/Sao_Paulo',
      }).toJSDate(),
      proposedTimezone: 'America/Sao_Paulo',
      proposedCountry: 'BR',
      workDate: new Date(`${ultimoDia}T00:00:00.000Z`),
      reason: 'Esqueci de registrar a saída; encerrei o expediente às 18h como de costume.',
    },
  });

  return { usuarios };
}
