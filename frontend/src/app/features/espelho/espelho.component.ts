import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import {
  DailyTimesheet,
  MonthlyTimesheet,
  TIPO_MARCACAO_LABEL,
  TimeEntryType,
} from '../../core/models/jornada.models';
import { AuthService } from '../../core/services/auth.service';
import { JornadaService } from '../../core/services/jornada.service';
import {
  MESES,
  ehFimDeSemana,
  formatarDiaComSemana,
  formatarMinutos,
  formatarSaldo,
} from '../../core/utils/format';
import { SolicitarCorrecaoDialog } from './solicitar-correcao.dialog';

/** Só colunas com valor comparável; "Marcações" é uma lista, não tem ordem natural. */
export type ColunaOrdenavel = 'workDate' | 'workedMinutes' | 'balanceMinutes';

export interface Ordenacao {
  coluna: ColunaOrdenavel;
  direcao: 'asc' | 'desc';
}

@Component({
  selector: 'app-espelho',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  templateUrl: './espelho.component.html',
  styleUrl: './espelho.component.scss',
})
export class EspelhoComponent implements OnInit {
  private readonly jornada = inject(JornadaService);
  private readonly dialog = inject(MatDialog);
  private readonly rota = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  private readonly hoje = new Date();

  readonly ano = signal(this.hoje.getFullYear());
  readonly mes = signal(this.hoje.getMonth() + 1);
  readonly carregando = signal(true);
  readonly espelho = signal<MonthlyTimesheet | null>(null);
  readonly usuarioConsultado = signal<string | undefined>(undefined);
  readonly apenasComPendencia = signal(false);

  readonly rotuloCompetencia = computed(() => `${MESES[this.mes() - 1]} de ${this.ano()}`);

  readonly ehPropriaJornada = computed(() => {
    const alvo = this.usuarioConsultado();
    return !alvo || alvo === this.auth.usuario()?.id;
  });

  /**
   * Ordenação da tabela.
   *
   * O padrão é dia crescente, que é como um espelho de ponto é lido e conferido.
   * Mas quem usa a tela no dia a dia quer o dia de hoje, que fica no fim do mês —
   * um clique em "Dia" inverte e traz o mais recente para o topo.
   */
  readonly ordenacao = signal<Ordenacao>({ coluna: 'workDate', direcao: 'asc' });

