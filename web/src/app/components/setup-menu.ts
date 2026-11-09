import { NgTemplateOutlet, TitleCasePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChallengeRequest, Curve, Difficulty, Length, SetupOptions } from '../models';

/** The highest level cap a code can hold. The game's own is 713. */
const MAX_LEVEL_CAP = 713;

/** The longest code stored. */
const MAX_CODE_LENGTH = 64;

type Field = 'class' | 'gift' | 'difficulty' | 'length' | 'curve' | 'cap' | 'code';

@Component({
  selector: 'app-setup-menu',
  imports: [FormsModule, NgTemplateOutlet, TitleCasePipe],
  template: `
    <form class="menu" ngNativeValidate (ngSubmit)="submit()">
      <div class="panel menu-list">
        <div class="menu-row" (focusin)="focused.set('class')">
          <label for="class">Class</label>
          <select id="class" name="class" [(ngModel)]="startingClass">
            <option value="">Drawn by the seed</option>
            @for (option of options().classes; track option.name) {
              <option [value]="option.name">{{ option.name }}</option>
            }
          </select>
        </div>
        <div class="menu-row" (focusin)="focused.set('gift')">
          <label for="gift">Gift</label>
          <select id="gift" name="gift" [(ngModel)]="gift">
            <option value="">Drawn by the seed</option>
            @for (option of options().gifts; track option.row) {
              <option [value]="option.row">{{ option.label }}</option>
            }
          </select>
        </div>
        <div class="menu-row" (focusin)="focused.set('difficulty')">
          <label for="difficulty">Difficulty</label>
          <select id="difficulty" name="difficulty" [(ngModel)]="difficulty">
            @for (option of options().difficulties; track option) {
              <option [value]="option">{{ option | titlecase }}</option>
            }
          </select>
        </div>
        <div class="menu-row" (focusin)="focused.set('length')">
          <label for="length">Length</label>
          <select id="length" name="length" [(ngModel)]="length">
            @for (option of options().lengths; track option) {
              <option [value]="option">{{ option | titlecase }}</option>
            }
          </select>
        </div>
        <div class="menu-row" (focusin)="focused.set('curve')">
          <label for="curve">Curve</label>
          <select id="curve" name="curve" [(ngModel)]="curve">
            <option value="">Drawn by the seed</option>
            @for (option of options().curves; track option) {
              <option [value]="option">{{ option | titlecase }}</option>
            }
          </select>
        </div>
        <div class="menu-row" (focusin)="focused.set('cap')">
          <label for="cap">Level cap</label>
          <input id="cap" name="cap" type="number" min="1" [max]="maxLevelCap" placeholder="Drawn by the seed" [(ngModel)]="levelCap" />
        </div>
        <div class="menu-row" (focusin)="focused.set('code')">
          <label for="code">Challenge code</label>
          <input id="code" name="code" [maxLength]="maxCodeLength" placeholder="Optional" spellcheck="false" autocomplete="off" [(ngModel)]="code" />
        </div>
      </div>
      <aside class="panel menu-help only-wide" aria-live="polite">
        <ng-container [ngTemplateOutlet]="help" />
      </aside>
      <details class="panel menu-help only-narrow">
        <summary>What this means</summary>
        <ng-container [ngTemplateOutlet]="help" />
      </details>
      <div class="actions">
        <button class="prompt" type="submit" [disabled]="busy()">{{ busy() ? 'Generating…' : 'Generate' }}</button>
        <ng-content />
      </div>
    </form>

    <ng-template #help>
      <h3>{{ helpTitle() }}</h3>
      @switch (focused()) {
        @case ('class') {
          @if (chosenClass(); as chosen) {
            <dl class="stats">
              <div><dt>Level</dt><dd>{{ chosen.level }}</dd></div>
              <div><dt>Strength</dt><dd>{{ chosen.stats.strength }}</dd></div>
              <div><dt>Dexterity</dt><dd>{{ chosen.stats.dexterity }}</dd></div>
              <div><dt>Intelligence</dt><dd>{{ chosen.stats.intelligence }}</dd></div>
              <div><dt>Faith</dt><dd>{{ chosen.stats.faith }}</dd></div>
              <div><dt>Attunement</dt><dd>{{ chosen.stats.attunement }}</dd></div>
            </dl>
          } @else {
            <p>The seed picks one of the {{ options().classes.length }} classes.</p>
          }
        }
        @case ('gift') {
          <p>{{ gift() ? 'What you carry from the start.' : 'The seed picks the gift you start with.' }}</p>
        }
        @case ('difficulty') {
          @switch (difficulty()) {
            @case ('easy') {
              <p>Light rules and a generous level cap. For a first replay.</p>
            }
            @case ('medium') {
              <p>Rules that change how you play, without asking for perfection.</p>
            }
            @case ('hard') {
              <p>Heavy rules and a low level cap. For players who know the game well.</p>
            }
            @default {
              <p>The heaviest rules, a level cap near the class's own. Expect to fail.</p>
            }
          }
        }
        @case ('length') {
          @switch (length()) {
            @case ('short') {
              <p>Four acts and a handful of rules.</p>
            }
            @case ('full') {
              <p>Nine chapters, each with its own rules.</p>
            }
            @default {
              <p>Nine chapters with rules for every stretch of the run.</p>
            }
          }
        }
        @case ('curve') {
          <p>How difficulty moves across the chapters. The difficulty you chose is the level it moves around.</p>
        }
        @case ('cap') {
          <p>The highest soul level of the run. Never below your class's own.</p>
        }
        @default {
          <p>Paste a code to play exactly that challenge: it overrides everything above. Leave it empty for a new challenge.</p>
        }
      }
    </ng-template>
  `,
})
export class SetupMenu {
  readonly options = input.required<SetupOptions>();
  readonly busy = input(false);
  readonly generate = output<ChallengeRequest>();

  protected readonly maxLevelCap = MAX_LEVEL_CAP;
  protected readonly maxCodeLength = MAX_CODE_LENGTH;

  protected readonly focused = signal<Field>('class');

  // What the form holds. An empty value is drawn by the seed.
  protected readonly startingClass = signal('');
  protected readonly gift = signal('');
  protected readonly difficulty = signal<Difficulty>('medium');
  protected readonly length = signal<Length>('full');
  protected readonly curve = signal<Curve | ''>('');
  protected readonly levelCap = signal<number | null>(null);
  protected readonly code = signal('');

  protected readonly chosenClass = computed(() => this.options().classes.find((c) => c.name === this.startingClass()));

  protected readonly helpTitle = computed(() => {
    const drawn = 'Drawn by the seed';
    switch (this.focused()) {
      case 'class':
        return this.chosenClass()?.name ?? drawn;
      case 'gift':
        return this.options().gifts.find((g) => String(g.row) === this.gift())?.label ?? drawn;
      case 'difficulty':
        return capitalized(this.difficulty());
      case 'length':
        return capitalized(this.length());
      case 'curve':
        return this.curve() || drawn;
      case 'cap':
        return 'Soul level cap';
      default:
        return 'Challenge code';
    }
  });

  protected submit(): void {
    const typed = this.code().trim();
    this.code.set('');
    if (typed.length > 0) {
      this.generate.emit({ code: typed });
      return;
    }

    this.generate.emit({
      difficulty: this.difficulty(),
      length: this.length(),
      curve: this.curve() || undefined,
      startingClass: this.startingClass() || undefined,
      giftRow: this.gift() ? Number(this.gift()) : undefined,
      levelCap: this.levelCap() ?? undefined,
    });
  }
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
