import { describe, expect, it } from 'vitest';
import * as ck from '../../src/games/clock-skew/sim';

describe('tasks 0–1: wall clocks get the chat wrong', () => {
  it('sorting by timestamp puts the tutorial reply before its question', () => {
    expect(ck.byTimestamp(ck.TUTORIAL_CHAT)).toEqual([1, 0]);
  });
  it('sorting the group chat by timestamp scrambles the real order', () => {
    const order = ck.byTimestamp(ck.CHAT);
    expect(order).not.toEqual(ck.CHAT.map((_, i) => i));
    const misplaced = order.filter((i, s) => i !== s).length;
    expect(misplaced).toBeGreaterThanOrEqual(4);
  });
  it('a skewed clock is the reason: real send times are in order', () => {
    for (let i = 1; i < ck.CHAT.length; i++) expect(ck.CHAT[i].realS).toBeGreaterThan(ck.CHAT[i - 1].realS);
  });
  it('placing out of order is rejected and names the skewed clock', () => {
    expect(ck.place(ck.CHAT, 0, 0).ok).toBe(true);
    const r = ck.place(ck.CHAT, 0, 2);
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/Bob’s clock is 9 s slow/);
  });
  it('formats timestamps around noon, including before it', () => {
    expect(ck.fmtStamp(-1)).toBe('11:59:59');
    expect(ck.fmtStamp(19)).toBe('12:00:19');
  });
});

describe('task 2: Lamport clocks', () => {
  const L = ck.lamport();
  it('local events and sends add 1; receives take max(own, message) + 1', () => {
    expect(L).toEqual({ a1: 1, a2: 2, b1: 3, c1: 1, b2: 4, c2: 5, c3: 6, a3: 7 });
  });
  it('happened-before implies a smaller Lamport timestamp', () => {
    for (const x of ck.EVENTS) for (const y of ck.EVENTS) if (ck.relation(x.id, y.id) === 'before') expect(L[x.id]).toBeLessThan(L[y.id]);
  });
  it('“just count events on this server” is wrong for receives', () => {
    const count = (e: ck.Ev) => ck.EVENTS.slice(0, ck.EVENTS.indexOf(e) + 1).filter((x) => x.p === e.p).length;
    const wrong = ck.EVENTS.filter((e) => !ck.checkLamport(e.id, count(e)).ok);
    expect(wrong.map((e) => e.id)).toEqual(['b1', 'b2', 'c2', 'c3', 'a3']);
  });
  it('a wrong answer explains the rule', () => {
    expect(ck.checkLamport('b1', 2).why).toMatch(/larger of B’s own clock \(0\) and the message’s \(2\)/);
    expect(ck.checkLamport('a2', 1).why).toMatch(/adds 1/);
  });
});

describe('task 3: vector clocks', () => {
  it('computes vectors entry by entry', () => {
    const V = ck.vector();
    expect(V.b2).toEqual([2, 2, 0]);
    expect(V.a3).toEqual([3, 2, 3]);
  });
  it('relation is antisymmetric', () => {
    for (const [x, y] of ck.PAIRS) {
      const r = ck.relation(x, y), back = ck.relation(y, x);
      expect(back).toBe(r === 'before' ? 'after' : r === 'after' ? 'before' : 'concurrent');
    }
  });
  it('half the pairs are concurrent, and Lamport numbers get every one of those wrong', () => {
    const conc = ck.PAIRS.filter(([x, y]) => ck.relation(x, y) === 'concurrent');
    expect(conc.length).toBe(3);
    for (const [x, y] of conc) expect(ck.lamportGuess(x, y)).not.toBe('concurrent');
  });
  it('explains the comparison', () => {
    expect(ck.explainRel('c1', 'a2')).toMatch(/concurrent/);
    expect(ck.explainRel('a2', 'c2')).toMatch(/a2 happened before c2/);
  });
});
