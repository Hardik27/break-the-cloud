/**
 * Rate Limiter: protecting an API with rate limits. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial   the lane is frozen: block two bot requests
 *   1 bouncer    requests fly toward the API; block bots by hand before the API overloads
 *   2 bucket     set a per-client token bucket (rate, burst) so page loads pass and the bot is throttled
 *   3 tenants    a free tenant's batch job starves paying tenants under one shared limit; fix it
 */
import { between, type Rng } from '../../lib/rng';

// ---------- tasks 0–1: the bouncer ----------
export type Kind = 'paid' | 'free' | 'bot';
export const LANE_MS = 3200;
/** The API can take this many requests in any one-second window. */
export const API_CAP = 5;
export const BOTS_TO_BLOCK = 15;
export const POOL = 24;

export interface Chip { slot: number; kind: Kind; born: number; state: 'flying' | 'blocked' | 'served' | 'failed'; doneAt: number }
export type LaneEvent = { type: 'served' | 'overload' | 'bot-through'; slot: number; kind: Kind };

export interface Lane {
  rng: Rng;
  now: number;
  frozen: boolean;
  chips: (Chip | null)[];
  arrivals: number[];
  nextLegit: number;
  nextBurst: number;
  burstLeft: number;
  nextBot: number;
  blockedBots: number;
  blockedLegit: number;
  overloads: number;
}

export function createLane(task: number, rng: Rng): Lane {
  const l: Lane = { rng, now: 0, frozen: task === 0, chips: Array(POOL).fill(null), arrivals: [], nextLegit: 600, nextBurst: 2500, burstLeft: 0, nextBot: 1200, blockedBots: 0, blockedLegit: 0, overloads: 0 };
  if (task === 0) {
    // Tutorial: a still lane with a paid request, a bot (slot 0) and another bot (slot 1) further back.
    l.chips[0] = { slot: 0, kind: 'bot', born: -LANE_MS * 0.55, state: 'flying', doneAt: 0 };
    l.chips[1] = { slot: 1, kind: 'bot', born: -LANE_MS * 0.25, state: 'flying', doneAt: 0 };
    l.chips[2] = { slot: 2, kind: 'paid', born: -LANE_MS * 0.4, state: 'flying', doneAt: 0 };
  }
  return l;
}

/** 0 at the client, 1 at the API. */
export const progress = (l: Lane, c: Chip): number => Math.min(1, (l.now - c.born) / LANE_MS);

function spawn(l: Lane, kind: Kind) {
  const slot = l.chips.findIndex((c) => c === null);
  if (slot < 0) return;
  l.chips[slot] = { slot, kind, born: l.now, state: 'flying', doneAt: 0 };
}

export function stepLane(l: Lane, dt: number): LaneEvent[] {
  const ev: LaneEvent[] = [];
  if (l.frozen) return ev;
  const end = l.now + dt;
  while (l.now < end) {
    l.now = Math.min(end, l.now + 20);
    if (l.now >= l.nextLegit) {
      spawn(l, l.rng() < 0.5 ? 'paid' : 'free');
      l.nextLegit = l.now + between(l.rng, 550, 950);
    }
    if (l.now >= l.nextBot) {
      spawn(l, 'bot');
      l.nextBot = l.now + between(l.rng, 700, 1100);
    }
    if (l.now >= l.nextBurst) {
      l.burstLeft = 3;
      l.nextBurst = l.now + between(l.rng, 2800, 3600);
    }
    if (l.burstLeft > 0 && Math.floor(l.now / 160) !== Math.floor((l.now - 20) / 160)) {
      spawn(l, 'bot');
      l.burstLeft--;
    }
    for (const c of l.chips) {
      if (!c) continue;
      if (c.state !== 'flying') {
        if (l.now - c.doneAt > 500) l.chips[c.slot] = null;
        continue;
      }
      if (progress(l, c) >= 1) {
        l.arrivals = l.arrivals.filter((t) => l.now - t < 1000);
        l.arrivals.push(l.now);
        c.doneAt = l.now;
        if (l.arrivals.length > API_CAP) {
          c.state = 'failed';
          l.overloads++;
          ev.push({ type: 'overload', slot: c.slot, kind: c.kind });
        } else {
          c.state = 'served';
          ev.push({ type: c.kind === 'bot' ? 'bot-through' : 'served', slot: c.slot, kind: c.kind });
        }
      }
    }
  }
  return ev;
}

