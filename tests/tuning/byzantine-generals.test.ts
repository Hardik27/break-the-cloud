/** Difficulty tuning for Byzantine Generals (decision puzzle; time modelled per decision). */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as bz from '../../src/games/byzantine-generals/sim';
import { median, report } from './util';

describe('Byzantine Generals difficulty', () => {
  it('each task takes 10–40 s; naive strategies fail', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const time = (clicks: number, lo: number, hi: number) => median(seeds.map((s) => {
      const rng = mulberry32(s);
      let ms = 3000;
      for (let k = 0; k < clicks; k++) ms += between(rng, lo, hi);
      return ms;
    })) / 1000;
    const t2 = time(3 + 2 + 2, 1500, 2800); // round 1: 2 picks + send; rounds 2–3: pick + send
    const t3 = time(bz.ROUNDS2.length * 2, 1800, 3000);
    const t4 = time(8, 1500, 3000); // toggle traitors, run a few times, answer twice
    // Wrong strategies: an honest traitor (sends the truth); a lieutenant that trusts the commander.
    const honest = bz.ROUNDS1.filter((r) => !bz.play1(r, r.you === 'C' ? { toL1: 'A', toL2: 'A' } : { relay: r.order }).broken).length;
    const trustC = bz.ROUNDS2.filter((r) => r.direct.L1 !== bz.decide2(r, 'L1')).length;
    report('byzantine-generals', 'task 2 (wrong: tell the truth)', t2, 1, honest / bz.ROUNDS1.length);
    report('byzantine-generals', `task 3 (wrong: trust the commander, ${trustC} mistakes)`, t3, 1, trustC ? 1 : 0);
    report('byzantine-generals', 'task 4', t4, 1, 1);
    for (const t of [t2, t3, t4]) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(40);
    }
    expect(honest).toBe(bz.ROUNDS1.length);
    expect(trustC).toBeGreaterThanOrEqual(1);
  });
});
