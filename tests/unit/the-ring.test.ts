import { describe, expect, it } from 'vitest';
import * as rg from '../../src/games/the-ring/sim';

describe('the hash function', () => {
  it('is deterministic and spreads similar keys apart', () => {
    expect(rg.hash100('user:ana')).toBe(rg.hash100('user:ana'));
    expect(new Set(rg.KEYS.map(rg.hash100)).size).toBeGreaterThanOrEqual(7);
  });
  it('tutorial keys land where the walkthrough says', () => {
    expect([rg.hash100('user:ana'), rg.hash100('user:ana') % 3]).toEqual([3, 0]);
    expect([rg.hash100('cart:42'), rg.hash100('cart:42') % 3]).toEqual([16, 1]);
  });
});

describe('task 2: hash mod N', () => {
  it('adding a 4th server moves most keys (6 of 8)', () => {
    const m = rg.createModulo(1);
    rg.addServer(m);
    while (m.queue.length) rg.placeModulo(m, rg.hash100(m.queue[0]) % 4);
    expect(rg.moduloDone(m)).toBe(true);
    expect(m.moved).toBe(6);
  });
  it('a wrong server is rejected and explained', () => {
    const m = rg.createModulo(0);
    expect(rg.placeModulo(m, 2)).toMatchObject({ ok: false, key: 'user:ana', want: 0 });
    expect(m.queue).toHaveLength(2);
  });
});

describe('task 3: the hash ring', () => {
  it('a key belongs to the next server clockwise, wrapping around', () => {
    expect(rg.owner(rg.RING_SERVERS, 3)).toBe('A');
    expect(rg.owner(rg.RING_SERVERS, 45)).toBe('B');
    expect(rg.owner(rg.RING_SERVERS, 81)).toBe('A');
  });
  it('adding D at 62 moves only the keys between B (45) and D (62)', () => {
    const r = rg.createRing();
    while (r.queue.length) rg.placeRing(r, rg.owner(r.servers, rg.hash100(r.queue[0])));
    expect(r.added).toBe(true);
    expect([...r.movers].sort()).toEqual(['cart:88', 'img:cat']);
    for (const k of r.movers) expect(rg.hash100(k)).toBeGreaterThan(45);
    expect(rg.pickMover(r, 'user:ana')).toBe('stays');
    for (const k of [...r.movers]) expect(rg.pickMover(r, k)).toBe('moves');
    expect(rg.ringDone(r)).toBe(true);
  });
});

describe('task 4: virtual nodes', () => {
  it('shares always add up to the whole ring', () => {
    for (const v of rg.VNODES) expect(Object.values(rg.shares(v)).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it('one point per server is lopsided; many virtual nodes balance it', () => {
    expect(rg.imbalance(1)).toBeGreaterThan(1.4);
    expect(rg.balanced(1)).toBe(false);
    expect(rg.balanced(50)).toBe(true);
    expect(rg.imbalance(50)).toBeLessThan(rg.imbalance(1));
  });
});
