/**
 * Heartbeat: failure detection with heartbeats and timeouts. Pure simulation, no DOM.
 *
 * Each server sends a heartbeat every `interval` ms. A server that crashes stops forever; a server in a
 * garbage-collection (GC) pause stops for a while and then carries on. From the outside, both look the same
 * at first: silence. Evicting a server removes it from the pool (no more traffic).
 *
 * Tasks:
 *   0 tutorial    evict the crashed server, then return its replacement
 *   1 by hand     you are the failure detector: evict 3 crashed servers, never a pausing one
 *   2 too eager   an automatic detector with a tiny timeout evicts healthy servers; fix it
 *   3 tune        catch a crash within 5 s with zero false evictions
 */
import { between, shuffle, type Rng } from '../../lib/rng';

export const N = 5;
export const NAMES = Array.from({ length: N }, (_, i) => `web-${i + 1}`);
export const BEAT_MS = 500;
/** A crashed server is replaced by a fresh one after this long, once it has been evicted. */
export const REPLACE_MS = 3000;
/** Leaving a crashed server in the pool this long counts as a mistake (users saw errors). */
export const UNHANDLED_MS = 7000;

export type SrvState = 'up' | 'dead' | 'paused';
export interface Srv {
  name: string;
  state: SrvState;
  inPool: boolean;
  lastBeat: number;
  nextBeat: number;
  beats: number[];
  pauseUntil: number;
  diedAt: number | null;
  evictedAt: number | null;
  replaceAt: number | null;
  /** True once a crash left in the pool too long has been reported. */
  overdue: boolean;
}

export interface ScheduledEvent { at: number; kind: 'crash' | 'pause'; server: number; ms: number }
export type HbEvent = { type: 'crash' | 'pause' | 'resume' | 'replaced' | 'overdue'; server: number };

export interface State {
  rng: Rng;
  now: number;
  servers: Srv[];
  schedule: ScheduledEvent[];
  evictedDead: number;
}

function mkSrv(i: number, now: number, rng: Rng): Srv {
  const phase = between(rng, 0, BEAT_MS);
  return { name: NAMES[i], state: 'up', inPool: true, lastBeat: now - BEAT_MS + phase, nextBeat: now + phase, beats: [], pauseUntil: 0, diedAt: null, evictedAt: null, replaceAt: null, overdue: false };
}

/** Task 0: web-3 has already crashed. Task 1: three crashes and two GC pauses on other servers. */
export function create(task: number, rng: Rng): State {
  const s: State = { rng, now: 0, servers: [], schedule: [], evictedDead: 0 };
  s.servers = NAMES.map((_, i) => mkSrv(i, 0, rng));
  // Warm up 6 s of heartbeats so the timelines are full.
  s.now = -6000;
  s.servers.forEach((srv) => { srv.lastBeat = -6000; srv.nextBeat = -6000 + between(rng, 0, BEAT_MS); });
  step(s, 6000);
  if (task === 0) {
    s.schedule = [{ at: 10, kind: 'crash', server: 2, ms: 0 }];
    step(s, 2500);
  }
  if (task === 1) {
    const order = shuffle(rng, [0, 1, 2, 3, 4]);
    s.schedule = [
      { at: s.now + 2500, kind: 'crash', server: order[0], ms: 0 },
      { at: s.now + 5000, kind: 'pause', server: order[1], ms: 1200 },
      { at: s.now + 8000, kind: 'crash', server: order[2], ms: 0 },
      { at: s.now + 10500, kind: 'pause', server: order[3], ms: 1600 },
      { at: s.now + 13500, kind: 'crash', server: order[4], ms: 0 },
    ];
  }
  return s;
}

/** How long a server has been silent. */
export const silence = (s: State, i: number): number => s.now - s.servers[i].lastBeat;

