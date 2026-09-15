import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginResponse } from '../models/jornada.models';
import { AuthService } from './auth.service';

const RESPOSTA_LOGIN: LoginResponse = {
  accessToken: 'token-de-teste',
  user: {
    id: 'u-1',
    name: 'Ana Souza',
    email: 'ana.souza@ddgroup.example',
    role: 'EMPLOYEE',
    baseTimezone: 'America/Sao_Paulo',
    countryCode: 'BR',
    expectedDailyMinutes: 480,
  },
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    localStorage.clear();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });

    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  function autenticar(resposta: LoginResponse = RESPOSTA_LOGIN): void {
    service.login(resposta.user.email, 'jornada123').subscribe();
    http.expectOne('/api/auth/login').flush(resposta);
  }

  it('começa sem sessão', () => {
    expect(service.autenticado()).toBe(false);
    expect(service.usuario()).toBeNull();
  });

  it('guarda token e usuário após autenticar', () => {
    autenticar();

    expect(service.autenticado()).toBe(true);
    expect(service.usuario()?.name).toBe('Ana Souza');
    expect(service.token).toBe('token-de-teste');
  });

  it('descarta a sessão e redireciona ao sair', () => {
    autenticar();
    service.logout();

    expect(service.autenticado()).toBe(false);
    expect(service.token).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('reconhece perfis com escopo de gestão', () => {
    autenticar({
      ...RESPOSTA_LOGIN,
      user: { ...RESPOSTA_LOGIN.user, role: 'MANAGER' },
    });

    expect(service.ehGestor()).toBe(true);
    expect(service.ehRh()).toBe(false);
  });

  it('não concede escopo de gestão a colaborador', () => {
    autenticar();

    expect(service.ehGestor()).toBe(false);
    expect(service.ehRh()).toBe(false);
  });

  it('descarta sessão corrompida no armazenamento em vez de quebrar', () => {
    localStorage.setItem('jornada.usuario', '{isto não é json');

    // Uma instância nova lê o armazenamento durante a construção.
    const novo = TestBed.runInInjectionContext(() => new AuthService());

    expect(novo.autenticado()).toBe(false);
    expect(localStorage.getItem('jornada.usuario')).toBeNull();
  });
});
