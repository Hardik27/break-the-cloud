/**
 * Cache Hit: a small cache in front of a slow database. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial    place two misses into empty slots
 *   1 by hand     you are the eviction policy: reach a 70% hit rate over the last 20 requests
 *   2 policy      choose LRU or LFU for two traffic patterns
 *   3 stale       the database changes; invalidate the cached copy before a shopper reads it
 */
import { between, type Rng } from '../../lib/rng';

export const SLOTS = 4;
export const KEYS = ['home', 'deals', 'shoes', 'phones', 'bags', 'books', 'toys', 'garden'] as const;
/** Popularity: a few pages get most of the traffic (a Zipf-like shape, as in real sites). */
export const WEIGHTS = [30, 20, 15, 10, 8, 7, 5, 5];
export const DB_MS = 300;
export const CACHE_MS = 2;
export const REQ_GAP_MS = 650;
export const DECIDE_MS = 4000;
export const WINDOW = 20;
export const HIT_GOAL = 0.7;

export function drawKey(rng: Rng): string {
  let r = rng() * 100;
  for (let i = 0; i < KEYS.length; i++) {
    r -= WEIGHTS[i];
    if (r < 0) return KEYS[i];
  }
  return KEYS[KEYS.length - 1];
}

// ---------- tasks 0–1: you are the cache ----------
export interface ByHand {
  rng: Rng;
  now: number;
  slots: (string | null)[];
  /** A missed key waiting for the student to place it (or skip). */
  pending: string | null;
  pendingAt: number;
  nextAt: number;
  window: boolean[];
  seen: Record<string, number>;
  last: { key: string; hit: boolean } | null;
  frozen: boolean;
}

export function createByHand(task: number, rng: Rng): ByHand {
  const s: ByHand = { rng, now: 0, slots: Array(SLOTS).fill(null), pending: null, pendingAt: 0, nextAt: 800, window: [], seen: Object.fromEntries(KEYS.map((k) => [k, 0])), last: null, frozen: task === 0 };
  if (task === 0) miss(s, 'deals');
  return s;
}

/** A cache miss for `key`: the student must place it (the tutorial uses this directly). */
export function miss(s: ByHand, key: string) {
  s.seen[key]++;
  s.window.push(false);
  if (s.window.length > WINDOW) s.window.shift();
  s.pending = key;
  s.pendingAt = s.now;
  s.last = { key, hit: false };
}

export type ByHandEvent = { type: 'hit'; key: string } | { type: 'miss'; key: string } | { type: 'timeout'; key: string };

export function stepByHand(s: ByHand, dt: number): ByHandEvent[] {
  const ev: ByHandEvent[] = [];
  if (s.frozen) return ev;
  const end = s.now + dt;
  while (s.now < end) {
    s.now = Math.min(end, s.now + 20);
    if (s.pending) {
      if (s.now - s.pendingAt > DECIDE_MS) {
        ev.push({ type: 'timeout', key: s.pending });
        s.pending = null;
        s.nextAt = s.now + REQ_GAP_MS;
      }
      continue;
    }
    if (s.now < s.nextAt) continue;
    const key = drawKey(s.rng);
    if (s.slots.includes(key)) {
      s.seen[key]++;
      s.window.push(true);
      if (s.window.length > WINDOW) s.window.shift();
      s.last = { key, hit: true };
      s.nextAt = s.now + REQ_GAP_MS;
      ev.push({ type: 'hit', key });
    } else {
      miss(s, key);
      ev.push({ type: 'miss', key });
    }
  }
  return ev;
}

export const hitRate = (s: ByHand): number => (s.window.length ? s.window.filter(Boolean).length / s.window.length : 0);
export const byHandDone = (s: ByHand): boolean => s.window.length >= WINDOW && hitRate(s) >= HIT_GOAL;

/** Store the pending key in a slot. Returns what was evicted and whether that was a clearly worse choice. */
export function place(s: ByHand, slot: number): { evicted: string | null; badEviction: boolean } | null {
  if (!s.pending) return null;
  const evicted = s.slots[slot];
  let badEviction = false;
  if (evicted) {
    const others = s.slots.filter((k, i) => k && i !== slot) as string[];
    const coldest = Math.min(s.seen[s.pending], ...others.map((k) => s.seen[k]));
    // Evicting a key you have seen much more often than another cached key (or the new one) is a mistake.
    badEviction = s.seen[evicted] >= coldest + 3 && s.seen[evicted] > s.seen[s.pending];
  }
  s.slots[slot] = s.pending;
  s.pending = null;
  s.nextAt = s.now + REQ_GAP_MS;
  return { evicted, badEviction };
}

export function skip(s: ByHand): void {
  s.pending = null;
  s.nextAt = s.now + REQ_GAP_MS;
}

// ---------- task 2: LRU vs LFU ----------
export type Policy = 'lru' | 'lfu';
/** measureFrom: hit rate is measured from this request on (after the change the pattern is about). */
export interface Pattern { id: string; title: string; text: string; trace: string[]; measureFrom: number }

