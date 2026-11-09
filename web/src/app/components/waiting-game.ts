import { afterNextRender, Component, DestroyRef, ElementRef, inject, input, viewChild } from '@angular/core';

/** The world, in its own units: the canvas scales it to whatever width the page gives it. */
const WIDTH = 640;
const HEIGHT = 160;
const GROUND = 132;
const GRAVITY = 1800;
const JUMP = 540;
const START_SPEED = 260;
const SPEED_GAIN = 6;
const SOUL_POINTS = 10;
const BEST_KEY = 'waiting-game-best';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Flame extends Box {
  flicker: number;
}

type State = 'ready' | 'running' | 'over';

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function keepBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // A private window keeps no best: the game still plays.
  }
}

/**
 * Something to do while the server wakes up or a challenge is generated: a knight runs through flames and gathers souls. Space, the
 * up arrow, a click or a tap jumps. It only moves once the player starts it.
 */
@Component({
  selector: 'app-waiting-game',
  template: `
    <figure class="waiting">
      <figcaption role="status">{{ message() }}</figcaption>
      <canvas
        #canvas
        tabindex="0"
        aria-label="A small game while you wait: press Space or tap to jump over the flames and gather souls."
        (pointerdown)="press($event)"
        (keydown)="key($event)"
      ></canvas>
    </figure>
  `,
})
export class WaitingGame {
  /** What the page is waiting for, shown above the game. */
  readonly message = input('The bonfire is being kindled…');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private context: CanvasRenderingContext2D | null = null;
  private frame = 0;
  private last = 0;

  private state: State = 'ready';
  private hero = { x: 64, y: GROUND - 30, w: 18, h: 30, velocity: 0 };
  private flames: Flame[] = [];
  private souls: Box[] = [];
  private speed = START_SPEED;
  private distance = 0;
  private gathered = 0;
  private untilFlame = 0;
  private untilSoul = 0;
  private best = readBest();
  private ink = { text: '#d9d4c7', dim: '#8f887a', gold: '#c8b07a', ember: '#a8432a', line: '#3a352d' };

