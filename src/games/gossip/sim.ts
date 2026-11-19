/**
 * Gossip: epidemic broadcast and gossip-based failure detection. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial   tell one node the rumour, end the round
 *   1 by hand    every informed node may tell one more node per round: reach all 16 (doubling → log2 N rounds)
 *   2 fanout     random gossip to 50 nodes: pick the fanout that reaches everyone fast within the message budget
 *   3 detect     watch gossiped heartbeats and mark the nodes that died, without accusing slow ones
 */
import { intBelow, mulberry32 } from '../../lib/rng';

// ---------- tasks 0–1: by hand ----------
export const MANUAL_N = 16;
export interface Manual { informed: boolean[]; round: number; slots: number; wasted: number }
export const createManual = (): Manual => ({ informed: Array.from({ length: MANUAL_N }, (_, i) => i === 0), round: 1, slots: 1, wasted: 0 });
export const informedCount = (m: Manual): number => m.informed.filter(Boolean).length;
export const manualDone = (m: Manual): boolean => informedCount(m) === MANUAL_N;

export function tell(m: Manual, i: number): 'ok' | 'known' | 'no-slots' {
  if (m.informed[i]) return 'known';
  if (m.slots <= 0) return 'no-slots';
  m.informed[i] = true;
  m.slots--;
  return 'ok';
}
/** End the round: every node that knows the rumour now gets one tell for the next round. */
export function nextRound(m: Manual): { wasted: number } {
  const wasted = manualDone(m) ? 0 : m.slots;
  m.wasted += wasted;
  m.round++;
  m.slots = informedCount(m);
  return { wasted };
}
/** Rounds needed with perfect coordination: ceil(log2 N). */
export const idealRounds = (n: number): number => Math.ceil(Math.log2(n));

// ---------- task 2: random gossip ----------
export const N = 50;
export const FANOUTS = [1, 2, 3, 4, 6];
export const ROUND_GOAL = 6;
export const RUNS = 100;
export const PASS_RUNS = 90;
export const BUDGET = 3;

/** Push gossip: each round, every informed node sends to f random other nodes. */
export function runGossip(n: number, f: number, seed: number): { perRound: number[]; rounds: number; msgs: number } {
  const rng = mulberry32(seed);
  const inf = new Uint8Array(n);
  inf[0] = 1;
  let cnt = 1, msgs = 0;
  const perRound = [1];
  while (cnt < n && perRound.length < 60) {
    const now = inf.slice();
    for (let i = 0; i < n; i++) {
      if (!now[i]) continue;
      for (let k = 0; k < f; k++) {
        let j = intBelow(rng, n - 1);
        if (j >= i) j++;
        msgs++;
        if (!inf[j]) { inf[j] = 1; cnt++; }
      }
    }
    perRound.push(cnt);
  }
  return { perRound, rounds: perRound.length - 1, msgs };
}

/** Order in which nodes learn the rumour in one run (for the animation): round number per node. */
export function infectionRounds(n: number, f: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const at = Array(n).fill(-1);
  at[0] = 0;
  let r = 0;
  while (at.includes(-1) && r < 60) {
    r++;
    const now = at.map((x) => x >= 0);
    for (let i = 0; i < n; i++) {
      if (!now[i]) continue;
      for (let k = 0; k < f; k++) {
        let j = intBelow(rng, n - 1);
        if (j >= i) j++;
        if (at[j] < 0) at[j] = r;
      }
    }
  }
  return at;
}

export function trials(n: number, f: number): { within: number; median: number } {
  const rs: number[] = [];
  for (let s = 1; s <= RUNS; s++) rs.push(runGossip(n, f, s * 7919).rounds);
  rs.sort((a, b) => a - b);
  return { within: rs.filter((r) => r <= ROUND_GOAL).length, median: rs[RUNS / 2] };
}

export function checkFanout(f: number): { ok: boolean; within: number; median: number; why: string } {
  const t = trials(N, f);
  if (t.within < PASS_RUNS) return { ok: false, ...t, why: `Only ${t.within} of ${RUNS} rumours reached all ${N} nodes within ${ROUND_GOAL} rounds. Random picks often hit nodes that already know: tell more nodes per round.` };
  if (f > BUDGET) return { ok: false, ...t, why: `Fast, but every node sends ${f} messages every round, over the budget of ${BUDGET}. On a busy network that load matters: use the smallest fanout that still meets the goal.` };
  return { ok: true, ...t, why: '' };
}

// ---------- task 3: failure detection ----------
export const PEERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
/** Round in which each dead node stops beating. */
export const DEATHS: Record<string, number> = { C: 3, F: 9 };
/** Rounds during which gossip about E is delayed (its counter looks frozen). */
export const LAG: Record<string, [number, number]> = { E: [5, 7] };
export const SUSPECT_AFTER = 4;
export const MISS_AFTER = 7;
export const HB_ROUNDS = 16;
export const ROUND_MS = 1200;

const beat = (p: string, t: number): number => Math.max(0, Math.min(t, DEATHS[p] ?? Infinity));
/** Heartbeat counter of peer p as you see it at round r (gossip arrives one round late; laggards later). */
export function seen(p: string, r: number): number {
  const lag = LAG[p];
  if (lag && r >= lag[0] && r <= lag[1]) return beat(p, lag[0] - 2);
  return beat(p, r - 1);
}
/** Rounds since you last saw p's counter go up. */
export function age(p: string, r: number): number {
  let k = r;
  while (k > 1 && seen(p, k - 1) === seen(p, r)) k--;
  return r - k;
}
export const isDead = (p: string, r: number): boolean => p in DEATHS && r > DEATHS[p];

export function markCheck(p: string, r: number): { ok: boolean; why: string } {
  const a = age(p, r);
  if (a < SUSPECT_AFTER) {
    return { ok: false, why: a === 0
      ? `${p}’s counter went up last round: it is alive.`
      : `${p}’s counter has been still for only ${a} round${a > 1 ? 's' : ''}. Gossip can be slow; wait until it is still for ${SUSPECT_AFTER} rounds.` };
  }
  return { ok: true, why: '' };
}
