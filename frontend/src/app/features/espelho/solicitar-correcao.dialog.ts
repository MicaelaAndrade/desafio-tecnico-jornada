import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TIPO_MARCACAO_LABEL, TimeEntry, TimeEntryType } from '../../core/models/jornada.models';
import { JornadaService } from '../../core/services/jornada.service';
import { formatarDiaComSemana } from '../../core/utils/format';

export interface DadosCorrecao {
  workDate: string;
  userId: string;
  timezone: string;
  countryCode: string;
  entries: TimeEntry[];
}

/**
 * Solicitação de correção de jornada.
 *
 * A marcação original nunca é editada: o que se envia é um pedido, que passa por
 * homologação do gestor antes de alterar a folha. A justificativa é obrigatória
 * porque é ela que dá rastreabilidade ao ajuste.
 */
@Component({
  selector: 'app-solicitar-correcao',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Solicitar correção</h2>

    <mat-dialog-content>
      <p class="dia">{{ diaFormatado }}</p>

      <form [formGroup]="form">
        <mat-form-field appearance="outline">
          <mat-label>O que precisa ser corrigido</mat-label>
          <mat-select formControlName="type">
            <mat-option value="ADD">Incluir uma marcação que faltou</mat-option>
            <mat-option value="REMOVE" [disabled]="dados.entries.length === 0">
              Remover uma marcação indevida
            </mat-option>
          </mat-select>
        </mat-form-field>

        @if (form.controls.type.value === 'ADD') {
          <mat-form-field appearance="outline">
            <mat-label>Tipo da marcação</mat-label>
            <mat-select formControlName="proposedType">
              @for (tipo of tipos; track tipo) {
                <mat-option [value]="tipo">{{ rotulo(tipo) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Horário correto</mat-label>
            <input matInput type="time" formControlName="horario" />
            <mat-hint>Horário local de {{ dados.timezone }}</mat-hint>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>Marcação a remover</mat-label>
            <mat-select formControlName="targetEntryId">
              @for (marcacao of dados.entries; track marcacao.id) {
                <mat-option [value]="marcacao.id">
                  {{ rotulo(marcacao.type) }} — {{ marcacao.localTime }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field appearance="outline">
          <mat-label>Justificativa</mat-label>
          <textarea matInput rows="3" formControlName="reason"></textarea>
          @if (form.controls.reason.touched && form.controls.reason.invalid) {
            <mat-error>
              Descreva o que aconteceu em pelo menos 10 caracteres — é isso que dá rastreabilidade
              ao ajuste.
            </mat-error>
          } @else {
            <mat-hint>Fica registrada na trilha de auditoria, junto de quem homologou.</mat-hint>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="form.invalid || enviando()"
        (click)="enviar()"
      >
        Enviar solicitação
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      form {
        display: flex;
        flex-direction: column;
        min-width: min(22rem, 70vw);
      }
      .dia {
        margin: 0 0 1rem;
        opacity: 0.7;
        text-transform: capitalize;
      }
    `,
  ],
})
export class SolicitarCorrecaoDialog {
  private readonly fb = inject(FormBuilder);
  private readonly jornada = inject(JornadaService);
  private readonly dialogRef = inject(MatDialogRef<SolicitarCorrecaoDialog>);

  readonly dados = inject<DadosCorrecao>(MAT_DIALOG_DATA);
  readonly enviando = signal(false);
  readonly tipos: TimeEntryType[] = ['CLOCK_IN', 'BREAK_START', 'BREAK_END', 'CLOCK_OUT'];
  readonly diaFormatado = formatarDiaComSemana(this.dados.workDate);

  readonly form = this.fb.nonNullable.group({
    type: ['ADD' as 'ADD' | 'REMOVE', Validators.required],
    proposedType: ['CLOCK_OUT' as TimeEntryType],
    horario: ['18:00'],
    targetEntryId: [''],
    reason: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
  });

  rotulo(tipo: TimeEntryType): string {
    return TIPO_MARCACAO_LABEL[tipo];
  }

  enviar(): void {
    if (this.form.invalid || this.enviando()) return;
    this.enviando.set(true);

    const valores = this.form.getRawValue();

    const payload =
      valores.type === 'ADD'
        ? {
            userId: this.dados.userId,
            type: 'ADD' as const,
            proposedType: valores.proposedType,
            // O horário digitado é local; o servidor recebe o instante já posicionado
            // no fuso do registro para não depender do relógio do navegador.
            proposedOccurredAt: this.paraInstanteUtc(valores.horario),
            proposedTimezone: this.dados.timezone,
            proposedCountry: this.dados.countryCode,
            workDate: this.dados.workDate,
            reason: valores.reason,
          }
        : {
            userId: this.dados.userId,
            type: 'REMOVE' as const,
            targetEntryId: valores.targetEntryId,
            workDate: this.dados.workDate,
            reason: valores.reason,
          };

    this.jornada.solicitarCorrecao(payload).subscribe({
      next: () => this.dialogRef.close(true),
      error: () => this.enviando.set(false),
    });
  }

  /**
   * Converte "HH:mm" no fuso do dia para um instante ISO em UTC, descobrindo o
   * offset real daquela data — o que evita erro em dias de horário de verão.
   */
  private paraInstanteUtc(horario: string): string {
    const [hora, minuto] = horario.split(':').map(Number);
    const [ano, mes, dia] = this.dados.workDate.split('-').map(Number);

    const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto);
    const offset = this.offsetMinutos(new Date(palpite), this.dados.timezone);

    return new Date(palpite - offset * 60_000).toISOString();
  }

  private offsetMinutos(instante: Date, fuso: string): number {
    const formatador = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const partes = Object.fromEntries(
      formatador.formatToParts(instante).map((p) => [p.type, p.value]),
    );

    const comoUtc = Date.UTC(
      Number(partes['year']),
      Number(partes['month']) - 1,
      Number(partes['day']),
      Number(partes['hour']) % 24,
      Number(partes['minute']),
      Number(partes['second']),
    );

    return Math.round((comoUtc - instante.getTime()) / 60_000);
  }
}
