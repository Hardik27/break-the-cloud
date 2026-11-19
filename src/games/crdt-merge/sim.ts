/**
 * CRDT Merge: data types that merge without losing updates. Pure data and rules, no DOM.
 *
 * Tasks:
 *   0 tutorial   +1 on the phone, then sync
 *   1 counter    two offline devices add likes; every simple merge of one number loses or double-counts
 *   2 G-counter  merge per-device counts by taking the max of each entry
 *   3 OR-set     merge a shopping list where adds carry unique tags and removes only remove tags they saw
 */

// ---------- task 1: a plain counter ----------
export const BASE = 10;
export const WANT_INC: [number, number] = [3, 2];
export interface Naive { lww: number; max: number; sum: number; correct: number }
/** Each device's local value after its offline increments; the laptop writes last. */
export function naiveMerges(inc: [number, number]): Naive {
  const a = BASE + inc[0], b = BASE + inc[1];
  return { lww: b, max: Math.max(a, b), sum: a + b, correct: BASE + inc[0] + inc[1] };
}
export function totalChoices(inc: [number, number]): number[] {
  const n = naiveMerges(inc);
  return [...new Set([n.lww, n.max, n.correct, n.sum])].sort((x, y) => x - y);
}

// ---------- task 2: G-counter ----------
export const DEVICES = ['Phone', 'Laptop', 'Tablet'];
export interface GRound { a: number; b: number; va: number[]; vb: number[] }
export const G_ROUNDS: GRound[] = [
  { a: 0, b: 1, va: [3, 1, 0], vb: [2, 4, 0] },
  { a: 1, b: 2, va: [3, 4, 0], vb: [1, 0, 5] },
  { a: 0, b: 2, va: [6, 2, 1], vb: [3, 4, 5] },
];
export const gMerge = (va: number[], vb: number[]): number[] => va.map((x, k) => Math.max(x, vb[k]));
export const gValue = (v: number[]): number => v.reduce((s, x) => s + x, 0);
export const slotChoices = (a: number, b: number): number[] => [...new Set([a, b, a + b])].sort((x, y) => x - y);

export function checkSlot(r: GRound, k: number, v: number): { ok: boolean; why: string } {
  const a = r.va[k], b = r.vb[k], want = Math.max(a, b);
  if (v === want) return { ok: true, why: '' };
  const owner = DEVICES[k];
  if (v === a + b && a && b) return { ok: false, why: `Adding counts ${owner}’s likes twice: ${Math.min(a, b)} of them are the same likes, heard by both. Each entry only ever grows, so the bigger one already includes the smaller.` };
  return { ok: false, why: `Taking the smaller loses likes: ${owner} has counted ${want} in total and one device has already heard about all of them. Take the bigger.` };
}

// ---------- task 3: OR-set ----------
export interface Tagged { item: string; tag: string }
export interface SetRound {
  before: Tagged[];
  phone: { adds: Tagged[]; removes: Tagged[] };
  laptop: { adds: Tagged[]; removes: Tagged[] };
}
const t = (item: string, tag: string): Tagged => ({ item, tag });
export const SET_ROUNDS: SetRound[] = [
  {
    before: [t('milk', 'a1'), t('bread', 'a2')],
    phone: { adds: [t('eggs', 'p1')], removes: [t('milk', 'a1')] },
    laptop: { adds: [t('milk', 'l1')], removes: [t('bread', 'a2')] },
  },
  {
    before: [t('apples', 'a3'), t('tea', 'a4')],
    phone: { adds: [t('jam', 'p2')], removes: [t('apples', 'a3')] },
    laptop: { adds: [t('jam', 'l2')], removes: [t('apples', 'a3')] },
  },
  {
    before: [t('rice', 'a5')],
    phone: { adds: [t('soap', 'p3')], removes: [t('soap', 'p3')] },
    laptop: { adds: [t('soap', 'l3')], removes: [] },
  },
];

/** OR-set merge: an item is present if some add-tag of it was never removed. */
export function orMerge(r: SetRound): string[] {
  const adds = [...r.before, ...r.phone.adds, ...r.laptop.adds];
  const removed = new Set([...r.phone.removes, ...r.laptop.removes].map((x) => x.tag));
  return [...new Set(adds.filter((x) => !removed.has(x.tag)).map((x) => x.item))].sort();
}
export const setCandidates = (r: SetRound): string[] => [...new Set([...r.before, ...r.phone.adds, ...r.laptop.adds].map((x) => x.item))].sort();

/** A naive merge for comparison: remove wins (any remove of an item deletes it). */
export function removeWins(r: SetRound): string[] {
  const gone = new Set([...r.phone.removes, ...r.laptop.removes].map((x) => x.item));
  return setCandidates(r).filter((i) => !gone.has(i));
}

export function checkSet(r: SetRound, chosen: string[]): { ok: boolean; why: string } {
  const want = orMerge(r);
  const got = new Set(chosen);
  const missing = want.filter((i) => !got.has(i));
  const extra = chosen.filter((i) => !want.includes(i));
  if (!missing.length && !extra.length) return { ok: true, why: '' };
  const removed = new Set([...r.phone.removes, ...r.laptop.removes].map((x) => x.tag));
  const tagsOf = (i: string) => [...r.before, ...r.phone.adds, ...r.laptop.adds].filter((x) => x.item === i);
  if (missing.length) {
    const i = missing[0];
    const live = tagsOf(i).find((x) => !removed.has(x.tag))!;
    return { ok: false, why: `${i} should stay: its add with tag ${live.tag} was never removed. A remove only deletes the tags its device had seen.` };
  }
  const i = extra[0];
  return { ok: false, why: `${i} should go: every tag it was added with (${tagsOf(i).map((x) => x.tag).join(', ')}) has been removed.` };
}
