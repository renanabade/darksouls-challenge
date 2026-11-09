import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProfileResponse, RunResponse } from '../models';
import { Api, messageOf } from '../services/api';
import { Session } from '../services/session';

@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink],
  template: `
    <h2 class="page-title">Account</h2>

    @if (error(); as message) {
      <p class="notice" role="alert">{{ message }}</p>
    }

    @if (loading()) {
      <p class="kindling" role="status">Reading the covenant…</p>
    } @else if (profile(); as signedIn) {
      <form class="panel form" ngNativeValidate (ngSubmit)="saveName()">
        <div class="menu-row">
          <span class="field-label">Email</span>
          <span>{{ signedIn.email }}</span>
        </div>
        <div class="menu-row">
          <label for="name">Display name</label>
          <input id="name" name="name" maxlength="32" autocomplete="nickname" placeholder="What the ranking shows" [(ngModel)]="name" />
        </div>
        <div class="form-actions">
          <button class="prompt" type="submit" [disabled]="busy()">Save name</button>
          <button class="prompt" type="button" [disabled]="busy()" (click)="signOut()">Sign out</button>
        </div>
      </form>

      @if (saved()) {
        <p class="fine saved" role="status">Saved.</p>
      }

      <h3 class="section-title">Your runs</h3>
      @if (runs().length === 0) {
        <p class="fine">None yet. Finish a challenge, then record it on its page.</p>
      } @else {
        <table class="data-table">
          <thead><tr><th>Challenge</th><th>Score</th><th>Deaths</th><th></th></tr></thead>
          <tbody>
            @for (run of runs(); track run.challengeId) {
              <tr>
                <td><a class="name" routerLink="/" [queryParams]="{ c: run.code }">{{ run.code }}</a></td>
                <td>{{ run.score }}</td>
                <td>{{ run.deaths }}</td>
                <td><button type="button" class="link-button" [disabled]="busy()" (click)="remove(run.challengeId)">Remove</button></td>
              </tr>
            }
          </tbody>
        </table>
      }
    } @else {
      <form class="panel form" ngNativeValidate (ngSubmit)="signIn()">
        <div class="menu-row">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" required [(ngModel)]="email" />
        </div>
        <div class="menu-row">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required [(ngModel)]="password" />
        </div>
        <div class="form-actions">
          <button class="prompt" type="submit" [disabled]="busy()">Sign in</button>
          <button class="prompt" type="button" [disabled]="busy()" (click)="register()">Create account</button>
        </div>
      </form>
      <p class="fine">Passwords need at least 6 characters, with an upper-case letter, a lower-case letter, a digit and a symbol. Your email is never shown to anyone. No email is sent yet, so a forgotten password cannot be recovered.</p>
    }
  `,
})
export class Account {
  private readonly api = inject(Api);
  private readonly session = inject(Session);

  protected readonly profile = signal<ProfileResponse | null>(null);
  protected readonly runs = signal<RunResponse[]>([]);
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly name = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);

  constructor() {
    void this.run(() => this.load()).finally(() => this.loading.set(false));
  }

  private async load(): Promise<void> {
    this.profile.set(null);
    if (this.session.tokens() === null) return;
    const profile = await this.api.profile();
    this.profile.set(profile);
    this.name.set(profile.displayName ?? '');
    this.runs.set(await this.api.myRuns());
  }

  protected signIn(): Promise<void> {
    return this.run(async () => {
      await this.api.signIn(this.email().trim(), this.password());
      this.password.set('');
      await this.load();
    });
  }

  protected register(): Promise<void> {
    return this.run(async () => {
      await this.api.register(this.email().trim(), this.password());
      this.password.set('');
      await this.load();
    });
  }

  protected saveName(): Promise<void> {
    return this.run(async () => {
      this.profile.set(await this.api.setDisplayName(this.name()));
      this.saved.set(true);
    });
  }

  protected signOut(): Promise<void> {
    return this.run(async () => {
      this.api.signOut();
      this.profile.set(null);
      this.runs.set([]);
    });
  }

  protected remove(challengeId: string): Promise<void> {
    return this.run(async () => {
      await this.api.deleteRun(challengeId);
      this.runs.set(await this.api.myRuns());
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.saved.set(false);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }
}
