/**
 * Traffic Cop: a load balancer in front of three servers. Pure simulation, no DOM.
 *
 * Each server holds CAP units of work. A light request needs 1 unit, a heavy one 3.
 * A request routed to a full or dead server is dropped (a user sees an error).
 *
 * Stages map 1:1 to tasks:
 *   0 tutorial      requests arrive only when the game injects them; no timeouts
 *   1 by hand       student clicks a server for each request
 *   2 round robin   student picks round robin; one server crashes; health checks fix it
 *   3 heavy mix     round robin drops heavy requests; least-loaded survives
 */
import { between, type Rng } from '../../lib/rng';

export type Strategy = 'manual' | 'rr' | 'least';
export interface Job { size: number; end: number }
export interface Server { name: string; up: boolean; jobs: Job[] }
export interface Req { size: number; dur: number; born: number; heavy: boolean }

export interface StageCfg {
  arrivalMs: number;
  heavyP: number;
  lightMs: number;
  heavyMs: number;
  timeoutMs: number;
  goal: number;
  /** Optional per-request heavy probability, cycling by arrival number (overrides heavyP). */
  pattern?: number[];
}

export const CAP = 4;
export const HEAVY = 3;
export const STAGES: StageCfg[] = [
  { arrivalMs: 0, heavyP: 0, lightMs: 8000, heavyMs: 8000, timeoutMs: Infinity, goal: 3 },
  { arrivalMs: 1000, heavyP: 0.35, lightMs: 1800, heavyMs: 3600, timeoutMs: 2500, goal: 10 },
  { arrivalMs: 520, heavyP: 0, lightMs: 1500, heavyMs: 3400, timeoutMs: 2500, goal: 15 },
  // A client sends a heavy report on most third calls: that rhythm lines up with round robin's cycle.
  { arrivalMs: 650, heavyP: 0.35, lightMs: 1100, heavyMs: 3400, timeoutMs: 2500, goal: 15, pattern: [0.1, 0.1, 0.85] },
];
export const LAST_STAGE = STAGES.length - 1;

export type SimEvent =
  | { type: 'served'; server: number; heavy: boolean }
  | { type: 'drop'; why: string; server: number | null }
  | { type: 'crash'; server: number }
  | { type: 'goal'; stage: number };

export interface State {
  rng: Rng;
  now: number;
  stage: number;
  servers: Server[];
  queue: Req | null;
  /** True while requests arrive on their own (false in the tutorial, before round robin is picked, and after a goal). */
  arriving: boolean;
  nextArr: number;
  strategy: Strategy;
  health: boolean;
  rr: number;
  /** Requests created in this stage. */
  arrivals: number;
  streak: number;
  /** Recent outcomes, newest last (true = served). */
  results: boolean[];
  crashAt: number | null;
  /** True once the stage's goal is met. */
  stageDone: boolean;
}

export const STRATEGY_NAMES: Record<Strategy, string> = { manual: 'by hand', rr: 'round robin', least: 'least loaded' };

export function create(rng: Rng): State {
  const s: State = {
    rng, now: 0, stage: 0, servers: [], queue: null, arriving: false, nextArr: 0, strategy: 'manual',
    health: false, rr: 0, arrivals: 0, streak: 0, results: [], crashAt: null, stageDone: false,
  };
  enterStage(s, 0);
  return s;
}

export const load = (srv: Server): number => srv.jobs.reduce((a, j) => a + j.size, 0);
export const free = (srv: Server): number => (srv.up ? CAP - load(srv) : 0);

