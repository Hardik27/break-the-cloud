/** Difficulty tuning for Retry Storm task 2: a patient sender vs a spammer. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as rs from '../../src/games/retry-storm/sim';
import { median, report } from './util';

function play(seed: number, patient: boolean) {
  const rng = mulberry32(seed);
  const p = rs.createPace(1);
  let next = 0;
  while (!rs.paceDone(p) && p.now < 60_000) {
    rs.stepPace(p, 50);
    if (p.now < next) continue;
    const room = rs.loadLastSecond(p) + 1 <= rs.paceCapacity(p);
    if (!patient || room) {
      rs.send(p);
      next = p.now + between(rng, patient ? 250 : 150, patient ? 600 : 350);
    }
  }
  return { ms: p.now + 3000, mistakes: p.failed };
}

describe('Retry Storm difficulty', () => {
  it('task 2: wait for room vs spam', () => {
    const times: number[] = [];
    let fails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = play(seed, true);
      expect(c.mistakes).toBe(0);
      times.push(c.ms);
      if (play(seed, false).mistakes >= 2) fails++;
    }
    const med = median(times) / 1000;
    report('retry-storm', 'task 2 (wrong: click as fast as possible)', med, 1, fails / 200);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
    expect(fails / 200).toBeGreaterThan(0.5);
  });
});
