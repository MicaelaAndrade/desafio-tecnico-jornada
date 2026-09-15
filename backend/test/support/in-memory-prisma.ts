import { randomUUID } from 'node:crypto';

/**
 * Duplo de teste do PrismaService, em memória.
 *
 * Implementa apenas as formas de consulta que a aplicação realmente usa, e lança
 * exceção diante de qualquer outra — um duplo permissivo demais devolveria dados
 * errados em silêncio e daria um teste verde enganoso.
 *
 * A troca permite exercitar a API de ponta a ponta (rotas, validação, guards,
 * regras de acesso e cálculo) sem exigir PostgreSQL, o que mantém a suíte
 * executável em qualquer ambiente. Testes contra o banco real, cobrindo
 * migrations, constraints e transações de verdade, continuam sendo um passo
 * seguinte — está registrado nas limitações do README.
 */

type Registro = Record<string, any>;

function comparar(a: unknown, b: unknown): number {
  const va = a instanceof Date ? a.getTime() : a;
  const vb = b instanceof Date ? b.getTime() : b;

  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb));
}

function atende(registro: Registro, where?: Registro): boolean {
  if (!where) return true;

  for (const [campo, criterio] of Object.entries(where)) {
    if (criterio === undefined) continue;

    const valor = registro[campo];

    if (criterio === null) {
      if (valor !== null && valor !== undefined) return false;
      continue;
    }

    if (criterio instanceof Date) {
      if (!(valor instanceof Date) || valor.getTime() !== criterio.getTime()) return false;
      continue;
    }

    if (typeof criterio === 'object') {
      for (const [operador, alvo] of Object.entries(criterio as Registro)) {
        switch (operador) {
          case 'in':
            if (!(alvo as unknown[]).includes(valor)) return false;
            break;
          case 'notIn':
            if ((alvo as unknown[]).includes(valor)) return false;
            break;
          case 'not':
            if (valor === alvo) return false;
            break;
          case 'gte':
            if (comparar(valor, alvo) < 0) return false;
            break;
          case 'lte':
            if (comparar(valor, alvo) > 0) return false;
            break;
          case 'gt':
            if (comparar(valor, alvo) <= 0) return false;
            break;
          case 'lt':
            if (comparar(valor, alvo) >= 0) return false;
            break;
          default:
            throw new Error(`Duplo de teste não suporta o operador "${operador}".`);
        }
      }
      continue;
    }

    if (valor !== criterio) return false;
  }

  return true;
}

function ordenar(registros: Registro[], orderBy?: Registro | Registro[]): Registro[] {
  if (!orderBy) return registros;

  const criterios = Array.isArray(orderBy) ? orderBy : [orderBy];

  return [...registros].sort((a, b) => {
    for (const criterio of criterios) {
      const [campo, direcao] = Object.entries(criterio)[0];
      const resultado = comparar(a[campo], b[campo]);
      if (resultado !== 0) return direcao === 'desc' ? -resultado : resultado;
    }
    return 0;
  });
}

function projetar(registro: Registro | null, select?: Registro): Registro | null {
  if (!registro || !select) return registro;

  const projetado: Registro = {};
  for (const campo of Object.keys(select)) {
    if (select[campo]) projetado[campo] = registro[campo];
  }
  return projetado;
}

class Colecao {
  readonly registros: Registro[] = [];

  constructor(
    private readonly padroes: () => Registro,
    private readonly enriquecer?: (registro: Registro, include?: Registro) => Registro,
  ) {}

  limpar(): void {
    this.registros.length = 0;
  }

  semear(registro: Registro): Registro {
    const criado = { ...this.padroes(), ...registro };
    this.registros.push(criado);
    return criado;
  }

  async create({ data, select, include }: Registro): Promise<Registro> {
    const criado = { ...this.padroes(), ...data };
    this.registros.push(criado);
    return this.entregar(criado, select, include);
  }

  async findUnique({ where, select, include }: Registro): Promise<Registro | null> {
    const encontrado = this.registros.find((registro) => this.casaChave(registro, where)) ?? null;
    return encontrado ? this.entregar(encontrado, select, include) : null;
  }

