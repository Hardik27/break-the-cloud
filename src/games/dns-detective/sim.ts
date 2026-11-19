/**
 * DNS Detective: the student is the recursive resolver. Pure simulation, no DOM.
 *
 * A lookup walks: laptop → resolver → root → TLD (.com/.io/.org) → authoritative server → answer.
 * The resolver can keep answers in a cache until their TTL runs out.
 *
 * Tasks:
 *   0 tutorial   walk one lookup
 *   1 walk       resolve 4 names by hand
 *   2 cache      6 lookups, some repeated: answer repeats from the cache
 *   3 stale      a record moved; the cached answer is stale and must be refreshed
 *   4 ttl        pick a TTL for two records (stable homepage, record you will migrate)
 */
import { shuffle, type Rng } from '../../lib/rng';

export type NodeId = 'resolver' | 'cache' | 'root' | 'tld-com' | 'tld-io' | 'tld-org' | 'auth-shop' | 'auth-cloud' | 'auth-learn';

export interface Domain { name: string; tld: NodeId; auth: NodeId; ip: string }
export const DOMAINS: Domain[] = [
  { name: 'api.shop.com', tld: 'tld-com', auth: 'auth-shop', ip: '198.51.100.7' },
  { name: 'cdn.cloud.io', tld: 'tld-io', auth: 'auth-cloud', ip: '203.0.113.20' },
  { name: 'docs.learn.org', tld: 'tld-org', auth: 'auth-learn', ip: '192.0.2.44' },
  { name: 'mail.shop.com', tld: 'tld-com', auth: 'auth-shop', ip: '198.51.100.25' },
  { name: 'img.cloud.io', tld: 'tld-io', auth: 'auth-cloud', ip: '203.0.113.81' },
  { name: 'quiz.learn.org', tld: 'tld-org', auth: 'auth-learn', ip: '192.0.2.90' },
];
export const domain = (name: string): Domain => DOMAINS.find((d) => d.name === name)!;
export const NEW_IP = '198.51.100.99';

export const NODE_LABEL: Record<NodeId, string> = {
  resolver: 'Resolver', cache: 'Cache', root: 'Root (.)', 'tld-com': '.com', 'tld-io': '.io', 'tld-org': '.org',
  'auth-shop': 'ns1.shop.com', 'auth-cloud': 'ns.cloud.io', 'auth-learn': 'ns.learn.org',
};

export interface Query { name: string; hop: number; viaCache: boolean; answer: string | null }
export interface CacheEntry { ip: string; stale: boolean }

export interface State {
  task: number;
  queue: string[];
  current: Query | null;
  done: number;
  total: number;
  cache: Map<string, CacheEntry>;
  /** Live record values at the authoritative servers. */
  records: Map<string, string>;
  log: string[];
  mistakes: number;
}

export type ClickResult =
  | { kind: 'hop'; msg: string; finished: boolean }
  | { kind: 'cache-hit'; msg: string; finished: true }
  | { kind: 'wrong'; msg: string };

const TASK_QUEUES: ((rng: Rng) => string[])[] = [
  () => ['api.shop.com'],
  (rng) => shuffle(rng, ['api.shop.com', 'cdn.cloud.io', 'docs.learn.org', 'img.cloud.io']),
  () => ['api.shop.com', 'cdn.cloud.io', 'api.shop.com', 'docs.learn.org', 'cdn.cloud.io', 'api.shop.com'],
  () => ['cdn.cloud.io', 'api.shop.com', 'api.shop.com', 'mail.shop.com'],
  () => [],
];

export function create(task: number, rng: Rng): State {
  const queue = TASK_QUEUES[task](rng);
  const s: State = {
    task, queue: [...queue], current: null, done: 0, total: queue.length,
    cache: new Map(), records: new Map(DOMAINS.map((d) => [d.name, d.ip])), log: [], mistakes: 0,
  };
  if (task === 3) {
    // Earlier today the resolver cached both names. Then ops moved api.shop.com to a new server.
    s.cache.set('cdn.cloud.io', { ip: domain('cdn.cloud.io').ip, stale: false });
    s.cache.set('api.shop.com', { ip: domain('api.shop.com').ip, stale: true });
    s.records.set('api.shop.com', NEW_IP);
  }
  next(s);
  return s;
}

function next(s: State): void {
  const name = s.queue.shift();
  s.current = name ? { name, hop: 0, viaCache: false, answer: null } : null;
}

/** Which node the student should click next for the current query (the cache counts when it holds a fresh answer). */
export function expected(s: State): NodeId[] {
  const q = s.current;
  if (!q) return [];
  const d = domain(q.name);
  if (q.hop === 0) return ['resolver'];
  if (q.hop === 1) {
    const c = s.cache.get(q.name);
    return c && !c.stale ? ['cache'] : ['root'];
  }
  return q.hop === 2 ? [d.tld] : [d.auth];
}

export const isCached = (s: State, name: string): boolean => s.cache.has(name);

