/**
 * The Ring: sharding with hash mod N, consistent hashing, and virtual nodes. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial    place two keys with hash mod 3
 *   1 modulo      add a 4th server; re-place every key with hash mod 4 and count how many moved
 *   2 ring        place keys on a hash ring (next server clockwise); add a server; pick the keys that move
 *   3 vnodes      an unlucky ring is lopsided; add virtual nodes until it is balanced
 */

/** FNV-1a (32-bit) followed by MurmurHash3's finalizer, so similar strings land far apart. */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
export const hash100 = (key: string): number => fnv(key) % 100;

export const KEYS = ['user:ana', 'cart:42', 'img:cat', 'user:ben', 'post:7', 'order:19', 'user:chen', 'cart:88'];
export const TUTORIAL_KEYS = KEYS.slice(0, 2);

// ---------- tasks 0–1: hash mod N ----------
export interface Modulo {
  n: number;
  /** Where each key lives now (server index), or undefined if not placed yet. */
  home: Record<string, number>;
  /** Where each key lived before the new server was added. */
  before: Record<string, number>;
  queue: string[];
  added: boolean;
  moved: number;
}

export function createModulo(task: number): Modulo {
  const home: Record<string, number> = {};
  if (task === 1) for (const k of KEYS) home[k] = hash100(k) % 3;
  return { n: 3, home, before: { ...home }, queue: task === 0 ? [...TUTORIAL_KEYS] : [], added: false, moved: 0 };
}

export function addServer(m: Modulo): void {
  m.added = true;
  m.n = 4;
  m.before = { ...m.home };
  m.queue = [...KEYS];
}

export function placeModulo(m: Modulo, server: number): { ok: boolean; key: string; want: number; moved: boolean } | null {
  const key = m.queue[0];
  if (!key) return null;
  const want = hash100(key) % m.n;
  if (server !== want) return { ok: false, key, want, moved: false };
  m.queue.shift();
  const moved = m.added && m.before[key] !== want;
  if (moved) m.moved++;
  m.home[key] = want;
  return { ok: true, key, want, moved };
}
export const moduloDone = (m: Modulo): boolean => m.added && m.queue.length === 0;

// ---------- task 2: the ring ----------
export const RING = 100;
export interface RingServer { id: string; pos: number }
export const RING_SERVERS: RingServer[] = [
  { id: 'A', pos: 10 },
  { id: 'B', pos: 45 },
  { id: 'C', pos: 80 },
];
export const NEW_SERVER: RingServer = { id: 'D', pos: 62 };

/** The first server clockwise from the key’s position (wrapping past 99 back to 0). */
export function owner(servers: RingServer[], pos: number): string {
  const sorted = [...servers].sort((a, b) => a.pos - b.pos);
  return (sorted.find((s) => s.pos >= pos) ?? sorted[0]).id;
}

export interface RingState {
  servers: RingServer[];
  home: Record<string, string>;
  queue: string[];
  added: boolean;
  /** Keys whose owner changes when D joins. */
  movers: Set<string>;
  found: Set<string>;
}

export function createRing(): RingState {
  return { servers: [...RING_SERVERS], home: {}, queue: [...KEYS], added: false, movers: new Set(), found: new Set() };
}
export function placeRing(r: RingState, server: string): { ok: boolean; key: string; want: string } | null {
  const key = r.queue[0];
  if (!key) return null;
  const want = owner(r.servers, hash100(key));
  if (server !== want) return { ok: false, key, want };
  r.queue.shift();
  r.home[key] = want;
  if (r.queue.length === 0) {
    r.added = true;
    const next = [...r.servers, NEW_SERVER];
    for (const k of KEYS) if (owner(next, hash100(k)) !== r.home[k]) r.movers.add(k);
    r.servers = next;
  }
  return { ok: true, key, want };
}
export function pickMover(r: RingState, key: string): 'moves' | 'stays' | 'again' {
  if (r.found.has(key)) return 'again';
  if (!r.movers.has(key)) return 'stays';
  r.found.add(key);
  r.home[key] = NEW_SERVER.id;
  return 'moves';
}
export const ringDone = (r: RingState): boolean => r.added && r.found.size === r.movers.size;

// ---------- task 3: virtual nodes ----------
export const VN_RING = 1000;
export const VNODES = [1, 3, 10, 50] as const;
export const VN_SERVERS = ['A', 'B', 'C'];
export const BALANCE_GOAL = 1.1;

/** Each server is placed at `v` positions: hash("A#0"), hash("A#1"), … */
export function vnodePositions(v: number): { id: string; pos: number }[] {
  const out: { id: string; pos: number }[] = [];
  for (const id of VN_SERVERS) for (let i = 0; i < v; i++) out.push({ id, pos: fnv(`${id}#${i}`) % VN_RING });
  return out.sort((a, b) => a.pos - b.pos);
}

/** Share of the ring each server owns: each position owns the arc from the previous position up to itself. */
export function shares(v: number): Record<string, number> {
  const ps = vnodePositions(v);
  const out: Record<string, number> = Object.fromEntries(VN_SERVERS.map((s) => [s, 0]));
  ps.forEach((p, i) => {
    const prev = i === 0 ? ps[ps.length - 1].pos - VN_RING : ps[i - 1].pos;
    out[p.id] += (p.pos - prev) / VN_RING;
  });
  return out;
}
export const imbalance = (v: number): number => Math.max(...Object.values(shares(v))) * VN_SERVERS.length;
export const balanced = (v: number): boolean => imbalance(v) <= BALANCE_GOAL;