  /**
   * Dia de hoje no fuso contratual do colaborador — não no fuso do navegador.
   * Quem consulta a jornada de um colega em outro país precisa ver o "hoje" dele.
   */
  private readonly hojeDoColaborador = computed(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: this.espelho()?.baseTimezone ?? this.auth.usuario()?.baseTimezone ?? 'UTC',
    }).format(new Date()),
  );

  /**
   * Dias do mês que ainda não aconteceram.
   *
   * Não têm marcação, não geram expectativa e não entram no saldo: só ocupam a
   * tela. Na competência corrente eles ficam ocultos por padrão — sem isso, ver
   * o dia mais recente primeiro ainda exigiria rolar por duas semanas vazias.
   */
  readonly diasFuturos = computed(
    () =>
      (this.espelho()?.days ?? []).filter((dia) => dia.workDate > this.hojeDoColaborador()).length,
  );

  readonly mostrarFuturos = signal(false);

  readonly diasVisiveis = computed(() => {
    const dias = this.espelho()?.days ?? [];

    const ateHoje =
      this.mostrarFuturos() || this.diasFuturos() === 0
        ? dias
        : dias.filter((dia) => dia.workDate <= this.hojeDoColaborador());

    const filtrados = this.apenasComPendencia()
      ? ateHoje.filter((dia) => dia.inconsistencies.some((i) => i.severity !== 'INFO'))
      : ateHoje;

    const { coluna, direcao } = this.ordenacao();
    const sentido = direcao === 'asc' ? 1 : -1;

    // Cópia: o array vem do signal do espelho e ordenar no lugar mutaria o estado.
    return [...filtrados].sort((a, b) => {
      // Datas ISO ordenam cronologicamente como texto, então não há Date aqui.
      const diferenca =
        coluna === 'workDate' ? a.workDate.localeCompare(b.workDate) : a[coluna] - b[coluna];

      // Empate (dias com o mesmo saldo, por exemplo) volta à ordem cronológica,
      // para a tabela não embaralhar linhas equivalentes a cada clique.
      return diferenca !== 0 ? diferenca * sentido : a.workDate.localeCompare(b.workDate);
    });
  });

  ngOnInit(): void {
    this.rota.queryParamMap.subscribe((params) => {
      this.usuarioConsultado.set(params.get('userId') ?? undefined);

      const ano = Number(params.get('ano'));
      const mes = Number(params.get('mes'));
      if (ano) this.ano.set(ano);
      if (mes) this.mes.set(mes);

      this.carregar();
    });
  }

  mudarCompetencia(delta: number): void {
    const referencia = new Date(Date.UTC(this.ano(), this.mes() - 1 + delta, 1));
    this.ano.set(referencia.getUTCFullYear());
    this.mes.set(referencia.getUTCMonth() + 1);
    this.carregar();
  }

  alternarFiltro(): void {
    this.apenasComPendencia.update((valor) => !valor);
  }

  alternarFuturos(): void {
    this.mostrarFuturos.update((valor) => !valor);
  }

  /**
   * Clicar na coluna já ativa inverte o sentido; clicar em outra começa crescente,
   * exceto nas colunas numéricas, onde o interesse costuma ser o maior valor
   * (mais horas trabalhadas, maior saldo) e começar por ele poupa um clique.
   */
  ordenarPor(coluna: ColunaOrdenavel): void {
    this.ordenacao.update((atual) =>
      atual.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: coluna === 'workDate' ? 'asc' : 'desc' },
    );
  }

  /** Valor de `aria-sort`: leitores de tela anunciam a coluna ativa e o sentido. */
  sentidoAria(coluna: ColunaOrdenavel): 'ascending' | 'descending' | 'none' {
    const atual = this.ordenacao();
    if (atual.coluna !== coluna) return 'none';
    return atual.direcao === 'asc' ? 'ascending' : 'descending';
  }

  iconeOrdenacao(coluna: ColunaOrdenavel): string {
    const atual = this.ordenacao();
    if (atual.coluna !== coluna) return 'unfold_more';
    return atual.direcao === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  solicitarCorrecao(dia: DailyTimesheet): void {
    const usuario = this.auth.usuario();
    if (!usuario) return;

    this.dialog
      .open(SolicitarCorrecaoDialog, {
        data: {
          workDate: dia.workDate,
          userId: this.usuarioConsultado() ?? usuario.id,
          // Usa o fuso em que o dia foi efetivamente registrado; recai no fuso
          // contratual quando não houve marcação nenhuma naquele dia.
          timezone: dia.timezones[0] ?? usuario.baseTimezone,
          countryCode: dia.countries[0] ?? usuario.countryCode,
          entries: dia.entries,
        },
      })
      .afterClosed()
      .subscribe((enviou) => {
        if (enviou) this.carregar();
      });
  }

  rotuloDoTipo(tipo: TimeEntryType): string {
    return TIPO_MARCACAO_LABEL[tipo];
  }

  rotuloDoDia(workDate: string): string {
    return formatarDiaComSemana(workDate);
  }

  fimDeSemana(workDate: string): boolean {
    return ehFimDeSemana(workDate);
  }

  duracao(minutos: number): string {
    return formatarMinutos(minutos);
  }

  saldo(minutos: number): string {
    return formatarSaldo(minutos);
  }

  /** Apontamentos informativos (viagem, múltiplos fusos) não são pendência. */
  pendencias(dia: DailyTimesheet) {
    return dia.inconsistencies.filter((i) => i.severity !== 'INFO');
  }

  informativos(dia: DailyTimesheet) {
    return dia.inconsistencies.filter((i) => i.severity === 'INFO');
  }

  private carregar(): void {
    this.carregando.set(true);

    this.jornada.espelhoMensal(this.ano(), this.mes(), this.usuarioConsultado()).subscribe({
      next: (espelho) => {
        this.espelho.set(espelho);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }
}
