/** Difficulty tuning for Cache Hit: task 2 in real time with a reaction delay; tasks 3–4 modelled. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as ch from '../../src/games/cache-hit/sim';
import { median, report } from './util';

function play(seed: number, smart: boolean) {
  const rng = mulberry32(seed + 9);
  const s = ch.createByHand(1, mulberry32(seed));
  let decideAt = -1;
  let mistakes = 0;
  while (s.now < 90_000 && !ch.byHandDone(s)) {
    ch.stepByHand(s, 50);
    if (!s.pending) { decideAt = -1; continue; }
    if (decideAt < 0) decideAt = s.now + between(rng, 700, 1400);
    if (s.now < decideAt) continue;
    const empty = s.slots.indexOf(null);
    let i = empty;
    if (i < 0) {
      if (smart) {
        i = 0;
        s.slots.forEach((k, j) => s.seen[k!] < s.seen[s.slots[i]!] && (i = j));
        if (s.seen[s.slots[i]!] > s.seen[s.pending]) { ch.skip(s); continue; }
      } else i = Math.floor(rng() * ch.SLOTS);
    }
    if (ch.place(s, i)!.badEviction) mistakes++;
  }
  return { ms: s.now + 3000, done: ch.byHandDone(s), mistakes };
}

describe('Cache Hit difficulty', () => {
  it('task 2: evict the coldest page vs evict at random', () => {
    const times: number[] = [];
    let fails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = play(seed, true);
      expect(c.done).toBe(true);
      expect(c.mistakes).toBe(0);
      times.push(c.ms);
      const w = play(seed, false);
      if (!w.done || w.mistakes >= 1) fails++;
    }
    const med = median(times) / 1000;
    report('cache-hit', 'task 2 (wrong: evicts a random slot)', med, 1, fails / 200);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
    expect(fails / 200).toBeGreaterThan(0.5);
  });
  it('tasks 3–4: modelled', () => {
    const t3 = 3000 + 2 * (5000 + 2500);
    const t4 = 13_500 + 2500;
    report('cache-hit', `task 3 ${t3 / 1000} s, task 4 ${t4 / 1000} s (wrong: the other policy / never invalidate)`, t3 / 1000, 1, 1);
    expect(t3 / 1000).toBeGreaterThanOrEqual(10);
    expect(t4 / 1000).toBeGreaterThanOrEqual(10);
  });
});
