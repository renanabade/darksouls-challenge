import { afterNextRender, Component, DestroyRef, inject, Injector, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { ChallengeSheet } from '../components/challenge-sheet';
import { RecordRun } from '../components/record-run';
import { SetupMenu } from '../components/setup-menu';
import { ChallengeRequest, ChallengeView, SetupOptions } from '../models';
import { Api, messageOf } from '../services/api';

const SITE = 'Dark Souls Challenge';
const COPIED_MILLIS = 2000;

@Component({
  selector: 'app-home',
  imports: [ChallengeSheet, RecordRun, SetupMenu],
  template: `
    @if (options(); as loaded) {
      <app-setup-menu [options]="loaded" [busy]="busy()" (generate)="generate($event)">
        @if (view()) {
          <button type="button" class="prompt" (click)="copyLink()">{{ copied() ? 'Link copied' : 'Copy link' }}</button>
        }
      </app-setup-menu>

      @for (notice of notices(); track notice) {
        <p class="notice" role="alert">{{ notice }}</p>
      }

      @if (view(); as shown) {
        <app-challenge-sheet [view]="shown" />
        <app-record-run [code]="shown.code" />
      }
    } @else {
      <p class="kindling" role="status">{{ loadError() ?? 'Kindling the bonfire…' }}</p>
    }
  `,
})
export class Home {
  private readonly api = inject(Api);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly injector = inject(Injector);
  private readonly destroyed = inject(DestroyRef);
  private readonly sheet = viewChild(ChallengeSheet);

  protected readonly options = signal<SetupOptions | null>(null);
  protected readonly view = signal<ChallengeView | null>(null);
  protected readonly notices = signal<string[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);

  /** This page just moved the address itself, and what it had to say about the old one still stands. */
  private keepNotices = false;

  /** Only the latest request counts: back and forward can overtake one still running. */
  private latest = 0;

  constructor() {
    this.api
      .options()
      .then((options) => this.options.set(options))
      .catch((error: unknown) => this.loadError.set(`The site could not be loaded: ${messageOf(error)}`));

    // Back and forward land here too: the page always shows what its address says.
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyed)).subscribe((query) => void this.showLink(query));
  }

  private async showLink(query: Record<string, string>): Promise<void> {
    const keep = this.keepNotices;
    this.keepNotices = false;

    // The page already shows the challenge this address names.
    if (query['c'] !== undefined && query['c'] === this.view()?.code) {
      if (!keep) this.notices.set([]);
      return;
    }

    const ticket = ++this.latest;
    if (Object.keys(query).length > 0) this.busy.set(true);
    try {
      const preview = await this.api.previewOfLink(query);
      if (ticket !== this.latest) return;
      this.notices.set(preview.notices);
      this.show(preview.view ?? null);

      // A link in any other form becomes the one link of this challenge.
      if (preview.code && (query['c'] !== preview.code || Object.keys(query).length > 1)) {
        this.keepNotices = true;
        await this.router.navigate([], { queryParams: { c: preview.code }, replaceUrl: true });
      }
    } catch (error) {
      if (ticket === this.latest) this.notices.set([messageOf(error)]);
    } finally {
      if (ticket === this.latest) this.busy.set(false);
    }
  }

  protected async generate(request: ChallengeRequest): Promise<void> {
    const ticket = ++this.latest;
    this.notices.set([]);
    this.busy.set(true);
    try {
      const preview = await this.api.previewOfForm(request);
      if (ticket !== this.latest) return;
      this.notices.set(preview.notices);
      if (!preview.view) return;
      const again = preview.code === this.view()?.code;
      this.show(preview.view);
      if (again) return;

      // A history entry per challenge, so back and forward walk through them.
      this.keepNotices = true;
      await this.router.navigate([], { queryParams: { c: preview.code } });
    } catch (error) {
      if (ticket === this.latest) this.notices.set([messageOf(error)]);
    } finally {
      if (ticket === this.latest) this.busy.set(false);
    }
  }

  private show(view: ChallengeView | null): void {
    this.view.set(view);
    this.title.setTitle(view ? `${view.code} · ${SITE}` : SITE);
    if (view) afterNextRender(() => this.sheet()?.focus(), { injector: this.injector });
  }

  protected async copyLink(): Promise<void> {
    await navigator.clipboard.writeText(location.href);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), COPIED_MILLIS);
  }
}
