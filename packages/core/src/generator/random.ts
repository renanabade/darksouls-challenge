/**
 * A seeded pseudo-random generator, so that the same seed always gives the same challenge on every
 * machine (Math.random cannot be seeded). sfc32 (Chris Doty-Humphrey's Small Fast Counter), seeded by
 * four salted FNV-1a hashes of the seed text.
 */
export class Random {
  #a: number;
  #b: number;
  #c: number;
  #d: number;

  constructor(seed: string) {
    [this.#a, this.#b, this.#c, this.#d] = [1, 2, 3, 4].map((salt) =>
      fnv1a(`${String(salt)}:${seed}`),
    ) as [number, number, number, number];
    for (let i = 0; i < 15; i++) this.next(); // mix the state before use
  }

  /** A float in [0, 1). */
  next(): number {
    const t = (((this.#a + this.#b) | 0) + this.#d) | 0;
    this.#d = (this.#d + 1) | 0;
    this.#a = this.#b ^ (this.#b >>> 9);
    this.#b = (this.#c + (this.#c << 3)) | 0;
    this.#c = (this.#c << 21) | (this.#c >>> 11);
    this.#c = (this.#c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(list: readonly T[]): T {
    const item = list[Math.floor(this.next() * list.length)];
    if (item === undefined) throw new RangeError("pick from an empty list");
    return item;
  }

  /** A shuffled copy (Fisher-Yates). Sort the input first: its order is part of the result. */
  shuffle<T>(list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /**
   * A shuffled copy where items of larger weight tend to come first (Efraimidis–Spirakis: each item gets
   * the key u^(1/weight) and the list is sorted by key, descending). Weights must be positive.
   */
  weightedShuffle<T>(list: readonly T[], weight: (item: T) => number): T[] {
    return list
      .map((item) => ({ item, key: this.next() ** (1 / weight(item)) }))
      .sort((a, b) => b.key - a.key)
      .map((k) => k.item);
  }
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
