/** Difficulty tuning for CRDT Merge (puzzle; time modelled per click and per decision). */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as cr from '../../src/games/crdt-merge/sim';
import { median, report } from './util';

describe('CRDT Merge difficulty', () => {
  it('each task takes 10–40 s; naive merges fail', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const time = (clicks: number, lo: number, hi: number, read = 0) => median(seeds.map((s) => {
      const rng = mulberry32(s);
      let ms = 3000 + read;
      for (let k = 0; k < clicks; k++) ms += between(rng, lo, hi);
      return ms;
    })) / 1000;
    const t2 = time(5 + 1 + 1, 900, 1600, 6000);
    const t3 = time(cr.G_ROUNDS.length * 3, 1500, 2600, cr.G_ROUNDS.length * 2000);
    const t4 = time(cr.SET_ROUNDS.reduce((a, r) => a + cr.orMerge(r).length + 1, 0), 1200, 2200, cr.SET_ROUNDS.length * 5000);
    const sumWrong = cr.G_ROUNDS.flatMap((r) => r.va.map((a, k) => (a && r.vb[k] ? 1 : 0))).filter(Boolean).length;
    const rmWins = cr.SET_ROUNDS.filter((r) => cr.removeWins(r).join() !== cr.orMerge(r).join()).length;
    report('crdt-merge', 'task 2 (wrong: any merge of plain numbers)', t2, 1, 1);
    report('crdt-merge', `task 3 (wrong: add the entries, ${sumWrong} mistakes)`, t3, 1, sumWrong ? 1 : 0);
    report('crdt-merge', `task 4 (wrong: remove wins, ${rmWins} of ${cr.SET_ROUNDS.length} lists wrong)`, t4, 1, rmWins / cr.SET_ROUNDS.length);
    for (const t of [t2, t3, t4]) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(40);
    }
    expect(sumWrong).toBeGreaterThanOrEqual(3);
    expect(rmWins).toBeGreaterThanOrEqual(2);
  });
});
