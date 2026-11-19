/** Difficulty tuning for Thundering Herd task 2: refresh timing with human reaction. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as th from '../../src/games/thundering-herd/sim';
import { median, report } from './util';

/** Aim to click when `target` of the TTL is left, with reaction noise. */
function play(seed: number, target: number) {
  const rng = mulberry32(seed);
  const h = th.createHot(1);
  let clickAt = -1;
  let mistakes = 0;
  while (h.now < 90_000 && h.good < th.GOOD_REFRESHES) {
    mistakes += th.stepHot(h, 50).length;
    if (clickAt < 0 && th.ttlLeft(h) <= target) clickAt = h.now + between(rng, 200, 700);
    if (clickAt >= 0 && h.now >= clickAt) {
      if (th.refresh(h) === 'early') mistakes++;
      clickAt = -1;
    }
  }
  return { ms: h.now + 3000, mistakes };
}

describe('Thundering Herd difficulty', () => {
  it('task 2: aim for the amber zone vs click early or late', () => {
    const times: number[] = [];
    let fails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = play(seed, 0.28);
      expect(c.mistakes).toBe(0);
      times.push(c.ms);
      const eager = play(seed, 0.9); // refreshes as soon as it can
      const late = play(seed + 500, 0.08); // waits too long
      if (eager.mistakes >= 1 && late.mistakes >= 1) fails++;
    }
    const med = median(times) / 1000;
    report('thundering-herd', 'task 2 (wrong: refresh far too early, or too late)', med, 1, fails / 200);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
    expect(fails / 200).toBeGreaterThan(0.5);
  });
  it('tasks 3–4: modelled', () => {
    report('thundering-herd', 'tasks 3–4 (wrong: coalescing only / tiny jitter)', 12, 1, 1);
    expect(th.hotKeyExpiry({ coalesce: true, swr: false }).fastOk).toBe(false);
  });
});
