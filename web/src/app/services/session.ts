import { Injectable, signal } from '@angular/core';
import { Tokens } from '../models';

const TOKENS_KEY = 'tokens';

/** Who is signed in. The tokens stay in the browser's localStorage, so a player stays signed in between visits. */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly stored = signal<Tokens | null>(Session.restore());

  readonly tokens = this.stored.asReadonly();

  keep(tokens: Tokens | null): void {
    this.stored.set(tokens);
    if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }));
    else localStorage.removeItem(TOKENS_KEY);
  }

  private static restore(): Tokens | null {
    const stored = localStorage.getItem(TOKENS_KEY);
    if (stored === null) return null;
    try {
      return JSON.parse(stored) as Tokens;
    } catch {
      localStorage.removeItem(TOKENS_KEY);
      return null;
    }
  }
}