export function step(s: State, dt: number): HbEvent[] {
  const ev: HbEvent[] = [];
  const end = s.now + dt;
  while (s.now < end) {
    s.now = Math.min(end, s.now + 20);
    for (const e of s.schedule) {
      if (e.at > s.now - 20 && e.at <= s.now) {
        const srv = s.servers[e.server];
        if (e.kind === 'crash' && srv.state !== 'dead') {
          srv.state = 'dead';
          srv.diedAt = s.now;
          ev.push({ type: 'crash', server: e.server });
        } else if (e.kind === 'pause' && srv.state === 'up') {
          srv.state = 'paused';
          srv.pauseUntil = s.now + e.ms;
          ev.push({ type: 'pause', server: e.server });
        }
      }
    }
    s.servers.forEach((srv, i) => {
      if (srv.state === 'paused' && s.now >= srv.pauseUntil) {
        srv.state = 'up';
        srv.nextBeat = s.now;
        ev.push({ type: 'resume', server: i });
      }
      if (srv.state === 'up' && s.now >= srv.nextBeat) {
        srv.lastBeat = s.now;
        srv.beats.push(s.now);
        if (srv.beats.length > 40) srv.beats.shift();
        srv.nextBeat = s.now + BEAT_MS * between(s.rng, 0.92, 1.08);
      }
      if (srv.state === 'dead' && srv.inPool && !srv.overdue && srv.diedAt !== null && s.now - srv.diedAt > UNHANDLED_MS) {
        srv.overdue = true;
        ev.push({ type: 'overdue', server: i });
      }
      if (srv.replaceAt !== null && s.now >= srv.replaceAt) {
        // A fresh server boots with the same name, outside the pool until someone adds it.
        srv.replaceAt = null;
        srv.state = 'up';
        srv.diedAt = null;
        srv.overdue = false;
        srv.lastBeat = s.now;
        srv.nextBeat = s.now;
        ev.push({ type: 'replaced', server: i });
      }
    });
  }
  return ev;
}

export type ToggleResult =
  | { kind: 'evicted-dead'; detectMs: number }
  | { kind: 'evicted-paused' }
  | { kind: 'evicted-healthy' }
  | { kind: 'returned' }
  | { kind: 'still-booting' };

/** The student clicks a server: evict it from the pool, or return it. */
export function toggle(s: State, i: number): ToggleResult {
  const srv = s.servers[i];
  if (!srv.inPool) {
    if (srv.state === 'dead') return { kind: 'still-booting' };
    srv.inPool = true;
    return { kind: 'returned' };
  }
  srv.inPool = false;
  srv.evictedAt = s.now;
  if (srv.state === 'dead') {
    s.evictedDead++;
    srv.replaceAt = s.now + REPLACE_MS;
    return { kind: 'evicted-dead', detectMs: s.now - (srv.diedAt ?? s.now) };
  }
  return srv.state === 'paused' ? { kind: 'evicted-paused' } : { kind: 'evicted-healthy' };
}

export const CRASHES_TO_CATCH = 3;
export const byHandDone = (s: State): boolean => s.evictedDead >= CRASHES_TO_CATCH;

// ---------- tasks 2–3: automatic detector ----------
export const INTERVALS = [500, 1000, 2000] as const;
export const THRESHOLDS = [1, 2, 3, 5] as const;
export const DETECT_GOAL_MS = 5000;
/** The test scenario: two GC pauses on healthy servers, then one real crash. */
export const SCENARIO = { pauses: [{ server: 1, at: 5000, ms: 1500 }, { server: 3, at: 9000, ms: 2400 }], crash: { server: 0, at: 15000 }, end: 30000 };

export interface RunResult { interval: number; threshold: number; timeout: number; falseEvictions: number[]; detectMs: number | null; beats: number[][]; evictions: { server: number; at: number; false: boolean }[] }

/** Runs the scenario with a detector that evicts a server after `threshold` missed heartbeats. */
export function runDetector(interval: number, threshold: number): RunResult {
  const timeout = interval * threshold;
  const beats: number[][] = Array.from({ length: N }, () => []);
  const last = Array(N).fill(0);
  const evicted = Array(N).fill(false);
  const evictions: RunResult['evictions'] = [];
  for (let t = 0; t <= SCENARIO.end; t += 10) {
    for (let i = 0; i < N; i++) {
      const p = SCENARIO.pauses.find((x) => x.server === i && t >= x.at && t < x.at + x.ms);
      const dead = i === SCENARIO.crash.server && t >= SCENARIO.crash.at;
      if (!p && !dead && t % interval === 0) {
        beats[i].push(t);
        last[i] = t;
      }
      if (!evicted[i] && t - last[i] >= timeout) {
        evicted[i] = true;
        evictions.push({ server: i, at: t, false: !dead });
      }
    }
  }
  const crashEv = evictions.find((e) => e.server === SCENARIO.crash.server && !e.false);
  return {
    interval, threshold, timeout,
    falseEvictions: evictions.filter((e) => e.false).map((e) => e.server),
    detectMs: crashEv ? crashEv.at - SCENARIO.crash.at : null,
    beats, evictions,
  };
}

export const START_CONFIG: Record<number, { interval: number; threshold: number }> = { 2: { interval: 500, threshold: 1 }, 3: { interval: 2000, threshold: 5 } };
export const detectorOk = (task: number, r: RunResult): boolean =>
  r.falseEvictions.length === 0 && r.detectMs !== null && (task === 2 || r.detectMs <= DETECT_GOAL_MS);
