import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Anexa o token às chamadas da API e traduz falhas em mensagem visível.
 *
 * Um 401 derruba a sessão local: o token expirou ou foi invalidado no servidor
 * (desligamento, mudança de papel), e insistir com ele só produziria mais erros.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const snackBar = inject(MatSnackBar);

  const token = auth.token;
  const requisicao =
    token && req.url.startsWith('/api')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(requisicao).pipe(
    catchError((erro: HttpErrorResponse) => {
      if (erro.status === 401 && !req.url.includes('/auth/login')) {
        auth.logout();
        snackBar.open('Sua sessão expirou. Entre novamente.', 'Fechar', { duration: 5000 });
      } else if (erro.status !== 401) {
        snackBar.open(mensagemDeErro(erro), 'Fechar', { duration: 6000 });
      }

      return throwError(() => erro);
    }),
  );
};

function mensagemDeErro(erro: HttpErrorResponse): string {
  const mensagem = erro.error?.message;

  if (Array.isArray(mensagem)) return mensagem.join(' ');
  if (typeof mensagem === 'string') return mensagem;
  if (erro.status === 0) return 'Não foi possível falar com o servidor.';

  return 'Ocorreu um erro inesperado.';
}
