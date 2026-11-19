/** Difficulty tuning for The Ring (arithmetic puzzle; time is modelled per key). */
import { describe, expect, it } from 'vitest';
import * as rg from '../../src/games/the-ring/sim';
import { report } from './util';

describe('The Ring difficulty', () => {
  it('tasks 2–4 take 10–40 s; shortcuts fail', () => {
    const t2 = 3000 + 1500 + rg.KEYS.length * 2200; // read, add server, compute hash mod 4 per key
    const r = rg.createRing();
    const t3 = 4000 + rg.KEYS.length * 2000 + 3000 + 2 * 1500; // place keys clockwise, then find movers
    const t4 = 5000 + 3 * 2500;
    report('the-ring', `task 2 ${t2 / 1000} s, task 3 ${t3 / 1000} s, task 4 ${t4 / 1000} s`, t2 / 1000, 1, 1);
    for (const t of [t2, t3, t4]) {
      expect(t / 1000).toBeGreaterThanOrEqual(10);
      expect(t / 1000).toBeLessThanOrEqual(40);
    }
    // Wrong strategy for task 2: assume nothing moves (keep old servers): most answers are wrong.
    expect(rg.KEYS.filter((k) => rg.hash100(k) % 3 !== rg.hash100(k) % 4).length).toBeGreaterThan(rg.KEYS.length / 2);
    // Wrong strategy for task 3: pick the nearest server instead of the next clockwise one.
    expect(r.queue.some((k) => rg.owner(rg.RING_SERVERS, rg.hash100(k)) !== nearest(rg.hash100(k)))).toBe(true);
  });
});

function nearest(pos: number) {
  return rg.RING_SERVERS.reduce((a, b) => (Math.abs(b.pos - pos) < Math.abs(a.pos - pos) ? b : a)).id;
}
