import { describe, expect, it } from 'vitest';
import * as gs from '../../src/games/gossip/sim';

describe('task 1: spreading by hand', () => {
  it('using every tell doubles the informed set each round: 16 nodes in log2 16 = 4 rounds', () => {
    const m = gs.createManual();
    let next = 1;
    while (!gs.manualDone(m)) {
      while (m.slots > 0 && next < gs.MANUAL_N) expect(gs.tell(m, next++)).toBe('ok');
      if (!gs.manualDone(m)) expect(gs.nextRound(m).wasted).toBe(0);
    }
    expect(m.round).toBe(gs.idealRounds(gs.MANUAL_N));
  });
  it('telling a node that knows is rejected; ending a round early wastes tells', () => {
    const m = gs.createManual();
    expect(gs.tell(m, 0)).toBe('known');
    expect(gs.nextRound(m).wasted).toBe(1);
    expect(gs.tell(m, 1)).toBe('ok');
    expect(gs.tell(m, 2)).toBe('no-slots');
  });
});

describe('task 2: random gossip and fanout', () => {
  it('fanout 1 and 2 are too slow; 4 and 6 break the message budget; 3 passes', () => {
    expect(gs.FANOUTS.filter((f) => gs.checkFanout(f).ok)).toEqual([3]);
  });
  it('rounds grow like log N: quadrupling the cluster adds only a couple of rounds', () => {
    const r50 = gs.trials(50, 3).median, r200 = gs.trials(200, 3).median, r800 = gs.trials(800, 3).median;
    expect(r200 - r50).toBeLessThanOrEqual(2);
    expect(r800 - r200).toBeLessThanOrEqual(2);
    expect(r800).toBeLessThan(12);
  });
  it('the animation run informs everyone, never un-informs', () => {
    const at = gs.infectionRounds(50, 3, 1);
    expect(at.every((r) => r >= 0)).toBe(true);
    expect(at[0]).toBe(0);
  });
});

describe('task 3: failure detection from heartbeats', () => {
  it('live nodes never look dead; the laggard stalls for less than the timeout', () => {
    for (const p of gs.PEERS) if (!(p in gs.DEATHS)) for (let r = 1; r <= 20; r++) expect(gs.age(p, r)).toBeLessThan(gs.SUSPECT_AFTER);
    expect(Math.max(...Array.from({ length: 20 }, (_, r) => gs.age('E', r + 1)))).toBe(gs.SUSPECT_AFTER - 1);
  });
  it('dead nodes cross the timeout', () => {
    for (const p of Object.keys(gs.DEATHS)) expect(gs.age(p, gs.DEATHS[p] + 1 + gs.SUSPECT_AFTER)).toBeGreaterThanOrEqual(gs.SUSPECT_AFTER);
  });
  it('marking too early is a false alarm; at the timeout it is accepted', () => {
    expect(gs.markCheck('E', 7).ok).toBe(false);
    expect(gs.markCheck('C', 6).ok).toBe(false);
    expect(gs.markCheck('C', 8).ok).toBe(true);
    expect(gs.markCheck('F', 14).ok).toBe(true);
  });
  it('both deaths are detectable within the round budget', () => {
    for (const p of Object.keys(gs.DEATHS)) {
      const r = Array.from({ length: gs.HB_ROUNDS }, (_, k) => k + 1).find((k) => gs.markCheck(p, k).ok);
      expect(r).toBeDefined();
    }
  });
});
