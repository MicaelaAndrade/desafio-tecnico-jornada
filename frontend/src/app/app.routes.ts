import { Routes } from '@angular/router';
import { authGuard, papelGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Entrar · Jornada',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'ponto',
    title: 'Meu ponto · Jornada',
    canActivate: [authGuard],
    loadComponent: () => import('./features/ponto/ponto.component').then((m) => m.PontoComponent),
  },
  {
    path: 'espelho',
    title: 'Espelho de ponto · Jornada',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/espelho/espelho.component').then((m) => m.EspelhoComponent),
  },
  {
    path: 'equipe',
    title: 'Equipe · Jornada',
    // Restrição de navegação; o controle de acesso real é do servidor.
    canActivate: [papelGuard(['MANAGER', 'HR'])],
    loadComponent: () =>
      import('./features/equipe/equipe.component').then((m) => m.EquipeComponent),
  },
  {
    path: 'correcoes',
    title: 'Correções · Jornada',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/correcoes/correcoes.component').then((m) => m.CorrecoesComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'ponto' },
  { path: '**', redirectTo: 'ponto' },
];
