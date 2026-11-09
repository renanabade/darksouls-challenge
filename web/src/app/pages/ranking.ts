import { Component, inject, signal } from '@angular/core';
import { RankingPage } from '../models';
import { Api, messageOf } from '../services/api';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-ranking',
  template: `
    <h2 class="page-title">Ranking</h2>
    <p class="oath">Runs are the players' own word: nobody checks them. A harder challenge is worth more.</p>

    @if (error(); as message) {
      <p class="notice" role="alert">{{ message }}</p>
    } @else if (page(); as shown) {
      @if (shown.total === 0) {
        <p class="fine">Nobody has recorded a run yet. Be the first.</p>
      } @else {
        <table class="data-table">
          <thead><tr><th>#</th><th>Player</th><th>Score</th><th>Runs</th></tr></thead>
          <tbody>
            @for (entry of shown.entries; track entry.rank) {
              <tr>
                <td>{{ entry.rank }}</td>
                <td class="name">{{ entry.displayName }}</td>
                <td>{{ entry.score }}</td>
                <td>{{ entry.runs }}</td>
              </tr>
            }
          </tbody>
        </table>
        <div class="form-actions">
          <button class="prompt" type="button" [disabled]="shown.offset === 0" (click)="load(shown.offset - pageSize)">Previous</button>
          <button class="prompt" type="button" [disabled]="shown.offset + pageSize >= shown.total" (click)="load(shown.offset + pageSize)">Next</button>
        </div>
      }
    } @else {
      <p class="kindling" role="status">Counting the souls…</p>
    }
  `,
})
export class Ranking {
  private readonly api = inject(Api);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly page = signal<RankingPage | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load(0);
  }

  protected async load(offset: number): Promise<void> {
    try {
      this.page.set(await this.api.ranking(Math.max(0, offset), PAGE_SIZE));
    } catch (error) {
      this.error.set(messageOf(error));
    }
  }
}
