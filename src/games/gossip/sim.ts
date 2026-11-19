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

// ---------- task 3: who is dead? (SWIM: direct and indirect pings) ----------
export type Truth = 'dead' | 'slow' | 'alive';
export interface Suspect { name: string; truth: Truth; story: string }
export const SUSPECTS: Suspect[] = [
  { name: 'Dev', truth: 'dead', story: 'Dev hasn’t answered the cluster for a while.' },
  { name: 'Bea', truth: 'slow', story: 'Bea hasn’t answered you for a while.' },
  { name: 'Raj', truth: 'alive', story: 'Someone says Raj might be down.' },
  { name: 'Mo', truth: 'dead', story: 'Mo went quiet a few seconds ago.' },
];
export const PING_TIMEOUT_MS = 500;
export type Probe = 'none' | 'direct-ok' | 'direct-fail' | 'indirect-ok' | 'indirect-fail';
export interface SwimRound { s: Suspect; probe: Probe }
export const createSwim = (i: number): SwimRound => ({ s: SUSPECTS[i], probe: 'none' });

/** You ping the suspect yourself. A slow link (yours) looks exactly like a dead node. */
export function pingDirect(r: SwimRound): { ok: boolean; ms: number | null } {
  const ok = r.s.truth === 'alive';
  r.probe = ok ? 'direct-ok' : 'direct-fail';
  return { ok, ms: ok ? 40 : null };
}
/** You ask two other members to ping the suspect for you and report back. */
export function pingIndirect(r: SwimRound): { ok: boolean; via: string } {
  const ok = r.s.truth !== 'dead';
  r.probe = ok ? 'indirect-ok' : 'indirect-fail';
  return { ok, via: ok ? 'Ana and Kim' : 'nobody' };
}

export type Verdict = 'alive' | 'dead';
export function judge(r: SwimRound, v: Verdict): { ok: boolean; why: string } {
  if (r.probe === 'none') return { ok: false, why: `You haven’t checked on ${r.s.name} at all. Ping first: rumours are not evidence.` };
  if (v === 'dead') {
    if (r.s.truth !== 'dead') return { ok: false, why: `${r.s.name} is fine: the indirect ping got an answer. Only your own link to ${r.s.name} was slow.` };
    if (r.probe !== 'indirect-fail') return { ok: false, why: `Too early. Your own ping failed, but the problem could be your link. Ask others to ping ${r.s.name} first.` };
    return { ok: true, why: `Nobody can reach ${r.s.name}: not you, not two others. ${r.s.name} is dead. Gossip that news so everyone stops sending work there.` };
  }
  if (r.s.truth === 'dead') return { ok: false, why: `${r.s.name} never answered anyone. Calling a dead node alive keeps users waiting on it.` };
  if (r.probe === 'direct-fail') return { ok: false, why: `Your ping failed, so you can’t be sure yet. Ask others to ping ${r.s.name}.` };
  return { ok: true, why: r.probe === 'direct-ok' ? `${r.s.name} answered your ping in 40 ms: alive, the rumour was wrong.` : `${r.s.name} answered the others: alive. Your own link was the slow part, so you did not wrongly evict a healthy node.` };
}