/** The student blocks the request in `slot` (the API answers 429 Too Many Requests). */
export function block(l: Lane, slot: number): { ok: boolean; kind: Kind } | null {
  const c = l.chips[slot];
  if (!c || c.state !== 'flying') return null;
  c.state = 'blocked';
  c.doneAt = l.now;
  if (c.kind === 'bot') {
    l.blockedBots++;
    return { ok: true, kind: 'bot' };
  }
  l.blockedLegit++;
  return { ok: false, kind: c.kind };
}

// ---------- tasks 2–3: token buckets ----------
/** A token bucket: holds up to `burst` tokens, refills at `rate` per second; each request spends one. */
export class Bucket {
  tokens: number;
  constructor(public rate: number, public burst: number) {
    this.tokens = burst;
  }
  refill(dtMs: number) {
    this.tokens = Math.min(this.burst, this.tokens + (this.rate * dtMs) / 1000);
  }
  take(): boolean {
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

export interface Client { id: string; name: string; kind: Kind; tenant: string; tier: 'paid' | 'free'; times: number[] }
export interface SimResult {
  perClient: { id: string; name: string; kind: Kind; sent: number; ok: number }[];
  /** Requests accepted by the API in each second. */
  loadPerSec: number[];
  peak: number;
  overloaded: boolean;
  legitOkPct: number;
  paidOkPct: number;
  botOkPerSec: number;
}

export const DURATION_MS = 20_000;
export const BUCKET_CAP = 20;

/** Task 2 traffic: three people loading pages (6 requests at once, every ~3 s) and a bot sending 15 requests per second. */
export function task2Traffic(): Client[] {
  const people = [0, 1, 2].map((k) => {
    const times: number[] = [];
    for (let t = 400 + k * 900; t < DURATION_MS; t += 3000) for (let j = 0; j < 6; j++) times.push(t + j * 40);
    return { id: `user${k + 1}`, name: ['Ana', 'Ben', 'Chen'][k], kind: 'paid' as Kind, tenant: `user${k + 1}`, tier: 'paid' as const, times };
  });
  const bot: Client = { id: 'bot', name: 'scraper-9000', kind: 'bot', tenant: 'bot', tier: 'free', times: [] };
  for (let t = 0; t < DURATION_MS; t += 1000 / 15) bot.times.push(Math.round(t));
  return [...people, bot];
}

/** Task 3 traffic: two paying tenants with steady traffic, and a free tenant whose batch job sends 30 requests per second. */
export function task3Traffic(): Client[] {
  const steady = (id: string, name: string, perSec: number, tier: 'paid' | 'free'): Client => {
    const times: number[] = [];
    for (let t = 37; t < DURATION_MS; t += 1000 / perSec) times.push(Math.round(t));
    return { id, name, kind: tier === 'paid' ? 'paid' : 'free', tenant: id, tier, times };
  };
  return [steady('acme', 'Acme (paid)', 4, 'paid'), steady('globex', 'Globex (paid)', 4, 'paid'), steady('freebie', 'Freebie (free tier)', 30, 'free')];
}

export interface LimitConfig { scope: 'global' | 'client'; rate: number; burst: number; freeRate?: number }

export interface TraceEvent { t: number; cid: string; ok: boolean; why: 'bucket' | 'api' | null }
export interface BucketTrace { rate: number; burst: number; samples: { t: number; v: number }[] }
export interface SimTrace { events: TraceEvent[]; buckets: Map<string, BucketTrace>; keyOf: (c: Client) => string }

/** Replays traffic through the limiter; requests over the API capacity per second fail too. */
export function simulate(clients: Client[], cfg: LimitConfig): SimResult {
  return run(clients, cfg).result;
}
/** Same as simulate, plus every request and every bucket level over time (for the replay). */
export function simulateTrace(clients: Client[], cfg: LimitConfig): SimTrace & { result: SimResult } {
  return run(clients, cfg);
}

function run(clients: Client[], cfg: LimitConfig): SimTrace & { result: SimResult } {
  const buckets = new Map<string, Bucket>();
  const traces = new Map<string, BucketTrace>();
  const keyOf = (c: Client) => (cfg.scope === 'global' ? 'all' : c.tenant);
  const bucketFor = (c: Client) => {
    const key = keyOf(c);
    if (!buckets.has(key)) {
      const rate = cfg.scope === 'client' && c.tier === 'free' && cfg.freeRate !== undefined ? cfg.freeRate : cfg.rate;
      const b = new Bucket(rate, cfg.scope === 'global' ? Math.max(cfg.burst, cfg.rate) : cfg.burst);
      buckets.set(key, b);
      traces.set(key, { rate: b.rate, burst: b.burst, samples: [{ t: 0, v: b.tokens }] });
    }
    return buckets.get(key)!;
  };
  clients.forEach(bucketFor);
  const events = clients.flatMap((c) => c.times.map((t) => ({ t, c }))).sort((a, b) => a.t - b.t);
  const stats = new Map(clients.map((c) => [c.id, { id: c.id, name: c.name, kind: c.kind, sent: 0, ok: 0 }]));
  const loadPerSec = Array(Math.ceil(DURATION_MS / 1000)).fill(0);
  const out: TraceEvent[] = [];
  let lastT = 0;
  for (const { t, c } of events) {
    for (const b of buckets.values()) b.refill(t - lastT);
    lastT = t;
    const st = stats.get(c.id)!;
    st.sent++;
    const b = bucketFor(c);
    const took = b.take();
    traces.get(keyOf(c))!.samples.push({ t, v: b.tokens });
    if (!took) {
      out.push({ t, cid: c.id, ok: false, why: 'bucket' });
      continue;
    }
    const sec = Math.floor(t / 1000);
    if (loadPerSec[sec] >= BUCKET_CAP) {
      out.push({ t, cid: c.id, ok: false, why: 'api' });
      continue; // the API itself is full
    }
    loadPerSec[sec]++;
    st.ok++;
    out.push({ t, cid: c.id, ok: true, why: null });
  }
  const per = [...stats.values()];
  const legit = per.filter((p) => p.kind !== 'bot');
  const paid = per.filter((p) => p.kind === 'paid');
  const pct = (xs: typeof per) => (xs.reduce((a, p) => a + p.ok, 0) / Math.max(1, xs.reduce((a, p) => a + p.sent, 0))) * 100;
  const peakDemand = Math.max(...loadPerSec);
  const bot = per.find((p) => p.kind === 'bot');
  return {
    events: out,
    buckets: traces,
    keyOf,
    result: {
      perClient: per,
      loadPerSec,
      peak: peakDemand,
      overloaded: peakDemand >= BUCKET_CAP,
      legitOkPct: pct(legit),
      paidOkPct: pct(paid),
      botOkPerSec: bot ? bot.ok / (DURATION_MS / 1000) : 0,
    },
  };
}

/** Bucket level at time t (it refills continuously between requests). */
export function tokensAt(b: BucketTrace, t: number): number {
  let lo = 0, hi = b.samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (b.samples[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const s = b.samples[lo];
  return Math.min(b.burst, s.v + (b.rate * (t - s.t)) / 1000);
}

/** Task 2, step 1: only Ana’s page loads. */
export const anaTraffic = (): Client[] => task2Traffic().filter((c) => c.id === 'user1');
export const anaOk = (r: SimResult): boolean => r.legitOkPct >= 99;

export const RATES = [1, 2, 5, 20] as const;
export const BURSTS = [1, 3, 6, 20] as const;
/** Task 2: real users’ page loads get through, the bot is held to a trickle, and the API never fills up. */
export const BOT_MAX_PER_SEC = 6;
export const task2Ok = (r: SimResult): boolean => r.legitOkPct >= 99 && r.botOkPerSec <= BOT_MAX_PER_SEC && !r.overloaded;

export const FREE_RATES = [2, 5, 10, 20] as const;
export const PAID_RATES = [5, 10, 20] as const;
/** Task 3: paying tenants never see a 429, and the API never fills up. */
export const task3Ok = (r: SimResult): boolean => r.paidOkPct >= 99.5 && !r.overloaded;
