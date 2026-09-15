import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Role } from '../models/jornada.models';
import { AuthService } from '../services/auth.service';
import { authGuard, papelGuard } from './auth.guard';

describe('guards de rota', () => {
  const rota = {} as ActivatedRouteSnapshot;
  const estado = {} as RouterStateSnapshot;

  function configurar(autenticado: boolean, papel: Role | null = null): Router {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { autenticado: () => autenticado, papel: () => papel },
        },
      ],
    });

    return TestBed.inject(Router);
  }

  function destino(resultado: boolean | UrlTree, router: Router): string | true {
    return resultado === true ? true : router.serializeUrl(resultado as UrlTree);
  }

  describe('authGuard', () => {
    it('libera usuário autenticado', () => {
      const router = configurar(true, 'EMPLOYEE');
      const resultado = TestBed.runInInjectionContext(() => authGuard(rota, estado));

      expect(destino(resultado as boolean | UrlTree, router)).toBe(true);
    });

    it('manda para o login quem não tem sessão', () => {
      const router = configurar(false);
      const resultado = TestBed.runInInjectionContext(() => authGuard(rota, estado));

      expect(destino(resultado as boolean | UrlTree, router)).toBe('/login');
    });
  });

  describe('papelGuard', () => {
    it('libera o papel permitido', () => {
      const router = configurar(true, 'MANAGER');
      const guard = papelGuard(['MANAGER', 'HR']);
      const resultado = TestBed.runInInjectionContext(() => guard(rota, estado));

      expect(destino(resultado as boolean | UrlTree, router)).toBe(true);
    });

    it('devolve o colaborador à tela de ponto em vez de deixá-lo numa tela inútil', () => {
      const router = configurar(true, 'EMPLOYEE');
      const guard = papelGuard(['MANAGER', 'HR']);
      const resultado = TestBed.runInInjectionContext(() => guard(rota, estado));

      expect(destino(resultado as boolean | UrlTree, router)).toBe('/ponto');
    });

    it('manda para o login quando não há sessão, mesmo com papel exigido', () => {
      const router = configurar(false);
      const guard = papelGuard(['HR']);
      const resultado = TestBed.runInInjectionContext(() => guard(rota, estado));

      expect(destino(resultado as boolean | UrlTree, router)).toBe('/login');
    });
  });
});
