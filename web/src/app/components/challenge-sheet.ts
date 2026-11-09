import { Component, ElementRef, input, viewChild } from '@angular/core';
import { ChallengeView } from '../models';
import { Rules } from './rules';

@Component({
  selector: 'app-challenge-sheet',
  imports: [Rules],
  template: `
    @let sheet = view();
    <article class="sheet">
      <header class="infobox">
        <p class="eyebrow">Challenge code</p>
        <h2 class="code" tabindex="-1" #heading>{{ sheet.code }}</h2>
        <table class="settings">
          <tbody>
            <tr><th scope="row">Class</th><td>{{ sheet.startingClass }}</td></tr>
            <tr><th scope="row">Gift</th><td>{{ sheet.gift.length > 0 ? sheet.gift.join(', ') : 'None' }}</td></tr>
            <tr><th scope="row">Difficulty</th><td class="cap">{{ sheet.difficulty }}</td></tr>
            <tr><th scope="row">Length</th><td class="cap">{{ sheet.length }}</td></tr>
            <tr><th scope="row">Curve</th><td class="cap">{{ sheet.curve }}</td></tr>
            <tr><th scope="row">Level cap</th><td>{{ sheet.levelCap }}</td></tr>
          </tbody>
        </table>
      </header>
      <p class="oath">Follow every order. Break one, and the challenge is over: there is no penalty, only the end.</p>

      <section>
        <h3 class="section-title">Rules of the journey</h3>
        <app-rules [items]="sheet.journey" />
      </section>

      @for (chapter of sheet.chapters; track chapter.heading) {
        <section class="chapter">
          <table class="chapter-table">
            <thead>
              <tr>
                <th colspan="2">
                  {{ chapter.heading }}
                  <span class="until">Until {{ chapter.until }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Areas</th>
                <td>
                  @for (area of chapter.areas; track area) {
                    <span class="name">{{ area }}</span>
                  }
                </td>
              </tr>
              @if (chapter.bosses.length > 0) {
                <tr>
                  <th scope="row">Bosses</th>
                  <td>
                    @for (boss of chapter.bosses; track boss) {
                      <span class="name">{{ boss }}</span>
                    }
                  </td>
                </tr>
              }
              <tr><th scope="row">Difficulty</th><td class="cap">{{ chapter.difficulty }}</td></tr>
            </tbody>
          </table>
          <app-rules [items]="chapter.rules" />
        </section>
      }

      @if (sheet.definitions.length > 0) {
        <section>
          <h3 class="section-title">Definitions</h3>
          <dl class="notes">
            @for (definition of sheet.definitions; track definition.term) {
              <div><dt>{{ definition.term }}</dt><dd>{{ definition.text }}</dd></div>
            }
          </dl>
        </section>
      }

      @if (sheet.warnings.length > 0) {
        <section>
          <h3 class="section-title">Before you go</h3>
          <dl class="notes">
            @for (warning of sheet.warnings; track warning.npc) {
              <div><dt>{{ warning.npc }}</dt><dd>{{ warning.text }}</dd></div>
            }
          </dl>
        </section>
      }

      <p class="fine">Generator {{ sheet.generatorVersion }} · data {{ sheet.dataVersion }}. Same code, same challenge.</p>
    </article>
  `,
})
export class ChallengeSheet {
  readonly view = input.required<ChallengeView>();

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  /** Brings the sheet into view, for keyboards and screen readers too. */
  focus(): void {
    this.heading().nativeElement.focus();
  }
}
