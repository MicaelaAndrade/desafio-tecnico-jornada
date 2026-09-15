import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser, LoginResponse, Role } from '../models/jornada.models';

const CHAVE_TOKEN = 'jornada.token';
const CHAVE_USUARIO = 'jornada.usuario';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly usuarioAtual = signal<AuthenticatedUser | null>(this.carregarSessao());

  readonly usuario = this.usuarioAtual.asReadonly();
  readonly autenticado = computed(() => this.usuarioAtual() !== null);
  readonly papel = computed<Role | null>(() => this.usuarioAtual()?.role ?? null);
  readonly ehGestor = computed(() => ['MANAGER', 'HR'].includes(this.papel() ?? ''));
  readonly ehRh = computed(() => this.papel() === 'HR');

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap((resposta) => {
        localStorage.setItem(CHAVE_TOKEN, resposta.accessToken);
        localStorage.setItem(CHAVE_USUARIO, JSON.stringify(resposta.user));
        this.usuarioAtual.set(resposta.user);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
    this.usuarioAtual.set(null);
    void this.router.navigate(['/login']);
  }

  get token(): string | null {
    return localStorage.getItem(CHAVE_TOKEN);
  }

  /**
   * A sessão é reidratada do localStorage para que um refresh da página não
   * derrube o usuário. O token continua sendo validado pelo servidor a cada
   * requisição — isto aqui é conveniência de navegação, não controle de acesso.
   */
  private carregarSessao(): AuthenticatedUser | null {
    const bruto = localStorage.getItem(CHAVE_USUARIO);
    if (!bruto) return null;

    try {
      return JSON.parse(bruto) as AuthenticatedUser;
    } catch {
      localStorage.removeItem(CHAVE_USUARIO);
      return null;
    }
  }
}
