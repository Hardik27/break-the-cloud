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

describe('task 3: who is dead? (SWIM)', () => {
  const play = (i: number, steps: ('direct' | 'indirect')[], v: gs.Verdict) => {
    const r = gs.createSwim(i);
    for (const st of steps) st === 'direct' ? gs.pingDirect(r) : gs.pingIndirect(r);
    return gs.judge(r, v);
  };
  it('a slow member fails your direct ping but answers others: alive', () => {
    const bea = gs.SUSPECTS.findIndex((x) => x.truth === 'slow');
    expect(play(bea, ['direct'], 'dead').ok).toBe(false);
    expect(play(bea, ['direct', 'indirect'], 'alive').ok).toBe(true);
  });
  it('a dead member can only be declared dead after the indirect ping fails too', () => {
    const dev = gs.SUSPECTS.findIndex((x) => x.truth === 'dead');
    expect(play(dev, ['direct'], 'dead').why).toMatch(/Too early/);
    expect(play(dev, ['direct', 'indirect'], 'dead').ok).toBe(true);
  });
  it('a verdict without any check is rejected', () => {
    expect(play(0, [], 'alive').ok).toBe(false);
  });
  it('an alive member answers your own ping', () => {
    const raj = gs.SUSPECTS.findIndex((x) => x.truth === 'alive');
    expect(play(raj, ['direct'], 'alive').ok).toBe(true);
  });
  it('“declare dead after one missed ping” wrongly kills the slow member', () => {
    const naive = gs.SUSPECTS.map((_, i) => play(i, ['direct'], gs.createSwim(i).s.truth === 'alive' ? 'alive' : 'dead').ok);
    expect(naive.filter((ok) => !ok).length).toBeGreaterThanOrEqual(2);
  });
});
