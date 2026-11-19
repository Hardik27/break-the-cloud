/**
 * Autoscaler: adding and removing servers to match traffic. Pure simulation, no DOM.
 *
 * Each instance handles 100 requests per second at 100% CPU. New instances take 90 seconds to boot.
 *
 * Tasks:
 *   0 tutorial   add an instance; remove one
 *   1 by hand    the morning ramp (play time is sped up 30×): keep up without wasting money
 *   2 tracking   pick a target CPU for an automatic scaler over a working day
 *   3 spike      a flash sale triples traffic at noon, faster than instances can boot
 */
import { mulberry32 } from '../../lib/rng';

export const PER_INSTANCE = 100;
/** Play time is 30× faster than real time: 1 s of play = 30 s. */
export const SPEEDUP = 30;
export const BOOT_REAL_S = 90;
export const BOOT_MS = (BOOT_REAL_S / SPEEDUP) * 1000;

// ---------- tasks 0–1: by hand ----------
export const RAMP_MS = 30_000;
// Three instances give the player about 5 s of lead time: longer than one boot (3 s of play).
export const START_INSTANCES = 3;
export interface Manual {
  now: number;
  running: number;
  booting: number[];
  overloadMs: number;
  idleMs: number;
  instanceMs: number;
  frozen: boolean;
  done: boolean;
}
/** Requests per second at play time t: a morning ramp from 150 to 900, with small wobbles. */
export const rampDemand = (t: number): number => Math.round(150 + (750 * Math.min(1, t / RAMP_MS)) + 25 * Math.sin(t / 900));
export const capacity = (m: Manual): number => m.running * PER_INSTANCE;
export const cpu = (m: Manual): number => rampDemand(m.now) / Math.max(1, capacity(m));

export function createManual(task: number): Manual {
  return { now: 0, running: START_INSTANCES, booting: [], overloadMs: 0, idleMs: 0, instanceMs: 0, frozen: task === 0, done: false };
}

export type ManualEvent = { type: 'ready' } | { type: 'overload-second' } | { type: 'idle-second' } | { type: 'done' };

export function stepManual(m: Manual, dt: number): ManualEvent[] {
  const ev: ManualEvent[] = [];
  if (m.done) return ev;
  const end = m.now + dt;
  while (m.now < end) {
    const h = Math.min(20, end - m.now);
    // A frozen (tutorial) fleet keeps its clock still; only finishes instant boots.
    if (m.frozen) {
      if (m.booting.length) {
        m.running += m.booting.length;
        m.booting = [];
        ev.push({ type: 'ready' });
      }
      break;
    }
    m.now += h;
    for (let i = m.booting.length - 1; i >= 0; i--) {
      if (m.now >= m.booting[i]) {
        m.booting.splice(i, 1);
        m.running++;
        ev.push({ type: 'ready' });
      }
    }
    m.instanceMs += h * (m.running + m.booting.length);
    const c = cpu(m);
    if (c > 1) {
      const before = Math.floor(m.overloadMs / 1000);
      m.overloadMs += h;
      if (Math.floor(m.overloadMs / 1000) > before) ev.push({ type: 'overload-second' });
    } else if (c < 0.35 && m.running > 1) {
      const before = Math.floor(m.idleMs / 1000);
      m.idleMs += h;
      if (Math.floor(m.idleMs / 1000) > before) ev.push({ type: 'idle-second' });
    }
    if (m.now >= RAMP_MS) {
      m.done = true;
      ev.push({ type: 'done' });
      break;
    }
  }
  return ev;
}

export function addInstance(m: Manual): { cpuBefore: number } {
  const cpuBefore = cpu(m);
  m.booting.push(m.now + (m.frozen ? 0 : BOOT_MS));
  return { cpuBefore };
}
export function removeInstance(m: Manual): { ok: boolean; cpuAfter: number } {
  if (m.running <= 1) return { ok: false, cpuAfter: cpu(m) };
  m.running--;
  return { ok: true, cpuAfter: cpu(m) };
}

// ---------- tasks 2–3: automatic scaling over a day (minute by minute) ----------
export const DAY_START_H = 8;
export const DAY_MIN = 8 * 60;
export const BOOT_MIN = 2;
export const COOLDOWN_MIN = 5;
export const TARGETS = [40, 60, 80, 95] as const;
export const MINS = [2, 6, 12] as const;

/** Office-hours traffic with minute-to-minute noise; optionally a flash sale at 12:00 that triples it. */
export function dayTraffic(flashSale: boolean): number[] {
  const rng = mulberry32(777);
  const out: number[] = [];
  for (let m = 0; m < DAY_MIN; m++) {
    const h = m / 60;
    const base = h < 2 ? 200 + 300 * (h / 2) : h < 6 ? 500 + 60 * Math.sin(h * 1.7) : 500 - 150 * ((h - 6) / 2);
    let d = base * (1 + (rng() * 2 - 1) * 0.18);
    if (flashSale && m >= 240 && m < 270) d *= 3;
    out.push(Math.round(d));
  }
  return out;
}

export interface AutoOpts { target: number; min: number; prewarm: boolean }
export interface DayResult { overloadMin: number; instanceHours: number; cost: number; running: number[]; demand: number[]; cpu: number[] }
export const PRICE_PER_HOUR = 0.1;

export function runDay(o: AutoOpts, flashSale: boolean): DayResult {
  const demand = dayTraffic(flashSale);
  let running = Math.max(o.min, 3);
  let booting: number[] = [];
  let lowSince = -1;
  const runningLog: number[] = [];
  const cpuLog: number[] = [];
  let overload = 0;
  let instMin = 0;
  for (let t = 0; t < DAY_MIN; t++) {
    running += booting.filter((r) => r <= t).length;
    booting = booting.filter((r) => r > t);
    const d = demand[t];
    // Scheduled pre-warm for the known 12:00 sale: from 11:45 keep enough for 3× traffic.
    const floor = o.prewarm && t >= 225 && t < 270 ? Math.ceil((3 * 520) / (PER_INSTANCE * o.target / 100)) : o.min;
    const desired = Math.max(floor, Math.ceil(d / (PER_INSTANCE * (o.target / 100))));
    const pending = running + booting.length;
    if (desired > pending) for (let k = 0; k < desired - pending; k++) booting.push(t + BOOT_MIN);
    if (desired < running) {
      if (lowSince < 0) lowSince = t;
      if (t - lowSince >= COOLDOWN_MIN && running > floor) {
        running--;
        lowSince = t;
      }
    } else lowSince = -1;
    if (d > running * PER_INSTANCE) overload++;
    instMin += running + booting.length;
    runningLog.push(running);
    cpuLog.push(d / (running * PER_INSTANCE));
  }
  const instanceHours = instMin / 60;
  return { overloadMin: overload, instanceHours, cost: instanceHours * PRICE_PER_HOUR, running: runningLog, demand, cpu: cpuLog };
}

export const BUDGET_DAY = 7.5;
export const BUDGET_SALE = 10.5;
export const dayOk = (r: DayResult, sale: boolean): boolean => r.overloadMin === 0 && r.cost <= (sale ? BUDGET_SALE : BUDGET_DAY);
