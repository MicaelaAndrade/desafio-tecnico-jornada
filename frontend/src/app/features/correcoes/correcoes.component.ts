import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import {
  CorrectionRequest,
  CorrectionStatus,
  TIPO_MARCACAO_LABEL,
} from '../../core/models/jornada.models';
import { AuthService } from '../../core/services/auth.service';
import { JornadaService } from '../../core/services/jornada.service';
import { formatarDiaComSemana } from '../../core/utils/format';

const ROTULO_TIPO: Record<CorrectionRequest['type'], string> = {
  ADD: 'Inclusão de marcação',
  REMOVE: 'Remoção de marcação',
  MODIFY: 'Ajuste de horário',
};

const ROTULO_STATUS: Record<CorrectionStatus, string> = {
  PENDING: 'Aguardando homologação',
  APPROVED: 'Homologada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

@Component({
  selector: 'app-correcoes',
  standalone: true,
  imports: [
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTabsModule,
    MatProgressBarModule,
  ],
  templateUrl: './correcoes.component.html',
  styleUrl: './correcoes.component.scss',
})
export class CorrecoesComponent implements OnInit {
  private readonly jornada = inject(JornadaService);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  readonly carregando = signal(true);
  readonly correcoes = signal<CorrectionRequest[]>([]);

  readonly pendentes = computed(() => this.correcoes().filter((c) => c.status === 'PENDING'));
  readonly analisadas = computed(() => this.correcoes().filter((c) => c.status !== 'PENDING'));

  ngOnInit(): void {
    this.carregar();
  }

  /** Ninguém homologa a própria correção — o botão nem aparece nesse caso. */
  podeHomologar(correcao: CorrectionRequest): boolean {
    return this.auth.ehGestor() && correcao.userId !== this.auth.usuario()?.id;
  }

  podeCancelar(correcao: CorrectionRequest): boolean {
    return correcao.requestedById === this.auth.usuario()?.id;
  }

  homologar(correcao: CorrectionRequest): void {
    this.jornada.homologarCorrecao(correcao.id).subscribe({
      next: () => {
        this.snackBar.open('Correção homologada e aplicada à folha.', 'Fechar', { duration: 4000 });
        this.carregar();
      },
    });
  }

  rejeitar(correcao: CorrectionRequest): void {
    this.jornada.rejeitarCorrecao(correcao.id).subscribe({
      next: () => {
        this.snackBar.open('Correção rejeitada.', 'Fechar', { duration: 4000 });
        this.carregar();
      },
    });
  }

  cancelar(correcao: CorrectionRequest): void {
    this.jornada.cancelarCorrecao(correcao.id).subscribe({
      next: () => {
        this.snackBar.open('Solicitação cancelada.', 'Fechar', { duration: 4000 });
        this.carregar();
      },
    });
  }

  rotuloTipo(correcao: CorrectionRequest): string {
    const base = ROTULO_TIPO[correcao.type];
    return correcao.proposedType
      ? `${base} — ${TIPO_MARCACAO_LABEL[correcao.proposedType]}`
      : base;
  }

  rotuloStatus(status: CorrectionStatus): string {
    return ROTULO_STATUS[status];
  }

  /**
   * O horário proposto é exibido no fuso em que a marcação seria registrada, e não
   * no fuso de quem está analisando: um gestor no Brasil precisa ver "18:00 em
   * Lisboa", que é o horário que o colaborador está afirmando ter trabalhado.
   */
  horarioProposto(correcao: CorrectionRequest): string {
    if (!correcao.proposedOccurredAt) return '—';

    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: correcao.proposedTimezone ?? 'UTC',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(correcao.proposedOccurredAt));
  }

  rotuloDia(workDate: string): string {
    return formatarDiaComSemana(workDate);
  }

  private carregar(): void {
    this.carregando.set(true);

    this.jornada.correcoes().subscribe({
      next: (correcoes) => {
        this.correcoes.set(correcoes);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }
}
