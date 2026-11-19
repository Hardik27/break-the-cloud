/**
 * Traffic Cop: a load balancer in front of three servers. Pure simulation, no DOM.
 *
 * Each server holds CAP units of work. A light request needs 1 unit, a heavy one 3.
 * A request sent to a full or dead server is dropped (a user sees an error).
 * Servers can be pulled out of rotation (the balancer stops sending them traffic) and returned.
 *
 * Stages map 1:1 to tasks:
 *   0 tutorial       requests arrive only when the game injects them; no timeouts
 *   1 rush hour      student clicks a server for each request
 *   2 health check   round robin autopilot; servers crash; student pulls dead ones and returns them
 *   3 heavy hitters  round robin hesitates on heavy requests; student overrides it
 *   4 boss wave      student picks the algorithm; a crash makes least-loaded dump on the dead server
 */
import { between, type Rng } from '../../lib/rng';

export type Strategy = 'manual' | 'rr' | 'least';
export interface Job { size: number; end: number }
export interface Server { name: string; up: boolean; inRotation: boolean; jobs: Job[]; downUntil: number | null }
export interface Req { size: number; dur: number; born: number; heavy: boolean }
export interface Crash { server: number; at: number; downFor: number; done: boolean }

export interface StageCfg {
  arrivalMs: number;
  heavyP: number;
  /** Optional per-request heavy probability, cycling by arrival number (overrides heavyP). */
  pattern?: number[];
  lightMs: number;
  heavyMs: number;
  timeoutMs: number;
  goal: number;
  /** 'streak': requests in a row; 'heavy': heavy requests in a row (any drop resets). */
  goalKind: 'streak' | 'heavy';
  /** Heavy requests wait this long before the autopilot routes them (stage 3: time to override). */
  holdHeavyMs: number;
}

export const CAP = 4;
export const HEAVY = 3;
export const STAGES: StageCfg[] = [
  { arrivalMs: 0, heavyP: 0, lightMs: 8000, heavyMs: 8000, timeoutMs: Infinity, goal: 3, goalKind: 'streak', holdHeavyMs: 0 },
  { arrivalMs: 1150, heavyP: 0.4, lightMs: 2400, heavyMs: 3600, timeoutMs: 3200, goal: 8, goalKind: 'streak', holdHeavyMs: 0 },
  { arrivalMs: 480, heavyP: 0, lightMs: 1800, heavyMs: 3400, timeoutMs: 2500, goal: 15, goalKind: 'streak', holdHeavyMs: 0 },
  { arrivalMs: 650, heavyP: 0.35, pattern: [0.1, 0.1, 0.85], lightMs: 1100, heavyMs: 3400, timeoutMs: 2500, goal: 5, goalKind: 'heavy', holdHeavyMs: 1500 },
  { arrivalMs: 650, heavyP: 0.35, pattern: [0.1, 0.1, 0.85], lightMs: 1100, heavyMs: 3400, timeoutMs: 2500, goal: 15, goalKind: 'streak', holdHeavyMs: 0 },
];
export const LAST_STAGE = STAGES.length - 1;

export type SimEvent =
  | { type: 'served'; server: number; heavy: boolean; manual: boolean }
  | { type: 'drop'; why: string; server: number | null; heavy: boolean }
  | { type: 'crash'; server: number }
  | { type: 'recover'; server: number }
  | { type: 'goal'; stage: number };

export interface State {
  rng: Rng;
  now: number;
  stage: number;
  servers: Server[];
  queue: Req | null;
  /** True while requests arrive on their own. */
  arriving: boolean;
  nextArr: number;
  strategy: Strategy;
  rr: number;
  arrivals: number;
  streak: number;
  heavyStreak: number;
  /** Requests dropped since the stage started. */
  drops: number;
  /** Recent outcomes, newest last (true = served). */
  results: boolean[];
  crashes: Crash[];
  stageDone: boolean;
}

export const STRATEGY_NAMES: Record<Strategy, string> = { manual: 'by hand', rr: 'round robin', least: 'least loaded' };

