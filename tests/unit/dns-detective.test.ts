import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as dns from '../../src/games/dns-detective/sim';

/** Plays a task the right way: use a fresh cache entry when there is one, otherwise walk the tree. */
export function solveOptimally(s: dns.State): number {
  let clicks = 0;
  while (s.current) {
    const r = dns.click(s, dns.expected(s)[0]);
    clicks++;
    if (r.kind === 'wrong') throw new Error(r.msg);
  }
  return clicks;
}

describe('task 1–2: walking the tree', () => {
  it('the tutorial walks resolver → root → .com → ns1.shop.com and caches the answer', () => {
    const s = dns.create(0, mulberry32(1));
    for (const n of ['resolver', 'root', 'tld-com', 'auth-shop'] as dns.NodeId[]) expect(dns.click(s, n).kind).toBe('hop');
    expect(dns.finished(s)).toBe(true);
    expect(s.cache.get('api.shop.com')).toEqual({ ip: '198.51.100.7', stale: false });
    expect(s.mistakes).toBe(0);
  });
  it('asking the wrong server is a mistake with a helpful explanation, and does not advance', () => {
    const s = dns.create(0, mulberry32(1));
    expect(dns.click(s, 'root')).toMatchObject({ kind: 'wrong', msg: expect.stringContaining('resolver') });
    dns.click(s, 'resolver');
    dns.click(s, 'root');
    expect(dns.click(s, 'tld-io')).toMatchObject({ kind: 'wrong', msg: expect.stringContaining('.com') });
    expect(s.current!.hop).toBe(2);
    expect(s.mistakes).toBe(2);
  });
  it('task 2 resolves 4 different names, each through its own TLD and server', () => {
    const s = dns.create(1, mulberry32(4));
    expect(new Set(s.queue.concat(s.current!.name)).size).toBe(4);
    expect(solveOptimally(s)).toBe(16);
    expect(s.mistakes).toBe(0);
  });
  it('always clicking .com fails for .io and .org names', () => {
    const s = dns.create(1, mulberry32(4));
    while (s.current) {
      const want = dns.expected(s)[0];
      const guess = want.startsWith('tld-') ? 'tld-com' : want;
      if (dns.click(s, guess).kind === 'wrong') dns.click(s, want);
    }
    expect(s.mistakes).toBeGreaterThanOrEqual(2);
  });
});

describe('task 3: the cache', () => {
  it('repeat lookups are answered from the cache in two clicks', () => {
    const s = dns.create(2, mulberry32(1));
    expect(solveOptimally(s)).toBe(3 * 4 + 3 * 2);
    expect(s.mistakes).toBe(0);
  });
  it('walking the tree for a cached name wastes round trips and is a mistake', () => {
    const s = dns.create(2, mulberry32(1));
    while (s.current) {
      const want = dns.expected(s)[0];
      dns.click(s, want === 'cache' ? 'root' : want);
      if (s.current && s.current.hop === 2 && want === 'cache') {
        dns.click(s, dns.expected(s)[0]);
        dns.click(s, dns.expected(s)[0]);
      }
    }
    expect(s.mistakes).toBe(3);
  });
  it('the cache button on a name never seen before is a cache miss', () => {
    const s = dns.create(2, mulberry32(1));
    dns.click(s, 'resolver');
    expect(dns.click(s, 'cache')).toMatchObject({ kind: 'wrong', msg: expect.stringContaining('Cache miss') });
  });
});

describe('task 4: stale answers', () => {
  it('trusting the stale cache sends users to the old server', () => {
    const s = dns.create(3, mulberry32(1));
    solveOne(s); // cdn.cloud.io from cache
    dns.click(s, 'resolver');
    expect(dns.click(s, 'cache')).toMatchObject({ kind: 'wrong', msg: expect.stringContaining('old server') });
  });
  it('a fresh lookup gets the new address and refreshes the cache', () => {
    const s = dns.create(3, mulberry32(1));
    solveOptimally(s);
    expect(s.cache.get('api.shop.com')).toEqual({ ip: dns.NEW_IP, stale: false });
    expect(s.mistakes).toBe(0);
  });
});

describe('task 5: TTL', () => {
  const [migrate, stable] = dns.SCENARIOS;
  it('before a migration only a short-but-not-tiny TTL works', () => {
    expect(dns.TTL_OPTIONS.filter((t) => dns.evaluateTtl(migrate, t).ok)).toEqual([300]);
    expect(dns.evaluateTtl(migrate, 60).loadOk).toBe(false); // too many queries
    expect(dns.evaluateTtl(migrate, 3600).staleOk).toBe(false); // stale too long
  });
  it('a stable record wants a long TTL', () => {
    expect(dns.TTL_OPTIONS.filter((t) => dns.evaluateTtl(stable, t).ok)).toEqual([3600, 86400]);
  });
});

function solveOne(s: dns.State) {
  const name = s.current!.name;
  while (s.current && s.current.name === name) dns.click(s, dns.expected(s)[0]);
}
