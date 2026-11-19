import { describe, expect, it } from 'vitest';
import * as pt from '../../src/games/partition/sim';

describe('task 2: accept or reject during the partition', () => {
  it('the majority side accepts everything; the cut-off side rejects only money', () => {
    for (const p of pt.PROMPTS) expect(p.accept).toBe(p.side === 'NY' || p.kind !== 'money');
  });
  it('the prompts mix sides and kinds, so a single rule ("accept all", "reject London") fails', () => {
    const acceptAll = pt.PROMPTS.filter((p) => !pt.decide(p, true).ok).length;
    const rejectLondon = pt.PROMPTS.filter((p) => !pt.decide(p, p.side === 'NY').ok).length;
    expect(acceptAll).toBeGreaterThanOrEqual(2);
    expect(rejectLondon).toBeGreaterThanOrEqual(2);
  });
});

describe('task 3: merging carts', () => {
  const [r1, r2] = pt.MERGE_ROUNDS;
  it('keeps every add from both sides and honours removals', () => {
    expect(pt.correctMerge(r1)).toEqual(['book', 'mug', 'pen', 'socks']);
  });
  it('a concurrent add and remove of the same item: add wins', () => {
    expect(pt.correctMerge(r2)).toEqual(['mug', 'scarf']);
  });
  it('taking either side’s cart as-is (last writer wins) loses changes', () => {
    for (const r of pt.MERGE_ROUNDS) for (const side of ['NY', 'London'] as const) expect(pt.checkMerge(r, pt.sideCart(r, side)).ok).toBe(false);
  });
  it('reports what is missing and what should not be there', () => {
    expect(pt.checkMerge(r1, ['mug', 'lamp', 'pen'])).toEqual({ ok: false, missing: ['book', 'socks'], extra: ['lamp'] });
  });
});

describe('task 4: CP or AP', () => {
  it('Raft/Paxos-style stores are CP; Dynamo-style stores are AP', () => {
    expect(pt.SYSTEMS.filter((s) => s.cp).map((s) => s.name)).toEqual(['etcd', 'ZooKeeper', 'Google Spanner']);
    expect(pt.SYSTEMS.filter((s) => !s.cp)).toHaveLength(3);
  });
});
