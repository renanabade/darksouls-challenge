import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, Observable, shareReplay, switchMap, tap, throwError, finalize } from 'rxjs';
import { Tokens } from '../models';
import { Session } from './session';

/** Marks the call that renews the tokens, so it is never renewed itself. */
const RENEWING = new HttpContextToken<boolean>(() => false);

/** Only what is personal carries the token: a public call must not fail because a token has expired. */
const PERSONAL = /\/?api\/(me|runs)(\/|$)/;

/** One renewal at a time: several calls that fail together share it. */
let renewal: Observable<Tokens> | null = null;

function withToken(request: HttpRequest<unknown>, tokens: Tokens): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } });
}

/** Sends with the access token, and once more with a fresh one if it has expired. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);
  const http = inject(HttpClient);
  const tokens = session.tokens();
  if (!tokens || !PERSONAL.test(request.url) || request.context.get(RENEWING)) return next(request);

  return next(withToken(request, tokens)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      renewal ??= http
        .post<Tokens>('api/auth/refresh', { refreshToken: tokens.refreshToken }, { context: new HttpContext().set(RENEWING, true) })
        .pipe(
          tap((fresh) => session.keep(fresh)),
          finalize(() => (renewal = null)),
          shareReplay(1),
        );

      return renewal.pipe(
        catchError(() => {
          session.keep(null);
          return throwError(() => new Error('You have been signed out. Sign in again.'));
        }),
        switchMap((fresh) => next(withToken(request, fresh))),
      );
    }),
  );
};
