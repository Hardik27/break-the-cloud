import { describe, expect, it } from 'vitest';
import * as bz from '../../src/games/byzantine-generals/sim';

const VS: bz.V[] = ['A', 'R'];

describe('task 1: three generals, one traitor', () => {
  it('every round has a move that splits the loyal generals', () => {
    for (const r of bz.ROUNDS1) {
      const picks = r.you === 'C' ? VS.flatMap((a) => VS.map((b) => ({ toL1: a, toL2: b }))) : VS.map((v) => ({ relay: v }));
      expect(picks.some((p) => bz.play1(r, p).broken)).toBe(true);
    }
  });
  it('an honest move does not split them', () => {
    expect(bz.play1(bz.ROUNDS1[0], { toL1: 'A', toL2: 'A' }).broken).toBe(false);
    expect(bz.play1(bz.ROUNDS1[1], { relay: 'A' }).broken).toBe(false);
  });
  it('whichever tie rule L1 uses, a lying lieutenant flips it', () => {
    expect(bz.play1(bz.ROUNDS1[1], { relay: 'R' }).actions).toEqual({ C: 'A', L1: 'R' });
    expect(bz.play1(bz.ROUNDS1[2], { relay: 'A' }).actions).toEqual({ C: 'R', L1: 'A' });
  });
});

describe('task 2: four generals, majority (OM(1))', () => {
  it('all loyal lieutenants reach the same decision in every round, whatever the traitor does', () => {
    for (const r of [bz.TUTORIAL2, ...bz.ROUNDS2]) {
      const ds = bz.loyalLts(r).map((l) => bz.decide2(r, l));
      expect(new Set(ds).size).toBe(1);
      if (r.traitor !== 'C') expect(ds[0]).toBe(r.direct.L1); // a loyal commander is obeyed
    }
  });
  it('exhaustively: any traitor and any lies, loyal lieutenants agree', () => {
    for (const traitor of ['C', 'L2', 'L3'] as const)
      for (const a of VS) for (const b of VS) for (const c of VS) for (const lie of VS) {
        const direct = traitor === 'C' ? { L1: a, L2: b, L3: c } : { L1: a, L2: a, L3: a };
        const r: bz.Round2 = { traitor, direct, lie };
        expect(new Set(bz.loyalLts(r).map((l) => bz.decide2(r, l))).size).toBe(1);
      }
  });
  it('trusting the commander alone is wrong when the commander lies', () => {
    expect(bz.ROUNDS2.some((r) => bz.decide2(r, 'L1') !== r.direct.L1)).toBe(true);
  });
});

describe('task 3: N ≥ 3f + 1', () => {
  it('7 generals tolerate 2 traitors, not 3; 3 traitors need 10', () => {
    expect(bz.tolerates(7, 2)).toBe(true);
    expect(bz.tolerates(7, 3)).toBe(false);
    expect(bz.MAX_TRAITORS).toBe(2);
    expect(bz.NEED_FOR_3).toBe(10);
    expect(bz.tolerates(9, 3)).toBe(false);
  });
  it('explains the quorum overlap', () => {
    expect(bz.explainRun(7, 2)).toMatch(/share 3 generals/);
    expect(bz.explainRun(7, 3)).toMatch(/split/);
  });
});