/** Hot pages, plus a nightly job that reads 12 cold pages once each, again and again. */
function scanTrace(): string[] {
  const t: string[] = [];
  let k = 0;
  for (let i = 0; i < 600; i++) {
    t.push(['home', 'deals', 'shoes', 'home', 'phones', 'deals', 'home'][i % 7]);
    if (i % 5 === 4) for (let j = 0; j < 4; j++) t.push(`archive-${(k++ % 40) + 1}`);
  }
  return t;
}
/** Yesterday's hot pages go cold; a new set of pages becomes popular. */
function trendTrace(): string[] {
  const t: string[] = [];
  const old = ['home', 'deals', 'shoes', 'phones'];
  const fresh = ['sale-1', 'sale-2', 'sale-3', 'sale-4'];
  for (let i = 0; i < 400; i++) t.push(old[i % 4]);
  for (let i = 0; i < 400; i++) t.push(fresh[i % 4], i % 9 === 0 ? old[i % 4] : fresh[(i + 1) % 4]);
  return t;
}

export const PATTERNS: Pattern[] = [
  { id: 'scan', title: 'The nightly report', text: 'Shoppers hit a few hot pages all day. Every few seconds a reporting job also reads a batch of old archive pages, once each, never again.', trace: scanTrace(), measureFrom: 0 },
  { id: 'trend', title: 'Black Friday', text: 'Yesterday shoppers loved home, deals, shoes and phones. Today a new sale starts and everyone switches to four sale pages.', trace: trendTrace(), measureFrom: 400 },
];

/** Classic LRU and LFU. LFU counts uses only while a page is cached (counts reset on eviction). */
export function runPolicy(policy: Policy, trace: string[], measureFrom = 0, size = SLOTS): number {
  const cache: string[] = [];
  const lastUse = new Map<string, number>();
  const freq = new Map<string, number>();
  let hits = 0;
  trace.forEach((k, t) => {
    if (cache.includes(k)) {
      freq.set(k, freq.get(k)! + 1);
      if (t >= measureFrom) hits++;
    } else {
      if (cache.length >= size) {
        const victim = cache.reduce((a, b) =>
          policy === 'lru'
            ? lastUse.get(a)! <= lastUse.get(b)! ? a : b
            : freq.get(a)! < freq.get(b)! || (freq.get(a) === freq.get(b) && lastUse.get(a)! <= lastUse.get(b)!) ? a : b,
        );
        cache.splice(cache.indexOf(victim), 1);
        freq.delete(victim);
      }
      cache.push(k);
      freq.set(k, 1);
    }
    lastUse.set(k, t);
  });
  return hits / (trace.length - measureFrom);
}

export const policyRate = (policy: Policy, p: Pattern): number => runPolicy(policy, p.trace, p.measureFrom);
export const bestPolicy = (p: Pattern): Policy => (policyRate('lru', p) >= policyRate('lfu', p) ? 'lru' : 'lfu');

// ---------- task 3: stale data ----------
export interface Stale {
  rng: Rng;
  now: number;
  dbPrice: number;
  cached: number | null;
  updates: number[];
  nextRead: number;
  updatesDone: number;
  staleReads: number;
  freshAfterUpdate: number;
  log: string[];
}
export const PRICE_UPDATES = 3;

export function createStale(rng: Rng): Stale {
  return { rng, now: 0, dbPrice: 50, cached: 50, updates: [2500, 8000, 13500], nextRead: 1200, updatesDone: 0, staleReads: 0, freshAfterUpdate: 0, log: ['Cache: price:shoes = $50 (TTL 1 hour)'] };
}
export type StaleEvent = { type: 'update'; price: number } | { type: 'read'; price: number; stale: boolean; fromCache: boolean };

export function stepStale(s: Stale, dt: number): StaleEvent[] {
  const ev: StaleEvent[] = [];
  const end = s.now + dt;
  while (s.now < end) {
    s.now = Math.min(end, s.now + 20);
    const u = s.updates[s.updatesDone];
    if (u !== undefined && s.now >= u) {
      s.updatesDone++;
      s.dbPrice = [45, 39, 42][s.updatesDone - 1];
      s.log.unshift(`Admin: UPDATE price:shoes = $${s.dbPrice} in the database`);
      ev.push({ type: 'update', price: s.dbPrice });
    }
    if (s.now >= s.nextRead) {
      s.nextRead = s.now + between(s.rng, 1300, 1700);
      if (s.cached === null) {
        s.cached = s.dbPrice;
        s.log.unshift(`Shopper reads shoes: cache miss → database ($${s.dbPrice}, ${DB_MS} ms), cached`);
        ev.push({ type: 'read', price: s.dbPrice, stale: false, fromCache: false });
        if (s.updatesDone > 0) s.freshAfterUpdate = s.updatesDone;
      } else {
        const stale = s.cached !== s.dbPrice;
        if (stale) s.staleReads++;
        s.log.unshift(`Shopper reads shoes: cache hit → $${s.cached}${stale ? ' (STALE: the real price is $' + s.dbPrice + ')' : ''}`);
        ev.push({ type: 'read', price: s.cached, stale, fromCache: true });
      }
      if (s.log.length > 6) s.log.length = 6;
    }
  }
  return ev;
}

export function invalidate(s: Stale): 'fixed' | 'wasted' {
  const stale = s.cached !== null && s.cached !== s.dbPrice;
  s.cached = null;
  s.log.unshift('You: DELETE price:shoes from the cache');
  return stale ? 'fixed' : 'wasted';
}

export const staleDone = (s: Stale): boolean => s.updatesDone >= PRICE_UPDATES && s.freshAfterUpdate >= PRICE_UPDATES;
