import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TeamMemberSummary } from '../../core/models/jornada.models';
import { AuthService } from '../../core/services/auth.service';
import { JornadaService } from '../../core/services/jornada.service';
import { MESES, formatarMinutos, formatarSaldo } from '../../core/utils/format';

@Component({
  selector: 'app-equipe',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  templateUrl: './equipe.component.html',
  styleUrl: './equipe.component.scss',
})
export class EquipeComponent implements OnInit {
  private readonly jornada = inject(JornadaService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  readonly auth = inject(AuthService);

  private readonly hoje = new Date();

  readonly ano = signal(this.hoje.getFullYear());
  readonly mes = signal(this.hoje.getMonth() + 1);
  readonly carregando = signal(true);
  readonly membros = signal<TeamMemberSummary[]>([]);

  readonly rotuloCompetencia = computed(() => `${MESES[this.mes() - 1]} de ${this.ano()}`);

  readonly totalPendencias = computed(() =>
    this.membros().reduce((soma, m) => soma + m.daysWithInconsistencies, 0),
  );

  ngOnInit(): void {
    this.carregar();
  }

  mudarCompetencia(delta: number): void {
    const referencia = new Date(Date.UTC(this.ano(), this.mes() - 1 + delta, 1));
    this.ano.set(referencia.getUTCFullYear());
    this.mes.set(referencia.getUTCMonth() + 1);
    this.carregar();
  }

  abrirEspelho(membro: TeamMemberSummary): void {
    void this.router.navigate(['/espelho'], {
      queryParams: { userId: membro.userId, ano: this.ano(), mes: this.mes() },
    });
  }

  fechar(membro: TeamMemberSummary, force = false): void {
    this.jornada
      .fecharCompetencia({ userId: membro.userId, year: this.ano(), month: this.mes(), force })
      .subscribe({
        next: () => {
          this.snackBar.open(`Competência de ${membro.name} fechada.`, 'Fechar', { duration: 4000 });
          this.carregar();
        },
        error: (erro) => {
          // 409 com dias inconsistentes: oferece a homologação com ressalva em vez
          // de simplesmente barrar — a decisão é do RH, mas fica explícita.
          if (erro.status === 409 && membro.daysWithInconsistencies > 0) {
            this.snackBar
              .open(
                `${membro.name} tem ${membro.daysWithInconsistencies} dia(s) com pendência.`,
                'Fechar mesmo assim',
                { duration: 8000 },
              )
              .onAction()
              .subscribe(() => this.fechar(membro, true));
          }
        },
      });
  }

  reabrir(membro: TeamMemberSummary): void {
    this.jornada
      .reabrirCompetencia({
        userId: membro.userId,
        year: this.ano(),
        month: this.mes(),
        reason: 'Reabertura solicitada pelo RH para ajuste de marcações.',
      })
      .subscribe({
        next: () => {
          this.snackBar.open(`Competência de ${membro.name} reaberta.`, 'Fechar', { duration: 4000 });
          this.carregar();
        },
      });
  }

  duracao(minutos: number): string {
    return formatarMinutos(minutos);
  }

  saldo(minutos: number): string {
    return formatarSaldo(minutos);
  }

  private carregar(): void {
    this.carregando.set(true);

    this.jornada.resumoDaEquipe(this.ano(), this.mes()).subscribe({
      next: (membros) => {
        this.membros.set(membros);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }
}
