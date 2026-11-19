/**
 * Circuit Breaker: stop calling a failing dependency. Pure simulation, no DOM.
 *
 * The shop page calls a recommendations service. A healthy call takes 100 ms; when the service is down,
 * each call hangs until a 5 s timeout, holding one of the web server's 20 threads. When every thread
 * is stuck, the whole page goes down. A call slower than 500 ms counts as failed (slow-call detection).
 * An OPEN breaker skips the call (the page shows no recommendations).
 *
 * Tasks:
 *   0 tutorial   open the breaker; probe the service
 *   1 by hand    you are the breaker: two outages in 30 s
 *   2 threshold  how many failures in a row open the breaker
 *   3 probe      how often an open breaker tests whether the service is back
 */
export const THREADS = 20;
export const PAGES_PER_S = 6;
export const OK_MS = 100;
export const TIMEOUT_MS = 5000;
export const SLOW_MS = 500;
/** After the service recovers, the breaker may stay open this long before it counts as lost features. */
export const CLOSE_GRACE_MS = 4000;

// ---------- tasks 0–1: by hand ----------
export const BY_HAND_MS = 30_000;
export const OUTAGES: [number, number][] = [[4000, 12000], [18000, 25000]];
export interface Manual {
  now: number;
  open: boolean;
  calls: { end: number; ok: boolean; failAt: number; counted: boolean }[];
  results: { t: number; ok: boolean }[];
  nextPage: number;
  pageDownMs: number;
  lostMs: number;
  probe: { t: number; ok: boolean } | null;
  frozen: boolean;
  done: boolean;
}
export const createManual = (task: number): Manual => ({ now: 0, open: false, calls: [], results: [], nextPage: 0, pageDownMs: 0, lostMs: 0, probe: null, frozen: task === 0, done: false });
export const serviceUp = (m: Manual): boolean => !OUTAGES.some(([a, b]) => m.now >= a && m.now < b);
export const threadsBusy = (m: Manual): number => m.calls.length;
/** Share of recommendation calls in the last 2 s that failed (or ran slower than 500 ms). */
export const errorRate = (m: Manual): number => {
  const r = m.results.filter((x) => m.now - x.t < 2000);
  return r.length ? r.filter((x) => !x.ok).length / r.length : 0;
};

export type ManualEvent = { type: 'down-second' } | { type: 'lost-second' } | { type: 'done' } | { type: 'outage-start' } | { type: 'recovered' };

export function stepManual(m: Manual, dt: number): ManualEvent[] {
  const ev: ManualEvent[] = [];
  if (m.frozen || m.done) return ev;
  const end = m.now + dt;
  while (m.now < end) {
    const h = Math.min(20, end - m.now);
    const wasUp = serviceUp(m);
    m.now += h;
    const up = serviceUp(m);
    if (wasUp && !up) ev.push({ type: 'outage-start' });
    if (!wasUp && up) ev.push({ type: 'recovered' });
    for (const c of m.calls) {
      if (!c.counted && (c.ok ? c.end <= m.now : c.failAt <= m.now)) {
        c.counted = true;
        m.results.push({ t: m.now, ok: c.ok });
      }
    }
    m.calls = m.calls.filter((c) => c.end > m.now);
    if (m.results.length > 200) m.results = m.results.slice(-100);
    while (m.now >= m.nextPage) {
      m.nextPage += 1000 / PAGES_PER_S;
      if (m.open) continue;
      if (m.calls.length >= THREADS) continue; // page request rejected: counted below
      m.calls.push(up ? { end: m.now + OK_MS, ok: true, failAt: Infinity, counted: false } : { end: m.now + TIMEOUT_MS, ok: false, failAt: m.now + SLOW_MS, counted: false });
    }
    if (m.calls.length >= THREADS) {
      const b = Math.floor(m.pageDownMs / 1000);
      m.pageDownMs += h;
      if (Math.floor(m.pageDownMs / 1000) > b) ev.push({ type: 'down-second' });
    }
    const lastRecovery = OUTAGES.map(([, b]) => b).filter((b) => b <= m.now).pop() ?? -Infinity;
    if (m.open && up && m.now - lastRecovery > CLOSE_GRACE_MS && !OUTAGES.some(([a]) => a > lastRecovery && a <= m.now)) {
      const b = Math.floor(m.lostMs / 1000);
      m.lostMs += h;
      if (Math.floor(m.lostMs / 1000) > b) ev.push({ type: 'lost-second' });
    }
    if (m.now >= BY_HAND_MS) {
      m.done = true;
      ev.push({ type: 'done' });
      break;
    }
  }
  return ev;
}
export function toggle(m: Manual): boolean {
  m.open = !m.open;
  return m.open;
}
/** A single test call. */
export function probe(m: Manual): boolean {
  const ok = serviceUp(m);
  m.probe = { t: m.now, ok };
  return ok;
}

