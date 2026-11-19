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
    // Task 4: per member about 3 decisions (ping, ask others, verdict).
    const t4 = (3000 + gs.SUSPECTS.length * 3 * 1500) / 1000;
    const badFan = gs.FANOUTS.filter((f) => !gs.checkFanout(f).ok).length / gs.FANOUTS.length;
    // Wrong strategy for task 4: declare dead after your own ping fails (SWIM without indirect pings).
    const jumpy = gs.SUSPECTS.filter((_, i) => { const r = gs.createSwim(i); gs.pingDirect(r); return !gs.judge(r, r.probe === 'direct-ok' ? 'alive' : 'dead').ok; }).length;
    report('gossip', 'task 2 (wrong: end rounds early)', t2, 1, 1);
    report('gossip', 'task 3 (wrong: any other fanout)', t3, 1, badFan);
    report('gossip', `task 4 (wrong: one failed ping means dead, ${jumpy} mistakes)`, t4, 1, jumpy ? 1 : 0);
    for (const t of [t2, t3, t4]) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(40);
    }
    expect(badFan).toBeGreaterThan(0.5);
    expect(jumpy).toBeGreaterThanOrEqual(1);
  });
});
