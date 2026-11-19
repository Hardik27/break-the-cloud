/**
 * Partition: the CAP choice. Pure data and rules, no DOM.
 *
 * Three replicas: two in New York, one in London. The link between the cities is cut.
 * New York still has a majority (2 of 3); London is alone.
 *
 * Tasks:
 *   0 tutorial   cut the link; accept a write on the majority side
 *   1 decide     accept or reject 8 writes during the partition (CP for money, AP for carts and likes)
 *   2 merge      after healing, merge two diverged shopping carts (2 rounds)
 *   3 classify   CP or AP for six real systems
 */
export type Side = 'NY' | 'London';
export type Kind = 'money' | 'cart' | 'likes';
export interface Prompt { side: Side; kind: Kind; text: string; accept: boolean; why: string }

const WHY = {
  majority: 'New York still has 2 of 3 replicas, a majority, so it can safely accept writes: when the link heals, London will catch up.',
  money: 'London is cut off from the majority. If it accepted this withdrawal, New York could approve another one from the same account: the money could be spent twice. Consistency first: reject it (CP).',
  soft: 'A cart item or a like can be merged later without harm. Rejecting it would just frustrate the user. Availability first: accept it (AP) and reconcile after the partition heals.',
};

export const TUTORIAL_PROMPT: Prompt = { side: 'NY', kind: 'cart', text: 'New York: Ben adds “headphones” to his cart', accept: true, why: WHY.majority };

export const PROMPTS: Prompt[] = [
  { side: 'London', kind: 'money', text: 'London: Ana withdraws £50 (balance £80)', accept: false, why: WHY.money },
  { side: 'NY', kind: 'money', text: 'New York: Carl transfers $200 to Dana', accept: true, why: WHY.majority },
  { side: 'London', kind: 'cart', text: 'London: Ana adds “umbrella” to her cart', accept: true, why: WHY.soft },
  { side: 'London', kind: 'likes', text: 'London: Eve likes a photo', accept: true, why: WHY.soft },
  { side: 'London', kind: 'money', text: 'London: Finn pays a £30 bill from his account', accept: false, why: WHY.money },
  { side: 'NY', kind: 'cart', text: 'New York: Gia removes “lamp” from her cart', accept: true, why: WHY.majority },
  { side: 'London', kind: 'cart', text: 'London: Hal adds “kettle” to his cart', accept: true, why: WHY.soft },
  { side: 'London', kind: 'money', text: 'London: Ana withdraws another £40', accept: false, why: WHY.money },
];

export function decide(p: Prompt, accept: boolean): { ok: boolean; why: string } {
  return { ok: accept === p.accept, why: p.why };
}

// ---------- task 2: merging carts ----------
export interface MergeRound {
  before: string[];
  ny: { op: 'add' | 'remove'; item: string }[];
  london: { op: 'add' | 'remove'; item: string }[];
}
export const MERGE_ROUNDS: MergeRound[] = [
  {
    before: ['mug', 'lamp'],
    ny: [{ op: 'add', item: 'pen' }, { op: 'add', item: 'socks' }],
    london: [{ op: 'remove', item: 'lamp' }, { op: 'add', item: 'book' }],
  },
  {
    before: ['mug', 'cap'],
    ny: [{ op: 'remove', item: 'mug' }, { op: 'add', item: 'scarf' }],
    london: [{ op: 'add', item: 'mug' }, { op: 'remove', item: 'cap' }],
  },
];

/** Each side's cart after its own operations. */
export function sideCart(r: MergeRound, side: Side): string[] {
  const s = new Set(r.before);
  for (const o of side === 'NY' ? r.ny : r.london) o.op === 'add' ? s.add(o.item) : s.delete(o.item);
  return [...s];
}

/**
 * Correct merge (add-wins, like Amazon’s Dynamo cart): an item is in the cart if either side added it
 * during the partition, or it was there before and nobody removed it.
 */
export function correctMerge(r: MergeRound): string[] {
  const added = new Set([...r.ny, ...r.london].filter((o) => o.op === 'add').map((o) => o.item));
  const removed = new Set([...r.ny, ...r.london].filter((o) => o.op === 'remove').map((o) => o.item));
  const out = new Set<string>();
  for (const i of r.before) if (!removed.has(i) || added.has(i)) out.add(i);
  for (const i of added) out.add(i);
  return [...out].sort();
}
export const candidates = (r: MergeRound): string[] => [...new Set([...r.before, ...r.ny.map((o) => o.item), ...r.london.map((o) => o.item)])].sort();

export function checkMerge(r: MergeRound, chosen: string[]): { ok: boolean; missing: string[]; extra: string[] } {
  const want = new Set(correctMerge(r));
  const got = new Set(chosen);
  const missing = [...want].filter((i) => !got.has(i));
  const extra = [...got].filter((i) => !want.has(i));
  return { ok: !missing.length && !extra.length, missing, extra };
}

// ---------- task 3: CP or AP ----------
export interface SystemCard { name: string; detail: string; cp: boolean; why: string }
export const SYSTEMS: SystemCard[] = [
  { name: 'etcd', detail: 'Kubernetes’ configuration store (Raft)', cp: true, why: 'etcd uses Raft: without a majority it refuses writes rather than risk two versions of the truth.' },
  { name: 'Cassandra (consistency ONE)', detail: 'wide-column database', cp: false, why: 'At consistency level ONE, any single replica accepts reads and writes, even when cut off. Conflicts are settled later.' },
  { name: 'ZooKeeper', detail: 'coordination and locks', cp: true, why: 'ZooKeeper needs a quorum. A minority side stops serving writes, so two clients can never both hold the same lock.' },
  { name: 'Amazon Dynamo (the cart)', detail: 'the 2007 shopping-cart store', cp: false, why: 'Dynamo was built so “add to cart” always works. Divergent carts are merged later: deleted items may reappear.' },
  { name: 'Google Spanner', detail: 'globally distributed SQL', cp: true, why: 'Spanner chooses consistency: a partition costs availability for the minority side, not correctness.' },
  { name: 'CouchDB', detail: 'document database built for sync', cp: false, why: 'CouchDB accepts writes on every replica and keeps conflicting versions for the app to resolve.' },
];