export function click(s: State, node: NodeId): ClickResult {
  const q = s.current;
  if (!q) return { kind: 'wrong', msg: 'No lookup in progress.' };
  const d = domain(q.name);
  const want = expected(s);
  const cached = s.cache.get(q.name);
  if (q.hop === 1 && node === 'cache') {
    if (!cached) return wrong(s, `Cache miss: the resolver has never looked up ${q.name}. Ask the root.`);
    if (cached.stale) return wrong(s, `The cache still says ${cached.ip}, but ${q.name} moved to ${s.records.get(q.name)}. Users would hit the old server. Look it up fresh.`);
    return finish(s, cached.ip, true, `Cache hit: ${q.name} is ${cached.ip}. No round trips needed.`);
  }
  if (!want.includes(node) && !(q.hop === 1 && node === 'root' && cached)) {
    return wrong(s, wrongMsg(q, node));
  }
  if (q.hop === 1 && node === 'root' && cached && !cached.stale) {
    // Walking a name that is already cached: correct answer, but wasted work.
    s.mistakes++;
    q.hop = 2;
    s.log.unshift(`Root: ${q.name}? Ask the ${NODE_LABEL[d.tld]} servers. (It was in your cache: 3 round trips wasted.)`);
    return { kind: 'wrong', msg: `${q.name} was already in the cache. Walking the tree again wastes 3 round trips. Finish the lookup, and use the cache next time.` };
  }
  q.hop++;
  if (q.hop === 1) {
    const msg = `Laptop → resolver: what is the address of ${q.name}?`;
    s.log.unshift(msg);
    return { kind: 'hop', msg, finished: false };
  }
  if (q.hop === 2) {
    const msg = `Root: I don't know ${q.name}, but ${NODE_LABEL[d.tld]} names are handled by the ${NODE_LABEL[d.tld]} servers.`;
    s.log.unshift(msg);
    return { kind: 'hop', msg, finished: false };
  }
  if (q.hop === 3) {
    const msg = `${NODE_LABEL[d.tld]} server: ${q.name.split('.').slice(-2).join('.')} is run by ${NODE_LABEL[d.auth]}. Ask it.`;
    s.log.unshift(msg);
    return { kind: 'hop', msg, finished: false };
  }
  const ip = s.records.get(q.name)!;
  return finish(s, ip, false, `${NODE_LABEL[d.auth]}: ${q.name} is ${ip}. The resolver caches it and answers the laptop.`);
}

function finish(s: State, ip: string, viaCache: boolean, msg: string): ClickResult {
  const q = s.current!;
  q.answer = ip;
  q.viaCache = viaCache;
  s.cache.set(q.name, { ip, stale: false });
  s.log.unshift(msg);
  s.done++;
  next(s);
  return viaCache ? { kind: 'cache-hit', msg, finished: true } : { kind: 'hop', msg, finished: true };
}

function wrong(s: State, msg: string): ClickResult {
  s.mistakes++;
  return { kind: 'wrong', msg };
}

function wrongMsg(q: Query, node: NodeId): string {
  const d = domain(q.name);
  if (q.hop === 0) return 'Your laptop never asks the root itself. It asks its resolver first: click the Resolver.';
  if (q.hop === 1) return `The resolver starts at the top of the tree: ask the Root about ${q.name}.`;
  if (q.hop === 2) return `Root sent you to the ${NODE_LABEL[d.tld]} servers, not ${NODE_LABEL[node]}. The last part of the name (${NODE_LABEL[d.tld]}) decides.`;
  return `${NODE_LABEL[d.tld]} said ${q.name.split('.').slice(-2).join('.')} is run by ${NODE_LABEL[d.auth]}. Ask that server.`;
}

export const finished = (s: State): boolean => s.done >= s.total && s.total > 0;

// ---------- task 4: choose a TTL ----------
export const TTL_OPTIONS = [60, 300, 3600, 86400] as const;
export const ttlLabel = (t: number): string => (t < 60 ? `${t} s` : t < 3600 ? `${t / 60} min` : t < 86400 ? `${t / 3600} h` : `${t / 86400} day`);

/** 2,000 resolvers around the world cache the record; each asks again only when its copy expires. */
export const RESOLVERS = 2000;

export interface Scenario { id: string; title: string; text: string; maxStaleS: number; maxAuthPerHour: number }
export const SCENARIOS: Scenario[] = [
  { id: 'migrate', title: 'Moving tonight', text: 'You move api.shop.com to a new server tonight. Users may hit the old server for at most 5 minutes. Your DNS servers handle 50,000 queries an hour.', maxStaleS: 300, maxAuthPerHour: 50_000 },
  { id: 'stable', title: 'The homepage', text: 'www.shop.com has not changed in a year. Stale answers for a day are fine, but your DNS provider bills per query: stay under 5,000 queries an hour.', maxStaleS: 86400, maxAuthPerHour: 5_000 },
];

export interface TtlResult { ttl: number; staleS: number; authPerHour: number; staleOk: boolean; loadOk: boolean; ok: boolean }

/** Worst case: a resolver cached the old answer just before the change, so it stays stale for a full TTL. */
export function evaluateTtl(sc: Scenario, ttl: number): TtlResult {
  const authPerHour = Math.round((RESOLVERS * 3600) / ttl);
  const staleOk = ttl <= sc.maxStaleS;
  const loadOk = authPerHour <= sc.maxAuthPerHour;
  return { ttl, staleS: ttl, authPerHour, staleOk, loadOk, ok: staleOk && loadOk };
}