  constructor() {
    afterNextRender(() => {
      const canvas = this.canvas().nativeElement;
      const scale = window.devicePixelRatio || 1;
      canvas.width = WIDTH * scale;
      canvas.height = HEIGHT * scale;
      this.context = canvas.getContext('2d');
      this.context?.scale(scale, scale);

      const style = getComputedStyle(canvas);
      const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
      this.ink = {
        text: token('--text', this.ink.text),
        dim: token('--dim', this.ink.dim),
        gold: token('--gold', this.ink.gold),
        ember: token('--ember', this.ink.ember),
        line: token('--line', this.ink.line),
      };
      this.draw();
    });

    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  protected key(event: KeyboardEvent): void {
    if (event.key !== ' ' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    this.jump();
  }

  protected press(event: PointerEvent): void {
    event.preventDefault();
    this.canvas().nativeElement.focus();
    this.jump();
  }

  private jump(): void {
    if (this.state !== 'running') {
      this.begin();
      return;
    }

    if (this.hero.y >= GROUND - this.hero.h) this.hero.velocity = -JUMP;
  }

  private begin(): void {
    this.state = 'running';
    this.hero.y = GROUND - this.hero.h;
    this.hero.velocity = 0;
    this.flames = [];
    this.souls = [];
    this.speed = START_SPEED;
    this.distance = 0;
    this.gathered = 0;
    this.untilFlame = 0.8;
    this.untilSoul = 1.5;
    this.last = performance.now();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private get score(): number {
    return Math.floor(this.distance / 10) + this.gathered * SOUL_POINTS;
  }

  private tick(now: number): void {
    // A tab in the background sends no frames: the gap must not throw everything forward.
    const seconds = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.step(seconds);
    this.draw();
    if (this.state === 'running') this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  private step(seconds: number): void {
    this.speed += SPEED_GAIN * seconds;
    this.distance += this.speed * seconds;

    const hero = this.hero;
    hero.velocity += GRAVITY * seconds;
    hero.y = Math.min(hero.y + hero.velocity * seconds, GROUND - hero.h);
    if (hero.y === GROUND - hero.h) hero.velocity = 0;

    for (const thing of [...this.flames, ...this.souls]) thing.x -= this.speed * seconds;
    this.flames = this.flames.filter((flame) => flame.x + flame.w > 0);
    this.souls = this.souls.filter((soul) => soul.x + soul.w > 0);

    this.untilFlame -= seconds;
    if (this.untilFlame <= 0) {
      const h = 16 + Math.random() * 18;
      const w = 12 + Math.random() * 14;
      this.flames.push({ x: WIDTH, y: GROUND - h, w, h, flicker: Math.random() * Math.PI * 2 });
      // Faster runs get the flames closer, but never closer than a jump can clear.
      this.untilFlame = Math.max(0.55, 1.4 - this.speed / 600) + Math.random() * 0.9;
    }

    this.untilSoul -= seconds;
    if (this.untilSoul <= 0) {
      this.souls.push({ x: WIDTH, y: GROUND - 70 - Math.random() * 30, w: 10, h: 10 });
      this.untilSoul = 1.2 + Math.random() * 2;
    }

    // The hit box is a little smaller than the knight: a graze is not a death.
    const body = { x: hero.x + 3, y: hero.y + 3, w: hero.w - 6, h: hero.h - 3 };
    const before = this.souls.length;
    this.souls = this.souls.filter((soul) => !overlaps(body, soul));
    this.gathered += before - this.souls.length;

    if (this.flames.some((flame) => overlaps(body, { x: flame.x + 2, y: flame.y + 4, w: flame.w - 4, h: flame.h - 4 }))) {
      this.state = 'over';
      if (this.score > this.best) {
        this.best = this.score;
        keepBest(this.best);
      }
    }
  }

  private draw(): void {
    const c = this.context;
    if (!c) return;
    const ink = this.ink;
    c.clearRect(0, 0, WIDTH, HEIGHT);

    c.strokeStyle = ink.line;
    c.beginPath();
    c.moveTo(0, GROUND + 0.5);
    c.lineTo(WIDTH, GROUND + 0.5);
    c.stroke();

    for (const soul of this.souls) {
      c.fillStyle = ink.gold;
      c.beginPath();
      c.arc(soul.x + soul.w / 2, soul.y + soul.h / 2, soul.w / 2, 0, Math.PI * 2);
      c.fill();
    }

    for (const flame of this.flames) {
      const sway = Math.sin(this.distance / 20 + flame.flicker) * 3;
      c.fillStyle = ink.ember;
      c.beginPath();
      c.moveTo(flame.x, GROUND);
      c.quadraticCurveTo(flame.x + sway, flame.y + flame.h / 2, flame.x + flame.w / 2 + sway, flame.y);
      c.quadraticCurveTo(flame.x + flame.w - sway, flame.y + flame.h / 2, flame.x + flame.w, GROUND);
      c.fill();
    }

    this.drawKnight(c);

    c.fillStyle = ink.dim;
    c.font = '15px "EB Garamond", Georgia, serif';
    c.textAlign = 'right';
    c.fillText(`Best ${this.best}   ${this.score}`, WIDTH - 12, 22);

    c.textAlign = 'center';
    c.fillStyle = ink.text;
    if (this.state === 'ready') c.fillText('Press Space or tap to run', WIDTH / 2, 64);
    if (this.state === 'over') c.fillText('Burnt to ashes. Press Space or tap to rise again', WIDTH / 2, 64);
  }

  private drawKnight(c: CanvasRenderingContext2D): void {
    const { x, y, w, h } = this.hero;
    const stride = this.state === 'running' && y >= GROUND - h ? Math.floor(this.distance / 18) % 2 : 0;
    c.fillStyle = this.ink.text;
    // Legs, in two strides.
    c.fillRect(x + 3 + stride * 2, y + h - 8, 4, 8);
    c.fillRect(x + w - 7 - stride * 2, y + h - 8, 4, 8);
    // Body and helm, with a slit for the eyes.
    c.fillRect(x + 2, y + 9, w - 4, h - 16);
    c.fillRect(x + 4, y, w - 8, 10);
    c.fillStyle = this.ink.line;
    c.fillRect(x + 8, y + 4, w - 10, 2);
    // A shield on the arm, and a sword held forward.
    c.fillStyle = this.ink.dim;
    c.fillRect(x - 2, y + 11, 5, 11);
    c.fillStyle = this.ink.gold;
    c.fillRect(x + w - 2, y + 14, 10, 2);
  }
}
