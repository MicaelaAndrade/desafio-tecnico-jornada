import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ShiftStatus,
  TIPO_MARCACAO_LABEL,
  TimeEntry,
  TimeEntryType,
} from '../../core/models/jornada.models';
import { AuthService } from '../../core/services/auth.service';
import { JornadaService } from '../../core/services/jornada.service';
import { formatarMinutos, fusoDoDispositivo, paisSugerido } from '../../core/utils/format';

const ROTULO_ESTADO: Record<ShiftStatus['state'], string> = {
  OFF_SHIFT: 'Fora da jornada',
  WORKING: 'Em expediente',
  ON_BREAK: 'Em pausa',
};

@Component({
  selector: 'app-ponto',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './ponto.component.html',
  styleUrl: './ponto.component.scss',
})
export class PontoComponent implements OnInit, OnDestroy {
  private readonly jornada = inject(JornadaService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  private relogioId?: ReturnType<typeof setInterval>;

  readonly agora = signal(new Date());
  readonly carregando = signal(true);
  readonly registrando = signal(false);
  readonly status = signal<ShiftStatus | null>(null);
  readonly marcacoesDeHoje = signal<TimeEntry[]>([]);

  /** Fuso detectado no dispositivo — é o que posiciona a marcação no dia certo. */
  readonly fuso = signal(fusoDoDispositivo());
  readonly pais = signal(paisSugerido());

  readonly rotuloEstado = computed(() => {
    const atual = this.status();
    return atual ? ROTULO_ESTADO[atual.state] : '—';
  });

  readonly emViagem = computed(() => this.fuso() !== this.auth.usuario()?.baseTimezone);

  readonly totalTrabalhadoHoje = computed(() => {
    const marcacoes = [...this.marcacoesDeHoje()].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );

    let total = 0;
    let inicio: number | null = null;

    for (const marcacao of marcacoes) {
      const instante = new Date(marcacao.occurredAt).getTime();

      if (marcacao.type === 'CLOCK_IN' || marcacao.type === 'BREAK_END') {
        inicio ??= instante;
      } else if (inicio !== null) {
        total += instante - inicio;
        inicio = null;
      }
    }

    // Enquanto a jornada está aberta, o contador acompanha o relógio.
    if (inicio !== null) total += this.agora().getTime() - inicio;

    return Math.max(0, Math.round(total / 60_000));
  });

  ngOnInit(): void {
    this.carregar();
    this.relogioId = setInterval(() => this.agora.set(new Date()), 1000);
  }

  ngOnDestroy(): void {
    if (this.relogioId) clearInterval(this.relogioId);
  }

  registrar(tipo: TimeEntryType): void {
    if (this.registrando()) return;
    this.registrando.set(true);

    this.jornada
      .registrarMarcacao({ type: tipo, timezone: this.fuso(), countryCode: this.pais() })
      .subscribe({
        next: (marcacao) => {
          this.snackBar.open(
            `${TIPO_MARCACAO_LABEL[tipo]} registrada às ${marcacao.localTime}.`,
            'Fechar',
            { duration: 4000 },
          );
          this.registrando.set(false);
          this.carregar();
        },
        error: () => this.registrando.set(false),
      });
  }

  rotuloDoTipo(tipo: TimeEntryType): string {
    return TIPO_MARCACAO_LABEL[tipo];
  }

  iconeDoTipo(tipo: TimeEntryType): string {
    return {
      CLOCK_IN: 'login',
      BREAK_START: 'free_breakfast',
      BREAK_END: 'work_history',
      CLOCK_OUT: 'logout',
    }[tipo];
  }

  formatar(minutos: number): string {
    return formatarMinutos(minutos);
  }

  private carregar(): void {
    this.carregando.set(true);

    this.jornada.statusAtual().subscribe({
      next: (status) => {
        this.status.set(status);

        // O dia consultado é o da jornada em aberto, quando houver: num turno que
        // cruza a meia-noite, as marcações da madrugada pertencem ao dia anterior.
        const dia = status.openWorkDate ?? this.dataLocalDeHoje();

        this.jornada.marcacoes({ from: dia, to: dia }).subscribe({
          next: (marcacoes) => {
            this.marcacoesDeHoje.set(marcacoes);
            this.carregando.set(false);
          },
          error: () => this.carregando.set(false),
        });
      },
      error: () => this.carregando.set(false),
    });
  }

  private dataLocalDeHoje(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.fuso() }).format(new Date());
  }
}
