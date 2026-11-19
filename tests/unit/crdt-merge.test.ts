import { describe, expect, it } from 'vitest';
import * as cr from '../../src/games/crdt-merge/sim';

describe('task 1: a plain counter loses updates', () => {
  it('every simple merge of two numbers is wrong', () => {
    const n = cr.naiveMerges(cr.WANT_INC);
    expect(n.correct).toBe(15);
    for (const v of [n.lww, n.max, n.sum]) expect(v).not.toBe(n.correct);
  });
  it('offers the right total among the choices', () => {
    expect(cr.totalChoices(cr.WANT_INC)).toContain(15);
  });
});

describe('task 2: G-counter', () => {
  it('merges entry by entry with max', () => {
    expect(cr.gMerge([3, 1, 0], [2, 4, 0])).toEqual([3, 4, 0]);
  });
  it('merge is commutative, associative and idempotent', () => {
    const [a, b, c] = [[3, 1, 0], [2, 4, 0], [1, 0, 5]];
    expect(cr.gMerge(a, b)).toEqual(cr.gMerge(b, a));
    expect(cr.gMerge(cr.gMerge(a, b), c)).toEqual(cr.gMerge(a, cr.gMerge(b, c)));
    expect(cr.gMerge(a, a)).toEqual(a);
  });
  it('the merged value never loses an increment either side saw', () => {
    for (const r of cr.G_ROUNDS) {
      const m = cr.gValue(cr.gMerge(r.va, r.vb));
      expect(m).toBeGreaterThanOrEqual(Math.max(cr.gValue(r.va), cr.gValue(r.vb)));
    }
  });
  it('adding entries double-counts; taking the smaller loses likes', () => {
    const r = cr.G_ROUNDS[0];
    expect(cr.checkSlot(r, 0, 5).why).toMatch(/twice/);
    expect(cr.checkSlot(r, 0, 2).why).toMatch(/loses/);
    expect(cr.checkSlot(r, 0, 3).ok).toBe(true);
  });
});

describe('task 3: OR-set', () => {
  it('a concurrent re-add survives a remove that did not see it (add wins)', () => {
    expect(cr.orMerge(cr.SET_ROUNDS[0])).toEqual(['eggs', 'milk']);
  });
  it('both removing the same tag removes it; two adds of the same item give one item', () => {
    expect(cr.orMerge(cr.SET_ROUNDS[1])).toEqual(['jam', 'tea']);
  });
  it('removing your own add does not remove another device’s add', () => {
    expect(cr.orMerge(cr.SET_ROUNDS[2])).toEqual(['rice', 'soap']);
  });
  it('“remove wins” loses items the OR-set keeps', () => {
    expect(cr.SET_ROUNDS.filter((r) => cr.removeWins(r).join() !== cr.orMerge(r).join()).length).toBeGreaterThanOrEqual(2);
  });
  it('explains a wrong merge with the tags', () => {
    expect(cr.checkSet(cr.SET_ROUNDS[0], ['eggs']).why).toMatch(/milk should stay: .* tag l1/);
    expect(cr.checkSet(cr.SET_ROUNDS[0], ['eggs', 'milk', 'bread']).why).toMatch(/bread should go/);
  });
});
