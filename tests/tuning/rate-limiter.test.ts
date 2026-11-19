/**
 * Difficulty tuning for Rate Limiter task 2 (real time): a player taps each bot after a reaction delay.
 * A careless player taps anything that moves; a passive one taps too slowly.
 */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as rl from '../../src/games/rate-limiter/sim';
import { median, report } from './util';

function play(seed: number, mode: 'careful' | 'careless') {
  const rng = mulberry32(seed + 77);
  const l = rl.createLane(1, mulberry32(seed));
  const seen = new Map<number, number>();
  let busyUntil = 0;
  let mistakes = 0;
  while (l.now < 60_000 && l.blockedBots < rl.BOTS_TO_BLOCK) {
    mistakes += rl.stepLane(l, 50).filter((e) => e.type === 'overload').length;
    if (l.now < busyUntil) continue;
    for (const c of l.chips) {
      if (!c || c.state !== 'flying') {
        if (c) seen.delete(c.slot);
        continue;
      }
      const target = mode === 'careful' ? c.kind === 'bot' : true;
      if (!target) continue;
      if (!seen.has(c.slot)) seen.set(c.slot, l.now + between(rng, 350, 750));
      if (l.now >= seen.get(c.slot)!) {
        const r = rl.block(l, c.slot);
        if (r && !r.ok) mistakes++;
        busyUntil = l.now + between(rng, 250, 450);
        break;
      }
    }
  }
  return { ms: l.now + 3000, mistakes, done: l.blockedBots >= rl.BOTS_TO_BLOCK };
}

describe('Rate Limiter difficulty', () => {
  it('task 2: careful vs careless bouncer', () => {
    const times: number[] = [];
    let fails = 0;
    const careMistakes: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const c = play(seed, 'careful');
      expect(c.done).toBe(true);
      times.push(c.ms);
      careMistakes.push(c.mistakes);
      if (play(seed, 'careless').mistakes >= 2) fails++;
    }
    const med = median(times) / 1000;
    report('rate-limiter', `task 2 (careful median mistakes ${median(careMistakes)}; wrong: taps everything)`, med, 1, fails / 200);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
    expect(median(careMistakes)).toBeLessThanOrEqual(1);
    expect(fails / 200).toBeGreaterThan(0.5);
  });
  it('tasks 3–4: a few runs each', () => {
    const ms = 7000 + 3 * 2500;
    report('rate-limiter', 'tasks 3–4 (wrong: one big shared limit)', ms / 1000, 1, 1);
    expect(rl.task3Ok(rl.simulate(rl.task3Traffic(), { scope: 'global', rate: 20, burst: 20 }))).toBe(false);
  });
});
