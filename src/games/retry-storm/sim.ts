/**
 * Retry Storm: retries, backoff and jitter. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial   send two queued retries
 *   1 pacing     a recovering API takes only a few requests per second: send 12 retries without overloading it
 *   2 backoff    choose a retry policy that does not multiply load during an outage
 *   3 jitter     break the synchronized retry waves
 */
import { mulberry32 } from '../../lib/rng';

// ---------- tasks 0–1: pacing by hand ----------
export const PACE_RETRIES = 12;
export interface Pace {
  now: number;
  attempts: number[];
  sent: number;
  failed: number;
  frozen: boolean;
}
export const createPace = (task: number): Pace => ({ now: 0, attempts: [], sent: 0, failed: 0, frozen: task === 0 });
/** The API is recovering: it can take 1 request per second at first, rising to 3 per second over 15 s. */
export const paceCapacity = (p: Pace): number => (p.frozen ? 99 : 1 + 2 * Math.min(1, p.now / 15000));
export const loadLastSecond = (p: Pace): number => p.attempts.filter((t) => p.now - t < 1000).length;
export function stepPace(p: Pace, dt: number): void {
  if (!p.frozen) p.now += dt;
}
/** Send one retry. Every attempt adds load, even the ones that fail. */
export function send(p: Pace): 'ok' | 'overloaded' {
  const ok = loadLastSecond(p) + 1 <= paceCapacity(p);
  p.attempts.push(p.now);
  if (ok) p.sent++;
  else p.failed++;
  return ok ? 'ok' : 'overloaded';
}
export const paceDone = (p: Pace): boolean => p.sent >= PACE_RETRIES;

// ---------- tasks 2–3: policies under an outage ----------
export type Policy = 'immediate' | 'fixed' | 'exponential';
export const POLICIES: Policy[] = ['immediate', 'fixed', 'exponential'];
export const CLIENTS = 100;
export const CAPACITY = 150;
export const OUTAGE_CAPACITY = 20;
export const OUTAGE = [5000, 15000] as const;
export const SIM_MS = 25_000;
export const TICK = 100;
export const THINK_MS = 1000;
export const MAX_ATTEMPTS = 7;
const PER_TICK = (cap: number) => (cap * TICK) / 1000;

export interface StormResult {
  /** Attempts per second, and the API's capacity per second. */
  loadPerSec: number[];
  capPerSec: number[];
  /** Average load during the outage, as a multiple of normal traffic (100 per second). */
  outageLoad: number;
  /** Busiest 100 ms after the outage ends, as a multiple of what the API can take in 100 ms. */
  peakAfter: number;
  errorsPct: number;
}

export function retryDelay(policy: Policy, attempt: number, jitter: boolean, r: number): number {
  const base = policy === 'immediate' ? TICK : policy === 'fixed' ? 1000 : 500 * 2 ** (attempt - 1);
  // "Equal jitter": half the backoff, plus a random part of the other half.
  return jitter ? Math.max(TICK, Math.round((base / 2 + (base / 2) * r) / TICK) * TICK) : base;
}

/**
 * 100 clients: each sends a request, waits for the answer, thinks for 1 s, repeats (normal load ≈ 100/s).
 * At 5 s the API crashes: every open connection drops at once, then it serves only 20/s until 15 s.
 * Failed requests are retried per the policy, up to 7 attempts, then reported as errors.
 */
export function storm(policy: Policy, jitter: boolean): StormResult {
  const rng = mulberry32(2024);
  const clients = Array.from({ length: CLIENTS }, (_, i) => ({ next: (i % 10) * TICK, attempt: 0 }));
  const secs = SIM_MS / 1000;
  const loadPerSec = Array(secs).fill(0);
  let requests = 0, errors = 0, peakAfter = 0, outageAttempts = 0;
  for (let t = 0; t < SIM_MS; t += TICK) {
    if (t === OUTAGE[0]) {
      // The crash drops every connection at the same instant.
      for (const c of clients) {
        c.attempt = 1;
        c.next = t + retryDelay(policy, 1, jitter, rng());
      }
      continue;
    }
    const due = clients.filter((c) => c.next <= t);
    for (let i = due.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [due[i], due[j]] = [due[j], due[i]]; }
    const cap = PER_TICK(t >= OUTAGE[0] && t < OUTAGE[1] ? OUTAGE_CAPACITY : CAPACITY);
    loadPerSec[Math.floor(t / 1000)] += due.length;
    if (t >= OUTAGE[0] + 1000 && t < OUTAGE[1]) outageAttempts += due.length;
    if (t >= OUTAGE[1]) peakAfter = Math.max(peakAfter, due.length / cap);
    due.forEach((c, i) => {
      if (c.attempt === 0) requests++;
      if (i < cap) {
        c.attempt = 0;
        c.next = t + THINK_MS;
        return;
      }
      c.attempt++;
      if (c.attempt >= MAX_ATTEMPTS) {
        errors++;
        c.attempt = 0;
        c.next = t + THINK_MS;
      } else c.next = t + retryDelay(policy, c.attempt, jitter, rng());
    });
  }
  const capPerSec = loadPerSec.map((_, s) => (s >= OUTAGE[0] / 1000 && s < OUTAGE[1] / 1000 ? OUTAGE_CAPACITY : CAPACITY));
  const outageSecs = (OUTAGE[1] - OUTAGE[0] - 1000) / 1000;
  return { loadPerSec, capPerSec, outageLoad: outageAttempts / outageSecs / CLIENTS, peakAfter, errorsPct: (100 * errors) / Math.max(1, requests) };
}

export const OUTAGE_LOAD_GOAL = 0.7;
export const PEAK_GOAL = 1.0;
export const backoffOk = (r: StormResult): boolean => r.outageLoad <= OUTAGE_LOAD_GOAL;
export const jitterOk = (r: StormResult): boolean => r.outageLoad <= OUTAGE_LOAD_GOAL && r.peakAfter <= PEAK_GOAL;
