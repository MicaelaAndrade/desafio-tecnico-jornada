/**
 * Carga inicial de demonstração.
 *
 * O cenário foi montado para exercitar o que o desafio descreve: equipe dividida
 * entre Brasil e Europa, colaborador em viagem internacional, turno que cruza a
 * meia-noite, dia com marcação esquecida e uma correção aguardando homologação.
 */
import { CorrectionType, EntrySource, PrismaClient, Role, TimeEntryType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

const SENHA_PADRAO = 'jornada123';

interface Marcacao {
  type: TimeEntryType;
  /** Horário local `HH:mm` no fuso informado. */
  local: string;
  /** Dias somados ao `workDate` — usado por turnos que cruzam a meia-noite. */
  dayOffset?: number;
}

async function criarUsuario(params: {
  name: string;
  email: string;
  role: Role;
  baseTimezone: string;
  countryCode: string;
  managerId?: string;
  expectedDailyMinutes?: number;
}) {
  return prisma.user.create({
    data: {
      ...params,
      email: params.email.toLowerCase(),
      passwordHash: await bcrypt.hash(SENHA_PADRAO, 10),
      expectedDailyMinutes: params.expectedDailyMinutes ?? 480,
    },
  });
}

/** Cria as marcações de um dia, convertendo horários locais para instantes UTC. */
async function registrarJornada(params: {
  userId: string;
  registeredById: string;
  workDate: string;
  timezone: string;
  countryCode: string;
  marcacoes: Marcacao[];
  source?: EntrySource;
  note?: string;
}) {
  for (const marcacao of params.marcacoes) {
    const base = DateTime.fromISO(`${params.workDate}T${marcacao.local}`, {
      zone: params.timezone,
    }).plus({ days: marcacao.dayOffset ?? 0 });

    await prisma.timeEntry.create({
      data: {
        userId: params.userId,
        type: marcacao.type,
        occurredAt: base.toJSDate(),
        timezone: params.timezone,
        countryCode: params.countryCode,
        // O offset é congelado no registro, como faria a aplicação em produção.
        utcOffsetMinutes: base.offset,
        workDate: new Date(`${params.workDate}T00:00:00.000Z`),
        source: params.source ?? EntrySource.WEB,
        note: params.note,
        registeredById: params.registeredById,
      },
    });
  }
}

const JORNADA_PADRAO: Marcacao[] = [
  { type: TimeEntryType.CLOCK_IN, local: '09:00' },
  { type: TimeEntryType.BREAK_START, local: '12:00' },
  { type: TimeEntryType.BREAK_END, local: '13:00' },
  { type: TimeEntryType.CLOCK_OUT, local: '18:00' },
];

/** Dias úteis do mês corrente até ontem. */
function diasUteisDoMes(): string[] {
  const hoje = DateTime.now().setZone('America/Sao_Paulo');
  const dias: string[] = [];

  for (let cursor = hoje.startOf('month'); cursor < hoje.startOf('day'); cursor = cursor.plus({ days: 1 })) {
    if (cursor.weekday <= 5) dias.push(cursor.toFormat('yyyy-MM-dd'));
  }

  return dias;
}

async function main(): Promise<void> {
  // A carga roda a cada `docker compose up`. Sem esta guarda, reiniciar o ambiente
  // apagaria os dados criados durante a avaliação. Use `--force` para recriar.
  const jaPopulado = await prisma.user.count();
  if (jaPopulado > 0 && !process.argv.includes('--force')) {
    console.log('Base já populada — seed ignorado. Use "npm run prisma:seed -- --force" para recriar.');
    return;
  }

  console.log('Limpando dados anteriores...');
  await prisma.timeEntry.deleteMany();
  await prisma.correctionRequest.deleteMany();
  await prisma.monthlyClosing.deleteMany();
  await prisma.user.deleteMany();

  console.log('Criando colaboradores...');

  const rh = await criarUsuario({
    name: 'Helena Martins',
    email: 'helena.martins@ddgroup.example',
    role: Role.HR,
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
  });

  const gestor = await criarUsuario({
    name: 'Rafael Costa',
    email: 'rafael.costa@ddgroup.example',
    role: Role.MANAGER,
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
  });

  const ana = await criarUsuario({
    name: 'Ana Souza',
    email: 'ana.souza@ddgroup.example',
    role: Role.EMPLOYEE,
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    managerId: gestor.id,
  });

  const bruno = await criarUsuario({
    name: 'Bruno Almeida',
    email: 'bruno.almeida@ddgroup.example',
    role: Role.EMPLOYEE,
    baseTimezone: 'Europe/Lisbon',
    countryCode: 'PT',
    managerId: gestor.id,
  });

  const carla = await criarUsuario({
    name: 'Carla Nunes',
    email: 'carla.nunes@ddgroup.example',
    role: Role.EMPLOYEE,
    baseTimezone: 'Europe/Berlin',
    countryCode: 'DE',
    managerId: gestor.id,
    expectedDailyMinutes: 420, // 7h — contrato alemão de jornada reduzida
  });

  // Colaborador com contrato no Brasil que viaja para o escritório de Lisboa.
  const diego = await criarUsuario({
    name: 'Diego Ramos',
    email: 'diego.ramos@ddgroup.example',
    role: Role.EMPLOYEE,
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    managerId: gestor.id,
  });

  const dias = diasUteisDoMes();
  if (dias.length === 0) {
    console.log('Mês corrente ainda não tem dias úteis encerrados; seed criou apenas os usuários.');
    return;
  }

  console.log(`Registrando jornada de ${dias.length} dia(s) útil(eis)...`);

  const ultimoDia = dias[dias.length - 1];
  const diasDeViagem = new Set(dias.slice(-3)); // Diego passa os últimos dias em Lisboa

  for (const dia of dias) {
    // Ana: jornada regular no Brasil, exceto no último dia (esqueceu a saída).
    await registrarJornada({
      userId: ana.id,
      registeredById: ana.id,
      workDate: dia,
      timezone: 'America/Sao_Paulo',
      countryCode: 'BR',
      marcacoes:
        dia === ultimoDia
          ? [
              { type: TimeEntryType.CLOCK_IN, local: '09:00' },
              { type: TimeEntryType.BREAK_START, local: '12:00' },
              { type: TimeEntryType.BREAK_END, local: '13:00' },
              // Sem CLOCK_OUT: o espelho de ponto aponta MISSING_CLOCK_OUT.
            ]
          : JORNADA_PADRAO,
    });

    // Bruno: jornada em Lisboa; uma vez por semana cobre plantão noturno que
    // atravessa a meia-noite — todas as marcações permanecem no mesmo workDate.
    const plantaoNoturno = DateTime.fromISO(dia).weekday === 3;
    await registrarJornada({
      userId: bruno.id,
      registeredById: bruno.id,
      workDate: dia,
      timezone: 'Europe/Lisbon',
      countryCode: 'PT',
      marcacoes: plantaoNoturno
        ? [
            { type: TimeEntryType.CLOCK_IN, local: '22:00' },
            { type: TimeEntryType.BREAK_START, local: '01:00', dayOffset: 1 },
            { type: TimeEntryType.BREAK_END, local: '01:30', dayOffset: 1 },
            { type: TimeEntryType.CLOCK_OUT, local: '06:30', dayOffset: 1 },
          ]
        : JORNADA_PADRAO,
    });

    // Carla: jornada de 7h em Berlim.
    await registrarJornada({
      userId: carla.id,
      registeredById: carla.id,
      workDate: dia,
      timezone: 'Europe/Berlin',
      countryCode: 'DE',
      marcacoes: [
        { type: TimeEntryType.CLOCK_IN, local: '08:30' },
        { type: TimeEntryType.BREAK_START, local: '12:30' },
        { type: TimeEntryType.BREAK_END, local: '13:00' },
        { type: TimeEntryType.CLOCK_OUT, local: '16:00' },
      ],
    });

    // Diego: contrato no Brasil, mas os últimos dias foram cumpridos em Lisboa.
    const emViagem = diasDeViagem.has(dia);
    await registrarJornada({
      userId: diego.id,
      registeredById: diego.id,
      workDate: dia,
      timezone: emViagem ? 'Europe/Lisbon' : 'America/Sao_Paulo',
      countryCode: emViagem ? 'PT' : 'BR',
      marcacoes: JORNADA_PADRAO,
      note: emViagem ? 'Semana no escritório de Lisboa' : undefined,
    });
  }

  console.log('Criando correção pendente de homologação...');

  await prisma.correctionRequest.create({
    data: {
      userId: ana.id,
      requestedById: ana.id,
      type: CorrectionType.ADD,
      proposedType: TimeEntryType.CLOCK_OUT,
      proposedOccurredAt: DateTime.fromISO(`${ultimoDia}T18:00`, {
        zone: 'America/Sao_Paulo',
      }).toJSDate(),
      proposedTimezone: 'America/Sao_Paulo',
      proposedCountry: 'BR',
      workDate: new Date(`${ultimoDia}T00:00:00.000Z`),
      reason: 'Esqueci de registrar a saída; encerrei o expediente às 18h como de costume.',
    },
  });

  console.log('\nUsuários criados (senha: %s):', SENHA_PADRAO);
  console.table([
    { papel: 'RH', nome: rh.name, email: rh.email, local: 'BR' },
    { papel: 'Gestor', nome: gestor.name, email: gestor.email, local: 'BR' },
    { papel: 'Colaborador', nome: ana.name, email: ana.email, local: 'BR' },
    { papel: 'Colaborador', nome: bruno.name, email: bruno.email, local: 'PT' },
    { papel: 'Colaborador', nome: carla.name, email: carla.email, local: 'DE' },
    { papel: 'Colaborador', nome: diego.name, email: diego.email, local: 'BR → PT (viagem)' },
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
