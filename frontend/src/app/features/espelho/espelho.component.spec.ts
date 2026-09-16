import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DailyTimesheet, MonthlyTimesheet } from '../../core/models/jornada.models';
import { AuthService } from '../../core/services/auth.service';
import { JornadaService } from '../../core/services/jornada.service';
import { EspelhoComponent } from './espelho.component';

const USUARIO = {
  id: 'u-1',
  name: 'Ana Souza',
  email: 'ana.souza@ddgroup.example',
  role: 'EMPLOYEE' as const,
  baseTimezone: 'America/Sao_Paulo',
  countryCode: 'BR',
  expectedDailyMinutes: 480,
};

function dia(parcial: Partial<DailyTimesheet> & { workDate: string }): DailyTimesheet {
  return {
    entries: [],
    segments: [],
    workedMinutes: 0,
    breakMinutes: 0,
    expectedMinutes: 480,
    balanceMinutes: 0,
    inconsistencies: [],
    timezones: [],
    countries: [],
    isConsistent: true,
    ...parcial,
  };
}

const DIAS: DailyTimesheet[] = [
  dia({ workDate: '2026-09-01', workedMinutes: 480, balanceMinutes: 0 }),
  dia({
    workDate: '2026-09-02',
    workedMinutes: 300,
    balanceMinutes: -180,
    inconsistencies: [
      { code: 'MISSING_CLOCK_OUT', severity: 'ERROR', message: 'Jornada aberta sem saída.' },
    ],
  }),
  dia({ workDate: '2026-09-03', workedMinutes: 600, balanceMinutes: 120 }),
];

const ESPELHO: MonthlyTimesheet = {
  userId: 'u-1',
  userName: 'Ana Souza',
  baseTimezone: 'America/Sao_Paulo',
  year: 2026,
  month: 9,
  days: DIAS,
  workedMinutes: 1380,
  expectedMinutes: 1440,
  balanceMinutes: -60,
  daysWithInconsistencies: 1,
  closingStatus: 'OPEN',
};

describe('EspelhoComponent', () => {
  let fixture: ComponentFixture<EspelhoComponent>;
  let componente: EspelhoComponent;

  async function montar(espelho: MonthlyTimesheet = ESPELHO): Promise<void> {
    const jornada = jasmine.createSpyObj<JornadaService>('JornadaService', ['espelhoMensal']);
    jornada.espelhoMensal.and.returnValue(of(espelho));

    await TestBed.configureTestingModule({
      imports: [EspelhoComponent],
      providers: [
        provideNoopAnimations(),
        { provide: JornadaService, useValue: jornada },
        { provide: AuthService, useValue: { usuario: () => USUARIO } },
        { provide: MatDialog, useValue: jasmine.createSpyObj<MatDialog>('MatDialog', ['open']) },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(new Map() as never) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EspelhoComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => fixture?.destroy());

  function datasVisiveis(): string[] {
    return componente.diasVisiveis().map((d) => d.workDate);
  }

  describe('ordenação', () => {
    it('começa pelo dia crescente, como um espelho é conferido', async () => {
      await montar();

      expect(datasVisiveis()).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
      expect(componente.sentidoAria('workDate')).toBe('ascending');
    });

    // Motivação da funcionalidade: o dia de hoje fica no fim do mês, e percorrer
    // a tela inteira para chegar nele é o incômodo que a ordenação resolve.
    it('inverte para o mais recente ao clicar na coluna já ativa', async () => {
      await montar();

      componente.ordenarPor('workDate');

      expect(datasVisiveis()).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
      expect(componente.sentidoAria('workDate')).toBe('descending');
    });

    it('ordena por horas trabalhadas começando pela maior', async () => {
      await montar();

      componente.ordenarPor('workedMinutes');

      expect(datasVisiveis()).toEqual(['2026-09-03', '2026-09-01', '2026-09-02']);
      expect(componente.sentidoAria('workedMinutes')).toBe('descending');
      expect(componente.sentidoAria('workDate')).toBe('none');
    });

    it('ordena por saldo e inverte no segundo clique', async () => {
      await montar();

      componente.ordenarPor('balanceMinutes');
      expect(datasVisiveis()).toEqual(['2026-09-03', '2026-09-01', '2026-09-02']);

      componente.ordenarPor('balanceMinutes');
      expect(datasVisiveis()).toEqual(['2026-09-02', '2026-09-01', '2026-09-03']);
    });

    it('não altera os dias do espelho ao ordenar', async () => {
      await montar();

      componente.ordenarPor('balanceMinutes');

      expect(componente.espelho()!.days.map((d) => d.workDate)).toEqual([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
      ]);
    });

    it('mantém o filtro de pendências junto da ordenação', async () => {
      await montar();

      componente.alternarFiltro();
      componente.ordenarPor('workDate');

      expect(datasVisiveis()).toEqual(['2026-09-02']);
    });
  });

  describe('dias por vir', () => {
    // Datas propositalmente distantes: qualquer data relativa a "hoje" faria o
    // teste mudar de significado conforme o dia em que roda.
    const COM_FUTUROS: MonthlyTimesheet = {
      ...ESPELHO,
      days: [
        ...DIAS,
        dia({ workDate: '2099-01-01', expectedMinutes: 0 }),
        dia({ workDate: '2099-01-02', expectedMinutes: 0 }),
      ],
    };

    it('oculta por padrão os dias que ainda não aconteceram', async () => {
      await montar(COM_FUTUROS);

      expect(componente.diasFuturos()).toBe(2);
      expect(datasVisiveis()).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    });

    it('mostra os dias futuros quando pedido, sem perder a ordenação', async () => {
      await montar(COM_FUTUROS);

      componente.alternarFuturos();
      componente.ordenarPor('workDate');

      expect(datasVisiveis()[0]).toBe('2099-01-02');
      expect(datasVisiveis().length).toBe(5);
    });

    it('com os futuros ocultos, inverter a ordem traz o dia mais recente ao topo', async () => {
      await montar(COM_FUTUROS);

      componente.ordenarPor('workDate');

      expect(datasVisiveis()[0]).toBe('2026-09-03');
    });

    it('não oferece o filtro quando o mês já terminou', async () => {
      await montar();

      expect(componente.diasFuturos()).toBe(0);
      expect(fixture.nativeElement.textContent).not.toContain('por vir');
    });
  });

  describe('cabeçalho', () => {
    it('expõe a ordenação atual por aria-sort e ignora a coluna de marcações', async () => {
      await montar();

      const cabecalhos = Array.from(
        fixture.nativeElement.querySelectorAll(
          '.cabecalho [role="columnheader"]',
        ) as NodeListOf<HTMLElement>,
      );

      expect(cabecalhos.filter((c) => c.querySelector('button')).length).toBe(3);
      expect(cabecalhos[0].getAttribute('aria-sort')).toBe('ascending');
      expect(cabecalhos[1].getAttribute('aria-sort')).toBeNull();
    });

    it('ordena ao clicar no cabeçalho', async () => {
      await montar();

      const botao = fixture.nativeElement.querySelector(
        '.cabecalho [role="columnheader"] button',
      ) as HTMLButtonElement;
      botao.click();
      fixture.detectChanges();

      expect(datasVisiveis()[0]).toBe('2026-09-03');
    });
  });
});
