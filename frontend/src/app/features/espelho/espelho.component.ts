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

  readonly diasVisiveis = computed(() => {
    const dias = this.espelho()?.days ?? [];
    return this.apenasComPendencia()
      ? dias.filter((dia) => dia.inconsistencies.some((i) => i.severity !== 'INFO'))
      : dias;
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