export function create(rng: Rng): State {
  const s: State = {
    rng, now: 0, stage: 0, servers: [], queue: null, arriving: false, nextArr: 0, strategy: 'manual',
    rr: 0, arrivals: 0, streak: 0, heavyStreak: 0, drops: 0, results: [], crashes: [], stageDone: false,
  };
  enterStage(s, 0);
  return s;
}

export const load = (srv: Server): number => srv.jobs.reduce((a, j) => a + j.size, 0);
export const free = (srv: Server): number => (srv.up ? CAP - load(srv) : 0);
export const progress = (s: State): number => (STAGES[s.stage].goalKind === 'heavy' ? s.heavyStreak : s.streak);
/** True once every crash planned for this stage has happened (the goal only counts after that). */
export const crashesOver = (s: State): boolean => s.crashes.every((c) => c.done);

export function enterStage(s: State, stage: number): void {
  s.stage = stage;
  s.servers = [0, 1, 2].map((i) => ({ name: `web-${i + 1}`, up: true, inRotation: true, jobs: [], downUntil: null }));
  s.queue = null;
  s.streak = 0;
  s.heavyStreak = 0;
  s.drops = 0;
  s.crashes = [];
  s.stageDone = false;
  s.rr = 0;
  s.arrivals = 0;
  s.strategy = stage >= 3 ? 'rr' : 'manual';
  // Stage 2 waits for the student to switch on round robin; the others start straight away.
  s.arriving = stage === 1 || stage >= 3;
  s.nextArr = s.now + 1500;
  if (stage === 4) s.crashes = [{ server: 0, at: s.now + 7000, downFor: 6000, done: false }];
}

/** Put one request in the queue (the tutorial uses this). */
export function inject(s: State, heavy: boolean): void {
  const cfg = STAGES[s.stage];
  s.queue = { size: heavy ? HEAVY : 1, dur: heavy ? cfg.heavyMs : cfg.lightMs, born: s.now, heavy };
}

function newReq(s: State): Req {
  const cfg = STAGES[s.stage];
  const p = cfg.pattern ? cfg.pattern[s.arrivals % cfg.pattern.length] : cfg.heavyP;
  s.arrivals++;
  const heavy = s.rng() < p;
  return { size: heavy ? HEAVY : 1, dur: heavy ? cfg.heavyMs : cfg.lightMs, born: s.now, heavy };
}

/** Which server the current algorithm would choose, without moving the round-robin pointer. -1 for manual. */
export function peek(s: State): number {
  const n = s.servers.length;
  if (s.strategy === 'rr') {
    for (let k = 0; k < n; k++) {
      const i = (s.rr + k) % n;
      if (s.servers[i].inRotation) return i;
    }
    return s.rr;
  }
  if (s.strategy === 'least') {
    // A dead server has no jobs, so it looks like the least loaded one. Only rotation protects it.
    let best = -1, bl = Infinity;
    s.servers.forEach((srv, i) => {
      if (!srv.inRotation) return;
      const l = load(srv);
      if (l < bl) { bl = l; best = i; }
    });
    return best < 0 ? 0 : best;
  }
  return -1;
}

/** Like peek, but advances round robin. */
export function pick(s: State): number {
  const i = peek(s);
  if (s.strategy === 'rr' && i >= 0) s.rr = (i + 1) % s.servers.length;
  return i;
}

function record(s: State, ok: boolean, heavy: boolean, events: SimEvent[]): void {
  s.results.push(ok);
  if (s.results.length > 80) s.results.shift();
  s.streak = ok ? s.streak + 1 : 0;
  if (!ok) {
    s.heavyStreak = 0;
    s.drops++;
  }
  else if (heavy) s.heavyStreak++;
  if (s.stage > 0 && !s.stageDone && progress(s) >= STAGES[s.stage].goal && crashesOver(s)) {
    s.stageDone = true;
    s.arriving = false;
    s.queue = null;
    events.push({ type: 'goal', stage: s.stage });
  }
}

