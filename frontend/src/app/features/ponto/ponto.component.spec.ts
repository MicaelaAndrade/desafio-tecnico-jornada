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

  describe('país declarado × fuso detectado', () => {
    // O fuso é fixado no teste em vez de lido do ambiente: o resultado não pode
    // depender do relógio da máquina que roda a suíte.
    async function comLocal(fuso: string, pais: string): Promise<PontoComponent> {
      await montar({ state: 'OFF_SHIFT', allowedNext: ['CLOCK_IN'] });

      const componente = fixture.componentInstance;
      componente.fuso.set(fuso);
      componente.pais.set(pais);
      fixture.detectChanges();

      return componente;
    }

    it('avisa quando o país declarado contradiz o fuso', async () => {
      const componente = await comLocal('America/Sao_Paulo', 'DE');

      expect(componente.divergenciaDeLocal()).toBe(true);
      expect(fixture.nativeElement.querySelector('.aviso-divergencia')).not.toBeNull();
    });

    // O texto fala em países, não em siglas: quem bate o ponto não tem obrigação
    // de saber que DE é Alemanha.
    it('nomeia os dois países por extenso no aviso', async () => {
      await comLocal('America/Sao_Paulo', 'DE');

      const aviso = fixture.nativeElement.querySelector('.aviso-divergencia') as HTMLElement;
      expect(aviso.textContent).toContain('Brasil');
      expect(aviso.textContent).toContain('Alemanha');
    });

    // Sigla fora da lista de nomes ainda precisa produzir uma frase legível.
    it('recai na sigla quando o país não tem nome conhecido', async () => {
      await comLocal('America/Sao_Paulo', 'XX');

      const aviso = fixture.nativeElement.querySelector('.aviso-divergencia') as HTMLElement;
      expect(aviso.textContent).toContain('Brasil');
      expect(aviso.textContent).toContain('XX');
    });

    it('confirma o país na dica do campo enquanto a pessoa digita', async () => {
      await comLocal('America/Sao_Paulo', 'PT');

      const dica = fixture.nativeElement.querySelector('.campo-pais mat-hint') as HTMLElement;
      expect(dica.textContent?.trim()).toBe('Portugal');
    });

    it('mostra a instrução na dica enquanto a sigla não é reconhecida', async () => {
      await comLocal('America/Sao_Paulo', 'X');

      const dica = fixture.nativeElement.querySelector('.campo-pais mat-hint') as HTMLElement;
      expect(dica.textContent).toContain('BR para Brasil');
    });

    // O ponto da decisão: avisar sem impedir. Uma jornada que aconteceu de fato
    // não pode deixar de ser registrada por causa de um palpite de geografia.
    it('não bloqueia o registro apesar do aviso', async () => {
      await comLocal('America/Sao_Paulo', 'DE');

      const botao = fixture.nativeElement.querySelector('.acoes button') as HTMLButtonElement;
      expect(botao.disabled).toBe(false);

      botao.click();

      const enviado = jornada.registrarMarcacao.calls.mostRecent().args[0];
      expect(enviado.countryCode).toBe('DE');
      expect(enviado.timezone).toBe('America/Sao_Paulo');
    });

    it('não avisa quando o país é o do próprio fuso', async () => {
      const componente = await comLocal('Europe/Lisbon', 'PT');

      expect(componente.divergenciaDeLocal()).toBe(false);
      expect(fixture.nativeElement.querySelector('.aviso-divergencia')).toBeNull();
    });

    it('não avisa sobre fuso fora do mapa de localidades', async () => {
      const componente = await comLocal('Asia/Tokyo', 'BR');

      expect(componente.paisSugeridoPeloFuso()).toBeNull();
      expect(componente.divergenciaDeLocal()).toBe(false);
    });
  });
});
