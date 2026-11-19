/**
 * Replica Diff: a source bucket and its replica. Pure simulation, no DOM.
 * Each round plants one or more differences of a given kind; the student flags the objects that differ.
 *
 * Kinds of difference:
 *   miss  the object never reached the replica
 *   etag  same key and size, different bytes (checksum differs)
 *   tags  same bytes, different tags (tags often drive access policies)
 *   ret   same bytes and tags, but the replica lost its retention lock
 */
import { intBelow, pickOne, shuffle, type Rng } from '../../lib/rng';

export interface Obj {
  key: string;
  size: number; // KB
  etag: string;
  tags: string;
  ret: string;
}
export type Kind = 'miss' | 'etag' | 'tags' | 'ret';
export const KINDS: Kind[] = ['miss', 'etag', 'tags', 'ret'];

export interface Round {
  task: number;
  src: Obj[];
  dst: (Obj | null)[];
  /** row index -> kind of difference planted there */
  targets: Map<number, Kind>;
  found: Set<number>;
}

/** Rows per round and which differences each round plants. Round 0 is the tutorial. */
export const ROUNDS: { rows: number; kinds: Kind[] | 'mixed3' }[] = [
  { rows: 6, kinds: ['miss'] },
  { rows: 12, kinds: ['etag'] },
  { rows: 12, kinds: ['tags'] },
  { rows: 12, kinds: ['ret'] },
  { rows: 14, kinds: 'mixed3' },
];
/** In the tutorial the missing object is always on this row, so the walkthrough can point at it. */
export const TUTORIAL_ROW = 2;
export const PENALTY_MS = 5000;

const WORDS = ['invoices', 'scans', 'backups', 'models', 'logs', 'photos', 'contracts', 'payroll', 'audit', 'exports', 'reports', 'events', 'tiles', 'datasets', 'media', 'archive'];
const EXT = ['parquet', 'pdf', 'tar.gz', 'json', 'csv', 'jpg', 'bin', 'zip'];
const TAGS = ['class=internal', 'class=internal', 'team=fin', 'class=public', 'team=ml'];
const RET = ['none', 'none', 'none', '7y lock', '90d lock'];

const hex = (rng: Rng) => Array.from({ length: 8 }, () => '0123456789abcdef'[intBelow(rng, 16)]).join('');

function mkObj(rng: Rng, i: number): Obj {
  return {
    key: `${pickOne(rng, WORDS)}/2026/${String(i + 1).padStart(3, '0')}.${pickOne(rng, EXT)}`,
    size: intBelow(rng, 90000) + 120,
    etag: hex(rng),
    tags: pickOne(rng, TAGS),
    ret: pickOne(rng, RET),
  };
}

export function makeRound(task: number, rng: Rng): Round {
  const cfg = ROUNDS[task];
  const n = cfg.rows;
  const src = Array.from({ length: n }, (_, i) => mkObj(rng, i));
  const dst: (Obj | null)[] = src.map((o) => ({ ...o }));
  const kinds = cfg.kinds === 'mixed3' ? shuffle(rng, [...KINDS]).slice(0, 3) : cfg.kinds;
  const rows = task === 0 ? [TUTORIAL_ROW] : shuffle(rng, [...Array(n).keys()]).slice(0, kinds.length);
  const targets = new Map<number, Kind>();
  kinds.forEach((k, j) => {
    const i = rows[j];
    targets.set(i, k);
    if (k === 'miss') dst[i] = null;
    else if (k === 'etag') {
      let e = hex(rng);
      while (e === src[i].etag) e = hex(rng);
      dst[i]!.etag = e;
    } else if (k === 'tags') dst[i]!.tags = src[i].tags === 'class=public' ? 'class=internal' : 'class=public';
    else if (k === 'ret') {
      if (src[i].ret === 'none') src[i].ret = '7y lock';
      dst[i]!.ret = 'none';
    }
  });
  return { task, src, dst, targets, found: new Set() };
}

/** How the replica's copy of row i differs from the source, or null if it is identical. */
export function diffKind(src: Obj, dst: Obj | null): Kind | null {
  if (!dst) return 'miss';
  if (dst.etag !== src.etag || dst.size !== src.size) return 'etag';
  if (dst.tags !== src.tags) return 'tags';
  if (dst.ret !== src.ret) return 'ret';
  return null;
}

export type Check = 'keys' | 'size' | 'etag' | 'tags' | 'ret';

/** Rows a verifier would report if it only compared the given fields. */
export function verify(r: Round, checks: Check[]): Set<number> {
  const out = new Set<number>();
  r.src.forEach((s, i) => {
    const d = r.dst[i];
    if (!d) {
      if (checks.includes('keys')) out.add(i);
      return;
    }
    if (checks.includes('size') && d.size !== s.size) out.add(i);
    if (checks.includes('etag') && d.etag !== s.etag) out.add(i);
    if (checks.includes('tags') && d.tags !== s.tags) out.add(i);
    if (checks.includes('ret') && d.ret !== s.ret) out.add(i);
  });
  return out;
}

export type FlagResult = 'hit' | 'wrong' | 'again';

export function flag(r: Round, i: number): FlagResult {
  if (r.found.has(i)) return 'again';
  if (r.targets.has(i)) {
    r.found.add(i);
    return 'hit';
  }
  return 'wrong';
}

export const solved = (r: Round): boolean => r.found.size === r.targets.size;
export const left = (r: Round): number => r.targets.size - r.found.size;