// ---------- tasks 2–3: an automatic breaker ----------
export const AUTO_MS = 120_000;
export const AUTO_OUTAGE: [number, number] = [40_000, 61_000];
export const THRESHOLDS = [1, 5, 50] as const;
export const PROBES_S = [1, 5, 30, 60] as const;
export const PROBE_BUDGET = 10;
export const RECOVERY_GOAL_MS = 6000;

export interface AutoResult { pageDownMs: number; falseOpens: number; probesInOutage: number; recoveryMs: number; openSpans: [number, number][] }

/** A rare blip: about 1 healthy call in 40 fails anyway (a deterministic pattern so runs are repeatable). */
const blip = (i: number) => (i * 2654435761) % 40 === 0;

export function runAuto(threshold: number, probeS: number): AutoResult {
  let state = 'closed' as 'closed' | 'open';
  let fails = 0, lastProbe = 0, pageDown = 0, falseOpens = 0, probes = 0, recoveredAt = -1, openedAt = 0;
  let calls: { end: number; ok: boolean; failAt: number; counted: boolean }[] = [];
  const spans: [number, number][] = [];
  let callNo = 0;
  const up = (t: number) => t < AUTO_OUTAGE[0] || t >= AUTO_OUTAGE[1];
  for (let t = 0; t < AUTO_MS; t += 20) {
    for (const c of calls) {
      if (c.counted || (c.ok ? c.end > t : c.failAt > t)) continue;
      c.counted = true;
      if (state !== 'closed') continue;
      if (c.ok) fails = 0;
      else if (++fails >= threshold) {
        state = 'open';
        openedAt = t;
        lastProbe = t;
        if (up(t)) falseOpens++;
      }
    }
    calls = calls.filter((c) => c.end > t);
    if (t % 160 === 0 && state === 'closed' && calls.length < THREADS) {
      const ok = up(t) && !blip(callNo++);
      calls.push({ end: t + (ok ? OK_MS : TIMEOUT_MS), ok, failAt: ok ? Infinity : t + SLOW_MS, counted: false });
    }
    if (state === 'open' && t - lastProbe >= probeS * 1000) {
      lastProbe = t;
      if (!up(t)) probes++;
      if (up(t)) {
        state = 'closed';
        fails = 0;
        spans.push([openedAt, t]);
        if (t >= AUTO_OUTAGE[1] && recoveredAt < 0) recoveredAt = t;
      }
    }
    if (calls.length >= THREADS) pageDown += 20;
  }
  if (state === 'open') spans.push([openedAt, AUTO_MS]);
  return { pageDownMs: pageDown, falseOpens, probesInOutage: probes, recoveryMs: recoveredAt < 0 ? Infinity : recoveredAt - AUTO_OUTAGE[1], openSpans: spans };
}
export const thresholdOk = (r: AutoResult): boolean => r.pageDownMs === 0 && r.falseOpens === 0;
export const probeOk = (r: AutoResult): boolean => thresholdOk(r) && r.probesInOutage <= PROBE_BUDGET && r.recoveryMs <= RECOVERY_GOAL_MS;
