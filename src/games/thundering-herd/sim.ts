/**
 * Thundering Herd: cache stampedes. Pure simulation, no DOM.
 *
 * A hot key (the homepage) is read 1,000 times a second. While it is cached, the database sees nothing.
 * The moment it expires, every request misses at once and stampedes the database.
 *
 * Tasks:
 *   0 tutorial   refresh the key early; then expire it on purpose and watch the herd
 *   1 timing     refresh in the last 30% of the TTL, five times, without ever letting it expire
 *   2 one key    pick protections so the database survives and users stay fast
 *   3 many keys  200 keys cached at the same moment expire together; add TTL jitter
 */
import { mulberry32 } from '../../lib/rng';

export const TTL_MS = 6000;
export const REQS_PER_SEC = 1000;
export const DB_CAP = 50;
export const DB_MS = 300;
/** A refresh with more than this fraction of the TTL left wastes work. */
export const TOO_EARLY = 0.6;
export const GOOD_REFRESHES = 5;

// ---------- tasks 0–1 ----------
export interface Hot {
  now: number;
  expiresAt: number;
  good: number;
  early: number;
  stampedes: number;
  /** Database queries in the current moment (decays), for the meter. */
  dbLoad: number;
  frozen: boolean;
}

export function createHot(task: number): Hot {
  return task === 0
    ? { now: 0, expiresAt: TTL_MS * 0.25, good: 0, early: 0, stampedes: 0, dbLoad: 0, frozen: true }
    : { now: 0, expiresAt: TTL_MS, good: 0, early: 0, stampedes: 0, dbLoad: 0, frozen: false };
}

export const ttlLeft = (h: Hot): number => Math.max(0, h.expiresAt - h.now) / TTL_MS;

export type HotEvent = { type: 'stampede'; queries: number };

export function stepHot(h: Hot, dt: number): HotEvent[] {
  const ev: HotEvent[] = [];
  h.dbLoad *= Math.pow(0.5, dt / 250);
  if (h.frozen) return ev;
  h.now += dt;
  if (h.now >= h.expiresAt) ev.push(stampede(h));
  return ev;
}

/** Every request in the ~300 ms it takes to reload goes to the database. */
export function stampede(h: Hot): HotEvent {
  const queries = Math.round((REQS_PER_SEC * DB_MS) / 1000);
  h.stampedes++;
  h.dbLoad = queries;
  h.expiresAt = h.now + TTL_MS;
  return { type: 'stampede', queries };
}

export function refresh(h: Hot): 'good' | 'early' {
  const left = ttlLeft(h);
  h.expiresAt = h.now + TTL_MS;
  h.dbLoad += 1;
  if (left > TOO_EARLY) {
    h.early++;
    return 'early';
  }
  h.good++;
  return 'good';
}

// ---------- task 2: one hot key ----------
export interface HotOpts { coalesce: boolean; swr: boolean }
export interface HotResult { queries: number; p99Ms: number; dbOk: boolean; fastOk: boolean }
export const P99_GOAL_MS = 100;

/**
 * The homepage expires once. Coalescing lets one request reload it while the others wait.
 * Stale-while-revalidate serves the old copy instantly and reloads it in the background.
 */
export function hotKeyExpiry(o: HotOpts): HotResult {
  let queries: number, p99: number;
  if (o.swr) {
    queries = 1;
    p99 = 2;
  } else if (o.coalesce) {
    queries = 1;
    p99 = DB_MS;
  } else {
    queries = Math.round((REQS_PER_SEC * DB_MS) / 1000);
    p99 = queries > DB_CAP ? 2000 : DB_MS;
  }
  return { queries, p99Ms: p99, dbOk: queries <= DB_CAP, fastOk: p99 <= P99_GOAL_MS };
}

// ---------- task 3: synchronized expiry ----------
export const KEYS = 200;
export const LONG_TTL_S = 60;
export const SPREAD_CAP = 20;
export const JITTERS = [0, 5, 20, 50] as const;
export const SIM_S = 300;

/** All keys were cached at deploy time (t = 0). Each refresh gets TTL × (1 ± jitter). Returns refreshes per second. */
export function expirySchedule(jitterPct: number): number[] {
  const rng = mulberry32(4242);
  const perSec = Array(SIM_S).fill(0);
  for (let k = 0; k < KEYS; k++) {
    let t = 0;
    for (;;) {
      const j = jitterPct / 100;
      t += LONG_TTL_S * (1 + (rng() * 2 - 1) * j);
      if (t >= SIM_S) break;
      perSec[Math.floor(t)]++;
    }
  }
  return perSec;
}
export const peak = (xs: number[]): number => Math.max(...xs);
export const jitterOk = (jitterPct: number): boolean => peak(expirySchedule(jitterPct)) <= SPREAD_CAP;
