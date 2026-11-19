/** Difficulty tuning for Two-Phase Commit (decision game; time modelled per decision plus fixed waits). */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as tp from '../../src/games/two-phase-commit/sim';
import { median, report } from './util';

const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
function t(seed: number, n: number, lo: number, hi: number, fixed = 0) {
  const rng = mulberry32(seed);
  let ms = 3000 + fixed;
  for (let i = 0; i < n; i++) ms += between(rng, lo, hi);
  return ms;
}

describe('Two-Phase Commit difficulty', () => {
  it('each task takes 10–40 s; one-rule strategies fail', () => {
    const t2 = median(seeds.map((s) => t(s, tp.TRANSFERS.length, 3500, 5500))) / 1000; // prepare, 1 s of votes, read, decide
    const t3 = median(seeds.map((s) => t(s, tp.RECOVERIES.length, 3000, 5000))) / 1000;
    const t4 = median(seeds.map((s) => t(s, tp.BLOCKED.length, 4000, 6000, tp.WAIT_MS))) / 1000;
    const commitAll = tp.TRANSFERS.filter((x) => !tp.decide(x, true).ok).length;
    const askAll = tp.RECOVERIES.filter((r) => !tp.recover(r, 'ask').ok).length;
    const waitAll = tp.BLOCKED.filter((b) => !tp.terminate(b, 'wait').ok).length;
    report('two-phase-commit', `task 2 (wrong: always commit, ${commitAll} mistakes)`, t2, 1, commitAll ? 1 : 0);
    report('two-phase-commit', `task 3 (wrong: always ask, ${askAll} mistakes)`, t3, 1, askAll ? 1 : 0);
    report('two-phase-commit', `task 4 (wrong: always wait, ${waitAll} mistakes)`, t4, 1, waitAll ? 1 : 0);
    for (const x of [t2, t3, t4]) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(40);
    }
    for (const n of [commitAll, askAll, waitAll]) expect(n).toBeGreaterThanOrEqual(2);
  });
});