  async findFirst({ where, orderBy, select, include }: Registro = {}): Promise<Registro | null> {
    const candidatos = ordenar(
      this.registros.filter((registro) => atende(registro, where)),
      orderBy,
    );
    return candidatos.length ? this.entregar(candidatos[0], select, include) : null;
  }

  async findMany({ where, orderBy, select, include }: Registro = {}): Promise<Registro[]> {
    return ordenar(
      this.registros.filter((registro) => atende(registro, where)),
      orderBy,
    ).map((registro) => this.entregar(registro, select, include));
  }

  async update({ where, data, select, include }: Registro): Promise<Registro> {
    const alvo = this.registros.find((registro) => this.casaChave(registro, where));
    if (!alvo) throw new Error('Registro não encontrado para atualização.');

    Object.assign(alvo, data, { updatedAt: new Date() });
    return this.entregar(alvo, select, include);
  }

  async upsert({ where, create, update, select, include }: Registro): Promise<Registro> {
    const alvo = this.registros.find((registro) => this.casaChave(registro, where));

    if (alvo) {
      Object.assign(alvo, update, { updatedAt: new Date() });
      return this.entregar(alvo, select, include);
    }

    return this.create({ data: create, select, include });
  }

  async count({ where }: Registro = {}): Promise<number> {
    return this.registros.filter((registro) => atende(registro, where)).length;
  }

  async deleteMany(): Promise<{ count: number }> {
    const total = this.registros.length;
    this.limpar();
    return { count: total };
  }

  /** Resolve tanto chaves simples quanto as compostas do Prisma (`userId_year_month`). */
  private casaChave(registro: Registro, where: Registro): boolean {
    const plano: Registro = {};

    for (const [campo, valor] of Object.entries(where)) {
      if (valor && typeof valor === 'object' && !(valor instanceof Date) && campo.includes('_')) {
        Object.assign(plano, valor);
      } else {
        plano[campo] = valor;
      }
    }

    return atende(registro, plano);
  }

  private entregar(registro: Registro, select?: Registro, include?: Registro): Registro {
    const base = include && this.enriquecer ? this.enriquecer(registro, include) : { ...registro };
    return (projetar(base, select) ?? base) as Registro;
  }
}

export class InMemoryPrisma {
  readonly user = new Colecao(() => ({
    id: randomUUID(),
    role: 'EMPLOYEE',
    expectedDailyMinutes: 480,
    managerId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  readonly timeEntry = new Colecao(() => ({
    id: randomUUID(),
    source: 'WEB',
    note: null,
    originCorrectionId: null,
    revokedAt: null,
    revokedByCorrectionId: null,
    createdAt: new Date(),
  }));

  readonly correctionRequest = new Colecao(
    () => ({
      id: randomUUID(),
      targetEntryId: null,
      proposedType: null,
      proposedOccurredAt: null,
      proposedTimezone: null,
      proposedCountry: null,
      status: 'PENDING',
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date(),
    }),
    (registro, include) => {
      const enriquecido: Registro = { ...registro };

      if (include?.['user']) {
        const dono = this.user.registros.find((u) => u.id === registro['userId']);
        enriquecido['user'] = { name: dono?.['name'] ?? '' };
      }

      return enriquecido;
    },
  );

  readonly monthlyClosing = new Colecao(() => ({
    id: randomUUID(),
    status: 'OPEN',
    workedMinutes: null,
    expectedMinutes: null,
    balanceMinutes: null,
    closedById: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  /**
   * Executa o callback direto, sem isolamento nem rollback. É suficiente para
   * verificar que a sequência de escritas produz o estado esperado, mas não
   * substitui um teste de atomicidade contra o banco real.
   */
  async $transaction<T>(callback: (tx: InMemoryPrisma) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}

  limparTudo(): void {
    this.user.limpar();
    this.timeEntry.limpar();
    this.correctionRequest.limpar();
    this.monthlyClosing.limpar();
  }
}
