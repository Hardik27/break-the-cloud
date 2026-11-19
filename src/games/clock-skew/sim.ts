/**
 * Clock Skew: wall clocks vs Lamport clocks vs vector clocks. Pure data and rules, no DOM.
 *
 * Tasks:
 *   0 tutorial   two chat messages sorted by a wrong timestamp; put them in the real order
 *   1 chat       order a 6-message group chat whose phones have skewed clocks
 *   2 Lamport    compute the Lamport timestamp of each event in a 3-process diagram
 *   3 vector     use vector clocks to classify pairs of events: before, after or concurrent
 */
export type Who = 'Alice' | 'Bob' | 'Carol';
export interface Msg { who: Who; text: string; realS: number }

/** How far each phone's clock is off, in seconds. */
export const SKEW: Record<Who, number> = { Alice: 0, Bob: -9, Carol: 6 };

/** Messages listed in the order they were really sent. */
export const TUTORIAL_CHAT: Msg[] = [
  { who: 'Alice', text: 'Lunch at 1?', realS: 5 },
  { who: 'Bob', text: 'Sure, see you there', realS: 9 },
];
export const CHAT: Msg[] = [
  { who: 'Alice', text: 'Pizza tonight, anyone?', realS: 0 },
  { who: 'Carol', text: 'Me! How about 7pm?', realS: 4 },
  { who: 'Bob', text: 'In. 7pm works for me', realS: 8 },
  { who: 'Alice', text: 'Booked a table for 3 at 7', realS: 12 },
  { who: 'Bob', text: 'Can you make it 4? Bringing my roommate', realS: 15 },
  { who: 'Alice', text: 'Done: table for 4', realS: 19 },
];

/** The timestamp the sender's phone attached. */
export const stamp = (m: Msg): number => m.realS + SKEW[m.who];
export function fmtStamp(s: number): string {
  const t = 12 * 3600 + s;
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
/** Indices (true order) sorted the way the server shows them: by timestamp. */
export const byTimestamp = (chat: Msg[]): number[] => chat.map((_, i) => i).sort((a, b) => stamp(chat[a]) - stamp(chat[b]));

/** Placing messages in real order: the next one must be index `placed`. */
export function place(chat: Msg[], placed: number, i: number): { ok: boolean; why: string } {
  if (i === placed) return { ok: true, why: '' };
  const m = chat[i];
  const skew = SKEW[m.who];
  const clock = skew ? ` (${m.who}’s clock is ${Math.abs(skew)} s ${skew < 0 ? 'slow' : 'fast'})` : '';
  if (i > placed) return { ok: false, why: `Not yet: “${m.text}” responds to something that hasn’t been placed. Its timestamp misleads you${clock}. Read what it replies to.` };
  return { ok: false, why: 'Already placed.' };
}

// ---------- tasks 2–3: a 3-process space-time diagram ----------
export const PROCS = ['A', 'B', 'C'];
export interface Ev { id: string; p: number; kind: 'local' | 'send' | 'recv'; from?: string; x: number }

/** Events in a valid processing order (every send before its receive). */
export const EVENTS: Ev[] = [
  { id: 'a1', p: 0, kind: 'local', x: 60 },
  { id: 'a2', p: 0, kind: 'send', x: 130 },
  { id: 'b1', p: 1, kind: 'recv', from: 'a2', x: 200 },
  { id: 'c1', p: 2, kind: 'local', x: 100 },
  { id: 'b2', p: 1, kind: 'send', x: 270 },
  { id: 'c2', p: 2, kind: 'recv', from: 'b2', x: 340 },
  { id: 'c3', p: 2, kind: 'send', x: 410 },
  { id: 'a3', p: 0, kind: 'recv', from: 'c3', x: 480 },
];
export const byId = (id: string): Ev => EVENTS.find((e) => e.id === id)!;

export function lamport(): Record<string, number> {
  const clock = PROCS.map(() => 0);
  const out: Record<string, number> = {};
  for (const e of EVENTS) {
    clock[e.p] = e.kind === 'recv' ? Math.max(clock[e.p], out[e.from!]) + 1 : clock[e.p] + 1;
    out[e.id] = clock[e.p];
  }
  return out;
}

export function vector(): Record<string, number[]> {
  const v = PROCS.map(() => PROCS.map(() => 0));
  const out: Record<string, number[]> = {};
  for (const e of EVENTS) {
    if (e.kind === 'recv') v[e.p] = v[e.p].map((x, k) => Math.max(x, out[e.from!][k]));
    v[e.p][e.p]++;
    out[e.id] = [...v[e.p]];
  }
  return out;
}

/** The previous Lamport value on the same process (0 if none). */
export function prevOnProc(id: string, L: Record<string, number>): number {
  const e = byId(id);
  const before = EVENTS.slice(0, EVENTS.indexOf(e)).filter((x) => x.p === e.p);
  return before.length ? L[before[before.length - 1].id] : 0;
}

export function checkLamport(id: string, v: number): { ok: boolean; why: string } {
  const L = lamport();
  if (v === L[id]) return { ok: true, why: '' };
  const e = byId(id);
  const own = prevOnProc(id, L);
  if (e.kind === 'recv') return { ok: false, why: `${id} receives a message stamped ${L[e.from!]}. Take the larger of ${PROCS[e.p]}’s own clock (${own}) and the message’s (${L[e.from!]}), then add 1: ${L[id]}.` };
  return { ok: false, why: `A ${e.kind === 'send' ? 'send' : 'local event'} adds 1 to ${PROCS[e.p]}’s own clock. ${PROCS[e.p]} was at ${own}, so ${L[id]}.` };
}

export type Rel = 'before' | 'after' | 'concurrent';
/** Relation of x to y from vector clocks: x happened before y, after y, or neither. */
export function relation(x: string, y: string): Rel {
  const V = vector();
  const a = V[x], b = V[y];
  const le = a.every((v, k) => v <= b[k]), ge = a.every((v, k) => v >= b[k]);
  if (le && !ge) return 'before';
  if (ge && !le) return 'after';
  return 'concurrent';
}

/** Pairs to classify. Half are concurrent even though their Lamport numbers differ. */
export const PAIRS: [string, string][] = [
  ['a2', 'c2'],
  ['c1', 'a2'],
  ['a3', 'b2'],
  ['b1', 'c1'],
  ['c3', 'a1'],
  ['c1', 'b2'],
];

/** What Lamport numbers alone would suggest (the wrong strategy for task 3). */
export function lamportGuess(x: string, y: string): Rel {
  const L = lamport();
  return L[x] < L[y] ? 'before' : L[x] > L[y] ? 'after' : 'concurrent';
}

export function explainRel(x: string, y: string): string {
  const V = vector();
  const f = (id: string) => `[${V[id].join(',')}]`;
  const r = relation(x, y);
  if (r === 'concurrent') return `${x} ${f(x)} and ${y} ${f(y)}: each is bigger in some entry, so neither knew about the other. They are concurrent.`;
  const [lo, hi] = r === 'before' ? [x, y] : [y, x];
  return `Every entry of ${lo} ${f(lo)} is ≤ ${hi} ${f(hi)}, so ${lo} happened before ${hi}.`;
}
