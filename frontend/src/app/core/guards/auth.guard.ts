import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role } from '../models/jornada.models';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.autenticado() ? true : router.createUrlTree(['/login']);
};

/**
 * Restrição de rota por papel.
 *
 * É conveniência de navegação — evita oferecer uma tela que o usuário não pode
 * usar. O controle de acesso real está no servidor, que verifica papel e escopo
 * a cada requisição.
 */
export const papelGuard = (papeisPermitidos: Role[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.autenticado()) return router.createUrlTree(['/login']);

    const papel = auth.papel();
    return papel && papeisPermitidos.includes(papel) ? true : router.createUrlTree(['/ponto']);
  };
};
