import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  function configurar(token: string | null): void {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['logout'], { token });
    snackBar = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  }

  afterEach(() => controller.verify());

  it('anexa o token às chamadas da API', () => {
    configurar('token-de-teste');
    http.get('/api/time-entries').subscribe();

    const requisicao = controller.expectOne('/api/time-entries');
    expect(requisicao.request.headers.get('Authorization')).toBe('Bearer token-de-teste');
  });

  it('não vaza o token para destinos fora da API', () => {
    configurar('token-de-teste');
    http.get('https://exemplo.externo/dados').subscribe();

    const requisicao = controller.expectOne('https://exemplo.externo/dados');
    expect(requisicao.request.headers.has('Authorization')).toBe(false);
  });

  it('não envia cabeçalho quando não há sessão', () => {
    configurar(null);
    http.get('/api/time-entries').subscribe();

    const requisicao = controller.expectOne('/api/time-entries');
    expect(requisicao.request.headers.has('Authorization')).toBe(false);
  });

  it('encerra a sessão quando o servidor recusa o token', () => {
    configurar('token-expirado');
    http.get('/api/time-entries').subscribe({ error: () => undefined });

    controller
      .expectOne('/api/time-entries')
      .flush({ message: 'Sessão inválida.' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).toHaveBeenCalled();
  });

  it('não desloga por falha de login — ali o 401 é credencial errada', () => {
    configurar(null);
    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });

    controller
      .expectOne('/api/auth/login')
      .flush({ message: 'Credenciais inválidas.' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('mostra a mensagem devolvida pelo servidor em outros erros', () => {
    configurar('token-de-teste');
    http.post('/api/time-entries', {}).subscribe({ error: () => undefined });

    controller
      .expectOne('/api/time-entries')
      .flush(
        { message: 'A competência 09/2026 está fechada.' },
        { status: 409, statusText: 'Conflict' },
      );

    expect(snackBar.open).toHaveBeenCalledWith(
      'A competência 09/2026 está fechada.',
      'Fechar',
      jasmine.anything(),
    );
  });
});
