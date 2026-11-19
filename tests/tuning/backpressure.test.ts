/** Difficulty tuning for Backpressure: task 2 (drain) and task 3 (poison) in real time with human reactions. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as bp from '../../src/games/backpressure/sim';
import { median, report } from './util';

function drain(seed: number, maxConsumers: number) {
  const rng = mulberry32(seed);
  const d = bp.createDrain(1);
  let mistakes = 0, look = 0;
  while (d.now < 90_000 && !bp.drainDone(d)) {
    for (const e of bp.stepDrain(d, 50)) if (e.type !== 'drained') mistakes++;
    if (d.now < look) continue;
    look = d.now + between(rng, 600, 1100);
    if (!d.drained && d.consumers < maxConsumers) d.consumers++;
    else if (d.drained && d.consumers > bp.SETTLED_MAX) d.consumers--;
  }
  return { ms: d.now + 3000, mistakes, done: bp.drainDone(d) };
}

function poison(seed: number, patient: boolean) {
  const rng = mulberry32(seed);
  const p = bp.createPoison(2);
  let mistakes = 0, actAt = -1;
  while (p.now < 120_000 && !bp.poisonDone(p)) {
    for (const e of bp.stepPoison(p, 50)) if (e.type === 'crash' && e.receives >= 2) mistakes++;
    const head = p.queue[0];
    const suspicious = patient ? head?.receives >= 1 && head.poison === true : head?.receives >= 1;
    if (!suspicious) { actAt = -1; continue; }
    if (actAt < 0) actAt = p.now + between(rng, 500, 900);
    if (p.now >= actAt) {
      if (bp.toDlq(p, head.id) === 'good-order') mistakes++;
      actAt = -1;
    }
  }
  return { ms: p.now + 3000, mistakes, done: bp.poisonDone(p) };
}

describe('Backpressure difficulty', () => {
  it('task 2: scale to the database limit vs scale without limit', () => {
    const times: number[] = [];
    let fails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = drain(seed, bp.DB_MAX);
      expect(c.done).toBe(true);
      expect(c.mistakes).toBeLessThanOrEqual(2);
      times.push(c.ms);
      if (drain(seed, 12).mistakes >= 2) fails++;
    }
    const med = median(times) / 1000;
    report('backpressure', 'task 2 (wrong: add 12 consumers)', med, 1, fails / 200);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
    expect(fails / 200).toBeGreaterThan(0.5);
  });
  it('task 3: quarantine poison promptly', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const c = poison(seed, true);
      expect(c.done).toBe(true);
      expect(c.mistakes).toBe(0);
      times.push(c.ms);
    }
    const med = median(times) / 1000;
    report('backpressure', 'task 3 (wrong: dead-letter anything that failed once)', med, 1, 1);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
  });
});
