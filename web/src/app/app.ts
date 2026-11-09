import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="page">
      <header class="title">
        <h1><a routerLink="/">Dark Souls Challenge</a></h1>
        <p class="tagline">A manual of orders for your next run. Every challenge can be beaten.</p>
        <nav class="nav">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Challenge</a>
          <a routerLink="/ranking" routerLinkActive="active">Ranking</a>
          <a routerLink="/account" routerLinkActive="active">Account</a>
        </nav>
      </header>
      <main>
        <router-outlet />
      </main>
      <footer class="footer">
        A fan project, not affiliated with FromSoftware or Bandai Namco. It never modifies the game, and uses none of its art.
        <a href="https://github.com/renanabade/darksouls-challenge">Source</a>
      </footer>
    </div>
  `,
})
export class App {}
