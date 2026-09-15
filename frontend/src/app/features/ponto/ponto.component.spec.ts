import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { ShiftStatus, TimeEntry } from '../../core/models/jornada.models';
import { AuthService } from '../../core/services/auth.service';
import { JornadaService } from '../../core/services/jornada.service';
import { PontoComponent } from './ponto.component';

const USUARIO = {
  id: 'u-1',
  name: 'Ana Souza',
  email: 'ana.souza@ddgroup.example',
  role: 'EMPLOYEE' as const,
  baseTimezone: 'America/Sao_Paulo',
  countryCode: 'BR',
  expectedDailyMinutes: 480,
};

function marcacao(parcial: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'e-1',
    userId: 'u-1',
    type: 'CLOCK_IN',
    occurredAt: '2026-09-14T12:00:00.000Z',
    localTime: '09:00',
    timezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    utcOffsetMinutes: -180,
    workDate: '2026-09-14',
    source: 'WEB',
    registeredById: 'u-1',
    ...parcial,
  };
}

describe('PontoComponent', () => {
  let fixture: ComponentFixture<PontoComponent>;
  let jornada: jasmine.SpyObj<JornadaService>;

  async function montar(status: ShiftStatus, marcacoes: TimeEntry[] = []): Promise<void> {
    jornada = jasmine.createSpyObj<JornadaService>('JornadaService', [
      'statusAtual',
      'marcacoes',
      'registrarMarcacao',
    ]);
    jornada.statusAtual.and.returnValue(of(status));
    jornada.marcacoes.and.returnValue(of(marcacoes));
    jornada.registrarMarcacao.and.returnValue(of(marcacao()));

    await TestBed.configureTestingModule({
      imports: [PontoComponent],
      providers: [
        provideNoopAnimations(),
        { provide: JornadaService, useValue: jornada },
        { provide: AuthService, useValue: { usuario: () => USUARIO } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PontoComponent);
    fixture.detectChanges();
  }

  function textoDosBotoesDeAcao(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.acoes button') as NodeListOf<HTMLElement>,
    ).map((botao) => {
      // O botão contém o ícone (ligature do Material) junto do rótulo; interessa o rótulo.
      const clone = botao.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('mat-icon').forEach((icone) => icone.remove());
      return clone.textContent?.trim() ?? '';
    });
  }

  afterEach(() => fixture?.destroy());

  it('oferece apenas a entrada quando a jornada não começou', async () => {
    await montar({ state: 'OFF_SHIFT', allowedNext: ['CLOCK_IN'] });

    expect(textoDosBotoesDeAcao()).toEqual(['Entrada']);
    expect(fixture.nativeElement.textContent).toContain('Fora da jornada');
  });

  it('oferece pausa e saída durante o expediente', async () => {
    await montar({ state: 'WORKING', allowedNext: ['BREAK_START', 'CLOCK_OUT'] });

    expect(textoDosBotoesDeAcao()).toEqual(['Início da pausa', 'Saída']);
    expect(fixture.nativeElement.textContent).toContain('Em expediente');
  });

  it('não oferece marcação inválida para o estado atual', async () => {
    await montar({ state: 'ON_BREAK', allowedNext: ['BREAK_END', 'CLOCK_OUT'] });

    expect(textoDosBotoesDeAcao()).not.toContain('Entrada');
    expect(fixture.nativeElement.textContent).toContain('Em pausa');
  });

  it('envia o fuso do dispositivo e nenhum horário — o instante é do servidor', async () => {
    await montar({ state: 'OFF_SHIFT', allowedNext: ['CLOCK_IN'] });

    fixture.nativeElement.querySelector('.acoes button').click();

    const enviado = jornada.registrarMarcacao.calls.mostRecent().args[0];
    expect(enviado.type).toBe('CLOCK_IN');
    expect(enviado.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(Object.keys(enviado)).not.toContain('occurredAt');
  });

  it('consulta o dia da jornada em aberto, e não o dia de hoje', async () => {
    await montar({
      state: 'WORKING',
      allowedNext: ['CLOCK_OUT'],
      openWorkDate: '2026-09-14',
    });

    // Turno noturno: a madrugada pertence ao dia anterior.
    expect(jornada.marcacoes).toHaveBeenCalledWith({ from: '2026-09-14', to: '2026-09-14' });
  });

  it('lista as marcações com horário local e local do registro', async () => {
    await montar({ state: 'WORKING', allowedNext: ['CLOCK_OUT'] }, [
      marcacao({ localTime: '09:00', timezone: 'Europe/Lisbon', countryCode: 'PT' }),
    ]);

    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('09:00');
    expect(texto).toContain('Europe/Lisbon');
    expect(texto).toContain('PT');
  });
});
