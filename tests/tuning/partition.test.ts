/** Difficulty tuning for Partition (decision puzzle; time is modelled per decision). */
import { describe, expect, it } from 'vitest';
import * as pt from '../../src/games/partition/sim';
import { report } from './util';

describe('Partition difficulty', () => {
  it('tasks 2–4 take 10–40 s with careful reading', () => {
    const t2 = 4000 + pt.PROMPTS.length * 2200;
    const t3 = 3000 + pt.MERGE_ROUNDS.length * (5000 + 4 * 900 + 800);
    const t4 = 3000 + pt.SYSTEMS.length * 2000;
    report('partition', `task 2 ${t2 / 1000} s, task 3 ${t3 / 1000} s, task 4 ${t4 / 1000} s (wrong: one rule for all data)`, t2 / 1000, 1, 1);
    for (const t of [t2, t3, t4]) {
      expect(t / 1000).toBeGreaterThanOrEqual(10);
      expect(t / 1000).toBeLessThanOrEqual(40);
    }
  });
});
