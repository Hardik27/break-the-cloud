/**
 * Blast Radius: availability zones, failover, and disaster recovery. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial   move one server to another zone; run the zone-loss test
 *   1 spread     place 6 web servers and 2 databases so losing any one zone still leaves enough
 *   2 live       zone a goes dark: promote the database replica and add capacity in the surviving zones
 *   3 region     choose replication and standby so a whole-region loss meets RPO and RTO within budget
 */
export const AZS = ['a', 'b', 'c'] as const;
export type Az = (typeof AZS)[number];

// ---------- tasks 0–1: placement ----------
export const WEBS = ['web-1', 'web-2', 'web-3', 'web-4', 'web-5', 'web-6'];
export const DBS = ['db-primary', 'db-replica'];
export const COMPONENTS = [...WEBS, ...DBS];
export const WEB_NEEDED = 4;

export type Placement = Record<string, Az>;
export const startPlacement = (): Placement => Object.fromEntries(COMPONENTS.map((c) => [c, 'a' as Az]));

export interface AzTest { az: Az; webLeft: number; dbLeft: number; ok: boolean }
/** Lose each zone in turn: what is left? */
export function testAll(p: Placement): AzTest[] {
  return AZS.map((az) => {
    const webLeft = WEBS.filter((w) => p[w] !== az).length;
    const dbLeft = DBS.filter((d) => p[d] !== az).length;
    return { az, webLeft, dbLeft, ok: webLeft >= WEB_NEEDED && dbLeft >= 1 };
  });
}
export const placementOk = (p: Placement): boolean => testAll(p).every((t) => t.ok);

// ---------- task 2: a zone goes dark ----------
export const LIVE_MS = 20_000;
export const AZ_DOWN_AT = 3000;
export const LUNCH_AT = 10_000;
export const BOOT_MS = 2000;
export const PROMOTE_GRACE_MS = 2000;
export interface Live {
  now: number;
  webs: { az: Az; readyAt: number }[];
  primary: Az;
  replica: Az | null;
  down: Az | null;
  writesDownMs: number;
  shortMs: number;
  done: boolean;
}
export function createLive(): Live {
  const webs: Live['webs'] = [];
  for (const az of AZS) for (let k = 0; k < 2; k++) webs.push({ az, readyAt: 0 });
  return { now: 0, webs, primary: 'a', replica: 'b', down: null, writesDownMs: 0, shortMs: 0, done: false };
}
export const demand = (l: Live): number => (l.now < LUNCH_AT ? 4 : 5);
export const capacity = (l: Live): number => l.webs.filter((w) => w.az !== l.down && w.readyAt <= l.now).length;
export const writesUp = (l: Live): boolean => l.primary !== l.down;

export type LiveEvent = { type: 'az-down' } | { type: 'lunch' } | { type: 'writes-second' } | { type: 'short-second' } | { type: 'done' };
export function stepLive(l: Live, dt: number): LiveEvent[] {
  const ev: LiveEvent[] = [];
  if (l.done) return ev;
  const end = l.now + dt;
  while (l.now < end) {
    const h = Math.min(20, end - l.now);
    const before = l.now;
    l.now += h;
    if (before < AZ_DOWN_AT && l.now >= AZ_DOWN_AT) {
      l.down = 'a';
      ev.push({ type: 'az-down' });
    }
    if (before < LUNCH_AT && l.now >= LUNCH_AT) ev.push({ type: 'lunch' });
    if (!writesUp(l) && l.now - AZ_DOWN_AT > PROMOTE_GRACE_MS) {
      const b = Math.floor(l.writesDownMs / 1000);
      l.writesDownMs += h;
      if (Math.floor(l.writesDownMs / 1000) > b) ev.push({ type: 'writes-second' });
    }
    if (capacity(l) < demand(l)) {
      const b = Math.floor(l.shortMs / 1000);
      l.shortMs += h;
      if (Math.floor(l.shortMs / 1000) > b) ev.push({ type: 'short-second' });
    }
    if (l.now >= LIVE_MS) {
      l.done = true;
      ev.push({ type: 'done' });
      break;
    }
  }
  return ev;
}
export function promote(l: Live): 'promoted' | 'not-needed' | 'no-replica' {
  if (writesUp(l)) return 'not-needed';
  if (!l.replica || l.replica === l.down) return 'no-replica';
  l.primary = l.replica;
  l.replica = null;
  return 'promoted';
}
export function addWeb(l: Live, az: Az): 'booting' | 'dead-zone' {
  if (az === l.down) return 'dead-zone';
  l.webs.push({ az, readyAt: l.now + BOOT_MS });
  return 'booting';
}

// ---------- task 3: losing a whole region ----------
export interface Option { id: string; label: string; detail: string; cost: number }
export const REPLICATION: (Option & { rpoS: number; latencyMs: number })[] = [
  { id: 'backup', label: 'Nightly backup', detail: 'copy the database to the other region once a day', cost: 1, rpoS: 86_400, latencyMs: 0 },
  { id: 'async', label: 'Async replication', detail: 'stream every change to the other region, a few seconds behind', cost: 2, rpoS: 5, latencyMs: 0 },
  { id: 'sync', label: 'Sync replication', detail: 'every write waits until the other region has it', cost: 3, rpoS: 0, latencyMs: 80 },
];
export const STANDBY: (Option & { rtoS: number })[] = [
  { id: 'cold', label: 'Cold restore', detail: 'build everything from scratch when needed', cost: 0, rtoS: 4 * 3600 },
  { id: 'pilot', label: 'Pilot light', detail: 'database running, servers off until needed', cost: 1, rtoS: 30 * 60 },
  { id: 'warm', label: 'Warm standby', detail: 'a small copy of everything, already running', cost: 3, rtoS: 5 * 60 },
  { id: 'active', label: 'Active-active', detail: 'full capacity in both regions, all the time', cost: 5, rtoS: 0 },
];
export const RPO_GOAL_S = 60;
export const RTO_GOAL_S = 10 * 60;
export const LATENCY_GOAL_MS = 20;
export const BUDGET = 5;

export interface DrResult { rpoS: number; rtoS: number; latencyMs: number; cost: number; rpoOk: boolean; rtoOk: boolean; latencyOk: boolean; costOk: boolean; ok: boolean }
export function evaluateDr(replication: string, standby: string): DrResult {
  const r = REPLICATION.find((x) => x.id === replication)!;
  const s = STANDBY.find((x) => x.id === standby)!;
  const res = { rpoS: r.rpoS, rtoS: s.rtoS, latencyMs: r.latencyMs, cost: r.cost + s.cost };
  const rpoOk = res.rpoS <= RPO_GOAL_S, rtoOk = res.rtoS <= RTO_GOAL_S, latencyOk = res.latencyMs <= LATENCY_GOAL_MS, costOk = res.cost <= BUDGET;
  return { ...res, rpoOk, rtoOk, latencyOk, costOk, ok: rpoOk && rtoOk && latencyOk && costOk };
}

export const fmtDuration = (s: number): string => (s === 0 ? '0' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);
