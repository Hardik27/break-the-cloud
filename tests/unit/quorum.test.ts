import { describe, expect, it } from 'vitest';
import * as q from '../../src/games/quorum/sim';

function round(c: q.Coord, writeTo: number[], readFrom: number[]) {
  for (const i of writeTo) q.toggleSelect(c, i);
  const w = q.sendWrite(c);
  for (const i of readFrom) q.toggleSelect(c, i);
  const r = q.sendRead(c);
  q.nextRound(c);
  return { w, r };
}

describe('task 1: coordinating by hand', () => {
  it('a write updates only the picked replicas, with a new version', () => {
    const c = q.createCoord();
    q.toggleSelect(c, 1);
    q.sendWrite(c);
    expect(c.replicas.map((r) => r.version)).toEqual([0, 1, 0]);
  });
  it('a read returns the newest version among the replicas asked', () => {
    const c = q.createCoord();
    const { r } = round(c, [0, 1], [1, 2]);
    expect(r).toEqual({ value: 10, fresh: true });
  });
  it('reading from a replica that missed the write is stale', () => {
    const c = q.createCoord();
    expect(round(c, [0], [2]).r!.fresh).toBe(false);
  });
  it('in a crash round, a replica you wrote to crashes and cannot be picked', () => {
    const c = q.createCoord();
    round(c, [0, 1], [0, 1]);
    q.toggleSelect(c, 0);
    q.toggleSelect(c, 1);
    const w = q.sendWrite(c);
    expect(w.crashed).toBe(0);
    expect(q.toggleSelect(c, 0)).toBe('down');
  });
  it('writing to one replica fails when it crashes: no fresh read is possible', () => {
    const c = q.createCoord();
    round(c, [2], [2]);
    q.toggleSelect(c, 2);
    q.sendWrite(c);
    expect(c.replicas.some((r) => r.up && r.version === c.latest)).toBe(false);
  });
  it('write to 2, read from 2 is fresh in every round, crashes included', () => {
    const c = q.createCoord();
    for (let i = 0; i < q.ROUNDS; i++) {
      const live = [0, 1, 2];
      for (const k of [0, 1]) q.toggleSelect(c, k);
      q.sendWrite(c);
      for (const k of live.filter((k) => c.replicas[k].up).slice(0, 2)) q.toggleSelect(c, k);
      expect(q.sendRead(c)!.fresh).toBe(true);
      q.nextRound(c);
    }
    expect(q.coordDone(c)).toBe(true);
    expect(c.stale).toBe(0);
  });
  it('crashed replicas restart in the next round with their data', () => {
    const c = q.createCoord();
    round(c, [0, 1], [0, 1]);
    round(c, [0, 1], [1, 2]);
    expect(c.replicas.every((r) => r.up)).toBe(true);
    expect(c.replicas[0].version).toBe(2);
  });
});

describe('task 2: R and W with every replica up', () => {
  it('R + W ≤ N gives stale reads', () => {
    for (const [r, w] of [[1, 1], [1, 2], [2, 1]]) expect(q.runQuorum(r, w, false).stalePct).toBeGreaterThan(5);
  });
  it('R + W > N never gives a stale read', () => {
    for (const r of q.RS) for (const w of q.WS) if (r + w > q.N) expect(q.runQuorum(r, w, false).stalePct).toBe(0);
  });
  it('only the overlapping settings within 80 ms pass', () => {
    const pass = q.RS.flatMap((r) => q.WS.filter((w) => q.checkFresh(r, w).ok).map((w) => `${r}${w}`));
    expect(pass).toEqual(['13', '22', '31']);
  });
  it('explains the failure', () => {
    expect(q.checkFresh(1, 1).why).toMatch(/stale/);
    expect(q.checkFresh(3, 3).why).toMatch(/budget/);
  });
});

describe('task 3: one replica down, then back', () => {
  it('only R=2, W=2 stays fresh and available', () => {
    const pass = q.RS.flatMap((r) => q.WS.filter((w) => q.checkOneDown(r, w).ok).map((w) => `${r}${w}`));
    expect(pass).toEqual(['22']);
  });
  it('W=3 loses writes and R=3 loses reads while C is down', () => {
    expect(q.runQuorum(1, 3, true).writeAvailPct).toBe(50);
    expect(q.runQuorum(3, 1, true).readAvailPct).toBe(50);
  });
  it('R + W = N is fresh while C is down but stale once it returns with old data', () => {
    expect(q.checkOneDown(1, 2).why).toMatch(/came back/);
    expect(q.checkOneDown(2, 1).why).toMatch(/came back/);
  });
});
