/** Difficulty tuning for Quorum (turn-based; time is modelled per click and per decision). */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as q from '../../src/games/quorum/sim';
import { median, report } from './util';

/** Task 1 played by a careful student (write 2, read 2) or a lazy one (write 1, read 1). */
function play(seed: number, careful: boolean) {
  const rng = mulberry32(seed);
  const c = q.createCoord();
  let ms = 3000;
  while (!q.coordDone(c)) {
    const k = careful ? 2 : 1;
    const start = Math.floor(rng() * 3);
    for (let j = 0; j < k; j++) q.toggleSelect(c, (start + j) % 3);
    q.sendWrite(c);
    const up = [0, 1, 2].filter((i) => c.replicas[i].up);
    const order = careful ? up : [Math.floor(rng() * 3)].filter((i) => c.replicas[i].up).concat(up);
    for (const i of order.slice(0, k)) q.toggleSelect(c, i);
    q.sendRead(c);
    q.nextRound(c);
    ms += between(rng, 2500, 4000) + (2 * k + 2) * between(rng, 700, 1100);
  }
  return { ms, stale: c.stale };
}

describe('Quorum difficulty', () => {
  it('task 2: careful coordination finishes in 10–40 s; writing to one replica goes stale', () => {
    const times: number[] = [];
    let wrongFails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const good = play(seed, true);
      expect(good.stale).toBe(0);
      times.push(good.ms);
      if (play(seed, false).stale >= 1) wrongFails++;
    }
    const m = median(times) / 1000;
    report('quorum', 'task 2 (by hand; wrong: write 1, read 1)', m, 1, wrongFails / 200);
    expect(m).toBeGreaterThanOrEqual(10);
    expect(m).toBeLessThanOrEqual(40);
    expect(wrongFails / 200).toBeGreaterThan(0.5);
  });
  it('tasks 3–4: a few tries each, and guessing usually fails', () => {
    const t3 = 3000 + 2 * 4500, t4 = 3000 + 2 * 4500;
    const fail3 = q.RS.flatMap((r) => q.WS.map((w) => q.checkFresh(r, w).ok)).filter((ok) => !ok).length / 9;
    const fail4 = q.RS.flatMap((r) => q.WS.map((w) => q.checkOneDown(r, w).ok)).filter((ok) => !ok).length / 9;
    report('quorum', `task 3 ${t3 / 1000} s (random guess fails ${(fail3 * 100).toFixed(0)}%)`, t3 / 1000, 1, fail3);
    report('quorum', `task 4 ${t4 / 1000} s (random guess fails ${(fail4 * 100).toFixed(0)}%)`, t4 / 1000, 1, fail4);
    for (const t of [t3, t4]) expect(t / 1000).toBeGreaterThanOrEqual(10);
    expect(fail3).toBeGreaterThan(0.5);
    expect(fail4).toBeGreaterThan(0.5);
  });
});
