/** Seeded random numbers, so simulations are reproducible in tests and tuning. */
export type Rng = () => number;

/** mulberry32: small, fast, good enough for games. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = (): number => (Math.random() * 2 ** 32) >>> 0;
export const between = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);
export const intBelow = (rng: Rng, n: number): number => Math.floor(rng() * n);
export const pickOne = <T>(rng: Rng, xs: readonly T[]): T => xs[intBelow(rng, xs.length)];
export function shuffle<T>(rng: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = intBelow(rng, i + 1);
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
