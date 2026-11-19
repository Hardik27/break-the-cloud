import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as ch from '../../src/games/cache-hit/sim';

/** Evict the cached page seen least often (what a careful student does). */
const coldestSlot = (s: ch.ByHand) => {
  const empty = s.slots.indexOf(null);
  if (empty >= 0) return empty;
  let best = 0;
  s.slots.forEach((k, i) => s.seen[k!] < s.seen[s.slots[best]!] && (best = i));
  return best;
};

describe('tasks 1–2: you are the cache', () => {
  it('the tutorial starts frozen with a miss waiting', () => {
    const s = ch.createByHand(0, mulberry32(1));
    expect(s.pending).toBe('deals');
    expect(ch.stepByHand(s, 10_000)).toEqual([]);
    expect(ch.place(s, 0)).toEqual({ evicted: null, badEviction: false });
  });
  it('keeping popular pages reaches a 70% hit rate', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = ch.createByHand(1, mulberry32(seed));
      for (let t = 0; t < 90_000 && !ch.byHandDone(s); t += 50) {
        ch.stepByHand(s, 50);
        if (s.pending && s.now - s.pendingAt > 500) {
          const i = coldestSlot(s);
          if (s.slots[i] && s.seen[s.slots[i]!] > s.seen[s.pending]) ch.skip(s);
          else ch.place(s, i);
        }
      }
      expect(ch.byHandDone(s)).toBe(true);
    }
  });
  it('evicting a clearly popular page for a rare one is flagged', () => {
    const s = ch.createByHand(1, mulberry32(1));
    s.slots = ['home', 'deals', 'shoes', 'phones'];
    Object.assign(s.seen, { home: 12, deals: 8, shoes: 6, phones: 4, garden: 1 });
    s.pending = 'garden';
    expect(ch.place(s, 0)).toEqual({ evicted: 'home', badEviction: true });
    s.pending = 'toys';
    s.seen.toys = 1;
    expect(ch.place(s, 0)!.badEviction).toBe(false); // garden (1) is the coldest page: a fine eviction
  });
  it('evicting at random keeps throwing out popular pages', () => {
    let flagged = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed + 1000);
      const s = ch.createByHand(1, mulberry32(seed));
      let bad = 0;
      for (let t = 0; t < 40_000 && !ch.byHandDone(s); t += 50) {
        ch.stepByHand(s, 50);
        if (s.pending && s.now - s.pendingAt > 500) {
          const empty = s.slots.indexOf(null);
          if (ch.place(s, empty >= 0 ? empty : Math.floor(rng() * ch.SLOTS))!.badEviction) bad++;
        }
      }
      if (bad > 0) flagged++;
    }
    expect(flagged).toBeGreaterThan(10);
  });
});

describe('task 3: LRU vs LFU', () => {
  const [scan, trend] = ch.PATTERNS;
  it('a one-off scan flushes LRU; LFU keeps the hot pages', () => {
    expect(ch.bestPolicy(scan)).toBe('lfu');
    expect(ch.policyRate('lfu', scan) - ch.policyRate('lru', scan)).toBeGreaterThan(0.15);
  });
  it('when popularity shifts, LFU clings to yesterday’s pages; LRU adapts', () => {
    expect(ch.bestPolicy(trend)).toBe('lru');
    expect(ch.policyRate('lru', trend) - ch.policyRate('lfu', trend)).toBeGreaterThan(0.15);
  });
});

describe('task 4: stale data', () => {
  it('without invalidation, shoppers read stale prices after each change', () => {
    const s = ch.createStale(mulberry32(1));
    ch.stepStale(s, 20_000);
    expect(s.updatesDone).toBe(3);
    expect(s.staleReads).toBeGreaterThan(5);
    expect(ch.staleDone(s)).toBe(false);
  });
  it('invalidating after each change means the next read is fresh', () => {
    const s = ch.createStale(mulberry32(1));
    for (let t = 0; t < 25_000 && !ch.staleDone(s); t += 50) {
      for (const e of ch.stepStale(s, 50)) if (e.type === 'update') expect(ch.invalidate(s)).toBe('fixed');
    }
    expect(s.staleReads).toBe(0);
    expect(ch.staleDone(s)).toBe(true);
  });
  it('invalidating a correct entry wastes a database read', () => {
    const s = ch.createStale(mulberry32(1));
    expect(ch.invalidate(s)).toBe('wasted');
  });
});