/** Reset servers and counters for a stage. */
export function enterStage(s: State, stage: number): void {
  s.stage = stage;
  s.servers = [0, 1, 2].map((i) => ({ name: `web-${i + 1}`, up: true, jobs: [] }));
  s.queue = null;
  s.streak = 0;
  s.crashAt = null;
  s.stageDone = false;
  s.rr = 0;
  s.arrivals = 0;
  if (stage === 0) {
    s.strategy = 'manual';
    s.health = false;
    s.arriving = false;
  } else if (stage === 1) {
    s.strategy = 'manual';
    s.health = false;
    s.arriving = true;
    s.nextArr = s.now + 1500;
  } else if (stage === 2) {
    // Requests wait until the student switches on round robin.
    s.strategy = 'manual';
    s.health = false;
    s.arriving = false;
  } else {
    s.strategy = 'rr';
    s.health = true;
    s.arriving = true;
    s.nextArr = s.now + 1500;
  }
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

/** Which server would the current algorithm choose? -1 for manual. */
export function pick(s: State): number {
  const ok = (srv: Server) => !s.health || srv.up;
  const n = s.servers.length;
  if (s.strategy === 'rr') {
    for (let k = 0; k < n; k++) {
      const i = (s.rr + k) % n;
      if (ok(s.servers[i])) {
        s.rr = (i + 1) % n;
        return i;
      }
    }
    const i = s.rr;
    s.rr = (s.rr + 1) % n;
    return i;
  }
  if (s.strategy === 'least') {
    // Without health checks a dead server looks empty (load 0), so least-loaded sends everything there.
    let best = -1, bl = Infinity;
    s.servers.forEach((srv, i) => {
      if (!ok(srv)) return;
      const l = load(srv);
      if (l < bl) { bl = l; best = i; }
    });
    return best < 0 ? 0 : best;
  }
  return -1;
}

function record(s: State, ok: boolean, events: SimEvent[]): void {
  s.results.push(ok);
  if (s.results.length > 80) s.results.shift();
  s.streak = ok ? s.streak + 1 : 0;
  const goal = STAGES[s.stage].goal;
  if (s.stage > 0 && !s.stageDone && s.streak >= goal) {
    s.stageDone = true;
    s.arriving = false;
    s.queue = null;
    events.push({ type: 'goal', stage: s.stage });
  }
}

/** Send the waiting request to server i. */
export function route(s: State, i: number): SimEvent[] {
  const events: SimEvent[] = [];
  const q = s.queue;
  if (!q) return events;
  s.queue = null;
  const srv = s.servers[i];
  const success = srv.up && load(srv) + q.size <= CAP;
  if (success) {
    srv.jobs.push({ size: q.size, end: s.now + q.dur });
    events.push({ type: 'served', server: i, heavy: q.heavy });
  } else {
    events.push({ type: 'drop', why: srv.up ? `${srv.name} was full` : `${srv.name} is down`, server: i });
  }
  record(s, success, events);
  return events;
}

export function setStrategy(s: State, k: Strategy): void {
  s.strategy = k;
  s.streak = 0;
  if (s.stage === 2 && k === 'rr' && !s.arriving && !s.stageDone) {
    s.arriving = true;
    s.nextArr = s.now + 300;
    s.crashAt = s.now + between(s.rng, 3500, 5500);
  }
}

export function setHealth(s: State, on: boolean): void {
  s.health = on;
  s.streak = 0;
}

/** Advance time by dt ms. */
export function step(s: State, dt: number): SimEvent[] {
  const events: SimEvent[] = [];
  s.now += dt;
  for (const srv of s.servers) srv.jobs = srv.jobs.filter((j) => j.end > s.now);
  if (s.crashAt !== null && s.now >= s.crashAt) {
    s.crashAt = null;
    s.servers[1].up = false;
    s.servers[1].jobs = [];
    events.push({ type: 'crash', server: 1 });
  }
  if (s.arriving && !s.queue && s.now >= s.nextArr) {
    s.queue = newReq(s);
    s.nextArr = s.now + STAGES[s.stage].arrivalMs;
  }
  if (s.queue && s.stage > 0) {
    if (s.strategy !== 'manual') {
      events.push(...route(s, pick(s)));
    } else if (s.now - s.queue.born > STAGES[s.stage].timeoutMs) {
      s.queue = null;
      events.push({ type: 'drop', why: 'it timed out waiting for you', server: null });
      record(s, false, events);
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
