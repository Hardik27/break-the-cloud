import { describe, expect, it } from 'vitest';
import * as th from '../../src/games/thundering-herd/sim';

describe('tasks 1–2: refresh just in time', () => {
  it('when the hot key expires, ~300 requests stampede a database that takes 50', () => {
    const h = th.createHot(1);
    const ev = th.stepHot(h, th.TTL_MS + 10);
    expect(ev).toEqual([{ type: 'stampede', queries: 300 }]);
    expect(h.dbLoad).toBeGreaterThan(th.DB_CAP);
  });
  it('refreshing in the last 30% is good; refreshing with most of the TTL left is wasted work', () => {
    const h = th.createHot(1);
    th.stepHot(h, th.TTL_MS * 0.8);
    expect(th.refresh(h)).toBe('good');
    th.stepHot(h, th.TTL_MS * 0.2);
    expect(th.refresh(h)).toBe('early');
    expect(h.stampedes).toBe(0);
  });
  it('the tutorial is frozen in the amber zone', () => {
    const h = th.createHot(0);
    expect(th.stepHot(h, 60_000)).toEqual([]);
    expect(th.ttlLeft(h)).toBeLessThanOrEqual(0.3);
  });
});

describe('task 3: one hot key', () => {
  it('no protection: the herd overloads the database', () => {
    expect(th.hotKeyExpiry({ coalesce: false, swr: false })).toMatchObject({ dbOk: false, fastOk: false });
  });
  it('coalescing saves the database but makes everyone wait for the reload', () => {
    expect(th.hotKeyExpiry({ coalesce: true, swr: false })).toEqual({ queries: 1, p99Ms: 300, dbOk: true, fastOk: false });
  });
  it('stale-while-revalidate keeps both the database and users happy', () => {
    for (const coalesce of [false, true]) expect(th.hotKeyExpiry({ coalesce, swr: true })).toMatchObject({ dbOk: true, fastOk: true });
  });
});

describe('task 4: synchronized expiry', () => {
  it('without jitter all 200 keys refresh in the same second, every minute', () => {
    const xs = th.expirySchedule(0);
    expect(th.peak(xs)).toBe(200);
    expect(xs[60]).toBe(200);
  });
  it('small jitter is not enough; ±20% or more spreads the load under the budget', () => {
    expect(th.jitterOk(5)).toBe(false);
    expect(th.jitterOk(20)).toBe(true);
    expect(th.jitterOk(50)).toBe(true);
  });
  it('jitter does not reduce the total work, only the peak', () => {
    const total = (j: number) => th.expirySchedule(j).reduce((a, b) => a + b, 0);
    // Within 15%: near the end of the 5-minute window a few jittered keys fit one extra refresh.
    expect(Math.abs(total(20) - total(0))).toBeLessThan(total(0) * 0.15);
  });
});
