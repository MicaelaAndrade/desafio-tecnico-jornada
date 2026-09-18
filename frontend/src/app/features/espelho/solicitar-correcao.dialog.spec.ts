import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { CorrectionRequest, TimeEntry } from '../../core/models/jornada.models';
import { JornadaService } from '../../core/services/jornada.service';
import { DadosCorrecao, SolicitarCorrecaoDialog } from './solicitar-correcao.dialog';

function marcacao(id: string, type: TimeEntry['type'], localTime: string): TimeEntry {
  return {
    id,
    userId: 'u-1',
    type,
    occurredAt: '2026-09-14T12:00:00.000Z',
    localTime,
    timezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    utcOffsetMinutes: -180,
    workDate: '2026-09-14',
    source: 'WEB',
    registeredById: 'u-1',
  };
}

const DADOS: DadosCorrecao = {
  workDate: '2026-09-14',
  userId: 'u-1',
  timezone: 'America/Sao_Paulo',
  countryCode: 'BR',
  entries: [
    marcacao('11111111-1111-1111-1111-111111111111', 'CLOCK_IN', '09:00'),
    marcacao('22222222-2222-2222-2222-222222222222', 'CLOCK_IN', '09:05'),
  ],
};

describe('SolicitarCorrecaoDialog', () => {
  let fixture: ComponentFixture<SolicitarCorrecaoDialog>;
  let componente: SolicitarCorrecaoDialog;
  let jornada: jasmine.SpyObj<JornadaService>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<SolicitarCorrecaoDialog>>;

  async function montar(dados: DadosCorrecao = DADOS): Promise<void> {
    jornada = jasmine.createSpyObj<JornadaService>('JornadaService', ['solicitarCorrecao']);
    jornada.solicitarCorrecao.and.returnValue(of({} as CorrectionRequest));
    dialogRef = jasmine.createSpyObj<MatDialogRef<SolicitarCorrecaoDialog>>('MatDialogRef', [
      'close',
    ]);

    await TestBed.configureTestingModule({
      imports: [SolicitarCorrecaoDialog],
      providers: [
        provideNoopAnimations(),
        { provide: JornadaService, useValue: jornada },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: dados },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SolicitarCorrecaoDialog);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  function preencherJustificativa(): void {
    componente.form.controls.reason.setValue('Registrei a entrada duas vezes por engano.');
    fixture.detectChanges();
  }

  describe('remoção de marcação', () => {
    // Regressão: sem validador condicional, o botão ficava habilitado com o campo
    // vazio e a API recusava com "targetEntryId must be a UUID".
    it('não permite enviar sem escolher a marcação a remover', async () => {
      await montar();

      componente.form.controls.type.setValue('REMOVE');
      componente.form.controls.targetEntryId.setValue('');
      preencherJustificativa();

      expect(componente.form.controls.targetEntryId.invalid).toBe(true);
      expect(componente.form.invalid).toBe(true);

      componente.enviar();
      expect(jornada.solicitarCorrecao).not.toHaveBeenCalled();
    });

    it('pré-seleciona a primeira marcação ao escolher remoção', async () => {
      await montar();

      componente.form.controls.type.setValue('REMOVE');
      fixture.detectChanges();

      expect(componente.form.controls.targetEntryId.value).toBe(DADOS.entries[0].id);
      expect(componente.form.controls.targetEntryId.valid).toBe(true);
    });

    it('envia o identificador da marcação escolhida', async () => {
      await montar();

      componente.form.controls.type.setValue('REMOVE');
      componente.form.controls.targetEntryId.setValue(DADOS.entries[1].id);
      preencherJustificativa();

      componente.enviar();

      const enviado = jornada.solicitarCorrecao.calls.mostRecent().args[0];
      expect(enviado.type).toBe('REMOVE');
      expect(enviado.targetEntryId).toBe(DADOS.entries[1].id);
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });
  });

  describe('inclusão de marcação', () => {
    // Regressão: type e horario chegavam pré-preenchidos ('CLOCK_OUT' e '18:00'),
    // então dava para enviar uma correção sem escolher nada de propósito — o
    // valor "plausível" passava despercebido tanto de quem preenchia quanto de
    // quem homologava. Ver histórico: isso já causou uma marcação de saída
    // incluída às 18:00 num dia onde a correção de verdade era outra coisa.
    it('não permite enviar sem escolher o tipo e o horário da marcação', async () => {
      await montar();
      preencherJustificativa();

      expect(componente.form.controls.proposedType.value).toBe('');
      expect(componente.form.controls.horario.value).toBe('');
      expect(componente.form.invalid).toBe(true);

      componente.enviar();
      expect(jornada.solicitarCorrecao).not.toHaveBeenCalled();
    });

    it('não exige nem envia a marcação alvo', async () => {
      await montar();
      componente.form.controls.proposedType.setValue('CLOCK_OUT');
      componente.form.controls.horario.setValue('18:00');
      preencherJustificativa();

      expect(componente.form.valid).toBe(true);

      componente.enviar();

      const enviado = jornada.solicitarCorrecao.calls.mostRecent().args[0];
      expect(enviado.type).toBe('ADD');
      expect(enviado.proposedType).toBe('CLOCK_OUT');
      expect(Object.keys(enviado)).not.toContain('targetEntryId');
    });

    it('limpa a marcação alvo ao voltar de remoção para inclusão', async () => {
      await montar();

      componente.form.controls.type.setValue('REMOVE');
      expect(componente.form.controls.targetEntryId.value).toBe(DADOS.entries[0].id);

      componente.form.controls.type.setValue('ADD');
      expect(componente.form.controls.targetEntryId.value).toBe('');
      expect(componente.form.controls.targetEntryId.valid).toBe(true);
    });
  });

  describe('justificativa', () => {
    it('bloqueia o envio com texto curto demais', async () => {
      await montar();

      componente.form.controls.reason.setValue('esqueci');
      expect(componente.form.invalid).toBe(true);

      componente.enviar();
      expect(jornada.solicitarCorrecao).not.toHaveBeenCalled();
    });
  });
});
