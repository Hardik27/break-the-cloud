/**
 * Quorum: N replicas, writes to W of them, reads from R of them. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial    select a replica and send a write
 *   1 by hand     you are the coordinator: choose replicas for each write and read; replicas crash in between
 *   2 R and W     pick R and W so no read is ever stale
 *   3 one down    with one replica down, reads stay fresh and both reads and writes stay available
 */
import { mulberry32, shuffle } from '../../lib/rng';

export const N = 3;
export const NAMES = ['A', 'B', 'C'];
export const MS_PER_REPLICA = 20;

// ---------- tasks 0–1: by hand ----------
export interface Replica { version: number; value: number; up: boolean }
export interface Coord {
  round: number;
  phase: 'write' | 'read' | 'between';
  replicas: Replica[];
  selected: Set<number>;
  latest: number;
  lastRead: { value: number; fresh: boolean } | null;
  crashed: number | null;
  rounds: number;
  fresh: number;
  stale: number;
  latencyMs: number;
}
export const ROUNDS = 4;
/** Rounds in which a replica crashes between the write and the read. */
export const CRASH_ROUNDS = [1, 3];

export function createCoord(): Coord {
  return { round: 0, phase: 'write', replicas: NAMES.map(() => ({ version: 0, value: 0, up: true })), selected: new Set(), latest: 0, lastRead: null, crashed: null, rounds: ROUNDS, fresh: 0, stale: 0, latencyMs: 0 };
}
export const writeValue = (c: Coord): number => (c.round + 1) * 10;

export function toggleSelect(c: Coord, i: number): 'selected' | 'unselected' | 'down' {
  if (!c.replicas[i].up) return 'down';
  if (c.selected.has(i)) {
    c.selected.delete(i);
    return 'unselected';
  }
  c.selected.add(i);
  return 'selected';
}

/** Send the write to the selected replicas. Then, in crash rounds, one of the replicas you wrote to crashes. */
export function sendWrite(c: Coord): { ok: boolean; crashed: number | null } {
  if (c.phase !== 'write' || !c.selected.size) return { ok: false, crashed: null };
  c.latest++;
  for (const i of c.selected) c.replicas[i] = { version: c.latest, value: writeValue(c), up: true };
  c.latencyMs += c.selected.size * MS_PER_REPLICA;
  let crashed: number | null = null;
  if (CRASH_ROUNDS.includes(c.round)) {
    crashed = Math.min(...c.selected);
    c.replicas[crashed].up = false;
  }
  c.crashed = crashed;
  c.selected = new Set();
  c.phase = 'read';
  return { ok: true, crashed };
}

/** Read from the selected replicas: the answer is the newest version among them. */
export function sendRead(c: Coord): { value: number; fresh: boolean } | null {
  if (c.phase !== 'read' || !c.selected.size) return null;
  const best = [...c.selected].map((i) => c.replicas[i]).reduce((a, b) => (b.version > a.version ? b : a));
  const fresh = best.version === c.latest;
  c.latencyMs += c.selected.size * MS_PER_REPLICA;
  fresh ? c.fresh++ : c.stale++;
  c.lastRead = { value: best.value, fresh };
  c.selected = new Set();
  c.phase = 'between';
  return c.lastRead;
}

/** Next round: crashed replicas restart (they keep their data). */
export function nextRound(c: Coord): boolean {
  c.round++;
  c.replicas.forEach((r) => (r.up = true));
  c.crashed = null;
  c.phase = 'write';
  c.lastRead = null;
  return c.round < c.rounds;
}
export const coordDone = (c: Coord): boolean => c.round >= c.rounds;

// ---------- tasks 2–3: choose R and W ----------
export interface QuorumResult { stalePct: number; writeAvailPct: number; readAvailPct: number; latencyMs: number }
export const OPS = 600;
export const LATENCY_BUDGET_MS = 80;
export const RS = [1, 2, 3];
export const WS = [1, 2, 3];

/**
 * Run OPS writes and reads. Each write goes to W random live replicas; each read asks R random live replicas
 * and returns the newest version it sees. With oneDown, replica C is down for the first half and then comes
 * back with the writes it missed (it catches up only through later writes).
 */
export function runQuorum(r: number, w: number, oneDown: boolean): QuorumResult {
  const rng = mulberry32(31337);
  const ver = Array(N).fill(0);
  let latest = 0, stale = 0, writesOk = 0, readsOk = 0;
  for (let k = 0; k < OPS; k++) {
    const live = oneDown && k < OPS / 2 ? [0, 1] : [0, 1, 2];
    if (w <= live.length) {
      latest++;
      for (const i of shuffle(rng, [...live]).slice(0, w)) ver[i] = latest;
      writesOk++;
    }
    if (r <= live.length) {
      readsOk++;
      const got = Math.max(...shuffle(rng, [...live]).slice(0, r).map((i) => ver[i]));
      if (got < latest) stale++;
    }
  }
  return { stalePct: readsOk ? (100 * stale) / readsOk : 0, writeAvailPct: (100 * writesOk) / OPS, readAvailPct: (100 * readsOk) / OPS, latencyMs: (r + w) * MS_PER_REPLICA };
}
export const freshOk = (q: QuorumResult): boolean => q.stalePct === 0 && q.writeAvailPct === 100 && q.readAvailPct === 100;

/** Task 2: no stale reads with all replicas up, within the latency budget. */
export function checkFresh(r: number, w: number): { ok: boolean; q: QuorumResult; why: string } {
  const q = runQuorum(r, w, false);
  if (q.stalePct > 0) return { ok: false, q, why: `${q.stalePct.toFixed(0)}% of reads were stale. A read set of ${r} and a write set of ${w} can miss each other: R + W = ${r + w}, not more than ${N}.` };
  if (q.latencyMs > LATENCY_BUDGET_MS) return { ok: false, q, why: `No stale reads, but each write plus read waits for ${r + w} replicas: ${q.latencyMs} ms, over the ${LATENCY_BUDGET_MS} ms budget. Ask fewer replicas.` };
  return { ok: true, q, why: '' };
}

/** Task 3: one replica down for half the run, then back. Fresh reads, and every read and write still succeeds. */
export function checkOneDown(r: number, w: number): { ok: boolean; q: QuorumResult; why: string } {
  const q = runQuorum(r, w, true);
  if (q.writeAvailPct < 100) return { ok: false, q, why: `With C down only 2 replicas answer, so writes that need ${w} failed (${(100 - q.writeAvailPct).toFixed(0)}% of them).` };
  if (q.readAvailPct < 100) return { ok: false, q, why: `With C down only 2 replicas answer, so reads that need ${r} failed (${(100 - q.readAvailPct).toFixed(0)}% of them).` };
  if (q.stalePct > 0) return { ok: false, q, why: `${q.stalePct.toFixed(0)}% of reads were stale: when C came back it was missing writes, and R + W = ${r + w} is not more than ${N}, so a read could land only on old copies.` };
  return { ok: true, q, why: '' };
}
