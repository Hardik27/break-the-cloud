/** Difficulty tuning for Clock Skew (puzzle; time is modelled per decision). */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as ck from '../../src/games/clock-skew/sim';
import { median, report } from './util';

function time(seed: number, n: number, lo: number, hi: number) {
  const rng = mulberry32(seed);
  let ms = 3000;
  for (let i = 0; i < n; i++) ms += between(rng, lo, hi);
  return ms;
}

describe('Clock Skew difficulty', () => {
  it('each task takes 10–40 s, and the wrong strategy fails', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const t2 = median(seeds.map((s) => time(s, ck.CHAT.length, 2000, 4000))) / 1000;
    const t3 = median(seeds.map((s) => time(s, ck.EVENTS.length, 2500, 4500))) / 1000;
    const t4 = median(seeds.map((s) => time(s, ck.PAIRS.length, 3000, 5000))) / 1000;
    // Wrong strategies: trust the timestamps; count events per server; compare Lamport numbers.
    const tsWrong = ck.byTimestamp(ck.CHAT).some((i, s) => i !== s) ? 1 : 0;
    const countWrong = ck.EVENTS.filter((e) => !ck.checkLamport(e.id, ck.EVENTS.slice(0, ck.EVENTS.indexOf(e) + 1).filter((x) => x.p === e.p).length).ok).length;
    const lamWrong = ck.PAIRS.filter(([x, y]) => ck.lamportGuess(x, y) !== ck.relation(x, y)).length;
    report('clock-skew', 'task 2 (wrong: trust timestamps)', t2, 1, tsWrong);
    report('clock-skew', `task 3 (wrong: count local events, ${countWrong} mistakes)`, t3, 1, countWrong ? 1 : 0);
    report('clock-skew', `task 4 (wrong: compare Lamport numbers, ${lamWrong} mistakes)`, t4, 1, lamWrong ? 1 : 0);
    for (const t of [t2, t3, t4]) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(40);
    }
    expect(countWrong).toBeGreaterThanOrEqual(3);
    expect(lamWrong).toBeGreaterThanOrEqual(3);
  });
});