/** Send the waiting request to server i. manual = the student clicked. */
export function route(s: State, i: number, manual = true): SimEvent[] {
  const events: SimEvent[] = [];
  const q = s.queue;
  if (!q) return events;
  s.queue = null;
  const srv = s.servers[i];
  const success = srv.up && load(srv) + q.size <= CAP;
  if (success) {
    srv.jobs.push({ size: q.size, end: s.now + q.dur });
    events.push({ type: 'served', server: i, heavy: q.heavy, manual });
  } else {
    events.push({ type: 'drop', why: srv.up ? `${srv.name} was full` : `${srv.name} is down`, server: i, heavy: q.heavy });
  }
  record(s, success, q.heavy, events);
  return events;
}

export function setStrategy(s: State, k: Strategy): void {
  s.strategy = k;
  s.streak = 0;
  s.heavyStreak = 0;
  if (s.stage === 2 && k === 'rr' && !s.arriving && !s.stageDone) {
    s.arriving = true;
    s.nextArr = s.now + 300;
    const c1 = s.now + between(s.rng, 2500, 3500);
    const c2 = c1 + 8000 + between(s.rng, 2500, 3500);
    s.crashes = [
      { server: 1, at: c1, downFor: 8000, done: false },
      { server: 2, at: c2, downFor: 8000, done: false },
    ];
  }
}

export type RotationResult = 'pulled-dead' | 'pulled-healthy' | 'returned' | 'returned-dead';

/** Pull a server out of rotation, or return it. */
export function toggleRotation(s: State, i: number): RotationResult {
  const srv = s.servers[i];
  srv.inRotation = !srv.inRotation;
  if (!srv.inRotation) return srv.up ? 'pulled-healthy' : 'pulled-dead';
  return srv.up ? 'returned' : 'returned-dead';
}

/** Advance time by dt ms. */
export function step(s: State, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  s.now += dt;
  for (const srv of s.servers) srv.jobs = srv.jobs.filter((j) => j.end > s.now);
  for (const c of s.crashes) {
    if (!c.done && s.now >= c.at) {
      c.done = true;
      const srv = s.servers[c.server];
      srv.up = false;
      srv.jobs = [];
      srv.downUntil = s.now + c.downFor;
      events.push({ type: 'crash', server: c.server });
    }
  }
  s.servers.forEach((srv, i) => {
    if (!srv.up && srv.downUntil !== null && s.now >= srv.downUntil) {
      srv.up = true;
      srv.downUntil = null;
      events.push({ type: 'recover', server: i });
    }
  });
  if (s.arriving && !s.queue && s.now >= s.nextArr) {
    s.queue = newReq(s);
    s.nextArr = s.now + STAGES[s.stage].arrivalMs;
  }
  const q = s.queue;
  if (q && s.stage > 0) {
    const cfg = STAGES[s.stage];
    if (s.strategy !== 'manual') {
      const hold = q.heavy ? cfg.holdHeavyMs : 0;
      if (s.now - q.born >= hold) events.push(...route(s, pick(s), false));
    } else if (s.now - q.born > cfg.timeoutMs) {
      s.queue = null;
      events.push({ type: 'drop', why: 'it timed out waiting for you', server: null, heavy: q.heavy });
      record(s, false, q.heavy, events);
    }
  }
  return events;
}

/** Index of the server with the most free space that fits the waiting request, or -1. */
export function bestFit(s: State): number {
  if (!s.queue) return -1;
  let best = -1, bf = -1;
  s.servers.forEach((srv, i) => {
    const f = free(srv);
    if (f >= s.queue!.size && f > bf) { bf = f; best = i; }
  });
  return best;
}

/** Milliseconds left before the autopilot routes a held heavy request (0 if not held). */
export function holdLeft(s: State): number {
  const q = s.queue;
  if (!q || !q.heavy || s.strategy === 'manual') return 0;
  return Math.max(0, STAGES[s.stage].holdHeavyMs - (s.now - q.born));
}
