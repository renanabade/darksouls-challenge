import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RunResponse } from '../models';
import { Api, messageOf } from '../services/api';
import { Session } from '../services/session';

@Component({
  selector: 'app-record-run',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="record">
      <h3 class="section-title">Finished it?</h3>
      @if (recorded(); as run) {
        <p>Recorded for {{ run.displayName }}: worth {{ run.score }} points. <a routerLink="/ranking">See the ranking.</a></p>
      } @else if (!signedIn()) {
        <p class="fine"><a routerLink="/account">Sign in</a> to record this run on the ranking.</p>
      } @else {
        <form class="panel form" ngNativeValidate (ngSubmit)="submit()">
          <div class="menu-row">
            <label for="deaths">Deaths</label>
            <input id="deaths" name="deaths" type="number" min="0" required [(ngModel)]="deaths" />
          </div>
          <div class="menu-row">
            <label for="proof">Proof (optional)</label>
            <input id="proof" name="proof" type="url" maxlength="300" placeholder="https://…" [(ngModel)]="proof" />
          </div>
          <div class="form-actions">
            <button class="prompt" type="submit" [disabled]="busy()">{{ busy() ? 'Recording…' : 'I followed every order' }}</button>
          </div>
        </form>
        <p class="fine">It is your word: nobody checks it. Record it only if you broke no order.</p>
      }
      @if (error(); as message) {
        <p class="notice" role="alert">{{ message }}</p>
      }
    </section>
  `,
})
export class RecordRun {
  readonly code = input.required<string>();

  private readonly api = inject(Api);
  private readonly session = inject(Session);

  protected readonly signedIn = computed(() => this.session.tokens() !== null);
  protected readonly busy = signal(false);
  protected readonly deaths = signal(0);
  protected readonly proof = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly recorded = signal<RunResponse | null>(null);

  constructor() {
    // Another challenge, another run.
    effect(() => {
      this.code();
      this.recorded.set(null);
      this.error.set(null);
      this.deaths.set(0);
      this.proof.set('');
    });
  }

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.recorded.set(await this.api.submitRun(this.code(), this.deaths(), this.proof()));
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }
}
