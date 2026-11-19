/** Difficulty tuning for Gossip. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as gs from '../../src/games/gossip/sim';
import { median, report } from './util';

describe('Gossip difficulty', () => {
  it('each task takes 10–40 s; wrong strategies fail', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    // Task 2: 15 tells + 3 round clicks, about 1.2 s each, plus reading.
    const t2 = median(seeds.map((s) => {
      const rng = mulberry32(s);
      let ms = 3000;
      for (let k = 0; k < 18; k++) ms += between(rng, 900, 1600);
      return ms;
    })) / 1000;
    // Task 3: two or three tries, each with a ~2.5 s animation.
    const t3 = (3000 + 2.5 * (4000 + 2500)) / 1000;
    // Task 4: fixed by the clock: the last death crosses the timeout at round 14.
    const lastDetect = Math.max(...Object.keys(gs.DEATHS).map((p) => gs.DEATHS[p] + 1 + gs.SUSPECT_AFTER));
    const t4 = ((lastDetect - 1) * gs.ROUND_MS + 1500) / 1000;
    const badFan = gs.FANOUTS.filter((f) => !gs.checkFanout(f).ok).length / gs.FANOUTS.length;
    // Wrong strategy for task 4: accuse anything that stalls for 2 rounds (the laggard E gets accused).
    const jumpy = gs.PEERS.filter((p) => !(p in gs.DEATHS) && Array.from({ length: 16 }, (_, r) => gs.age(p, r + 1)).some((a) => a >= 2)).length;
    report('gossip', 'task 2 (wrong: end rounds early)', t2, 1, 1);
    report('gossip', 'task 3 (wrong: any other fanout)', t3, 1, badFan);
    report('gossip', `task 4 (wrong: accuse after a 2-round stall, ${jumpy} false alarms)`, t4, 1, jumpy ? 1 : 0);
    for (const t of [t2, t3, t4]) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(40);
    }
    expect(badFan).toBeGreaterThan(0.5);
    expect(jumpy).toBeGreaterThanOrEqual(1);
  });
});
