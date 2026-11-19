import { describe, expect, it } from 'vitest';
import * as tp from '../../src/games/two-phase-commit/sim';

describe('task 1: the coordinator decides from the votes', () => {
  it('commits only when every bank votes yes', () => {
    for (const t of tp.TRANSFERS) {
      expect(tp.decide(t, tp.allYes(t)).ok).toBe(true);
      expect(tp.decide(t, !tp.allYes(t)).ok).toBe(false);
    }
  });
  it('a missing vote counts as no', () => {
    const t = tp.TRANSFERS.find((x) => x.votes.includes('timeout'))!;
    expect(tp.decide(t, true).why).toMatch(/never answered/);
  });
  it('mixes outcomes so “always commit” and “always abort” both fail', () => {
    expect(tp.TRANSFERS.filter((t) => !tp.decide(t, true).ok).length).toBeGreaterThanOrEqual(2);
    expect(tp.TRANSFERS.filter((t) => !tp.decide(t, false).ok).length).toBeGreaterThanOrEqual(2);
  });
});

describe('task 2: recovery from the participant log', () => {
  it('in doubt (voted yes, no decision) means ask; otherwise decide alone', () => {
    for (const r of tp.RECOVERIES) {
      const votedYes = r.log.some((l) => l.includes('voted YES'));
      const decision = r.log.some((l) => l.startsWith('DECISION'));
      expect(r.answer === 'ask').toBe(votedYes && !decision);
    }
  });
  it('deciding alone when in doubt is wrong', () => {
    const r = tp.RECOVERIES.find((x) => x.answer === 'ask')!;
    expect(tp.recover(r, 'commit').ok).toBe(false);
    expect(tp.recover(r, 'abort').ok).toBe(false);
  });
  it('“always ask” is wrong when the log already settles it', () => {
    expect(tp.RECOVERIES.filter((r) => !tp.recover(r, 'ask').ok).length).toBeGreaterThanOrEqual(3);
  });
});

describe('task 3: blocking when the coordinator dies', () => {
  it('learns the outcome from a peer that knows it, and waits only when both are in doubt', () => {
    for (const b of tp.BLOCKED) expect(b.answer).toBe(b.peer === 'yes' ? 'wait' : b.peer === 'commit' ? 'commit' : 'abort');
  });
  it('deciding alone when both are in doubt is unsafe; waiting when A knows wastes lock time', () => {
    const inDoubt = tp.BLOCKED.find((b) => b.peer === 'yes')!;
    expect(tp.terminate(inDoubt, 'commit').ok).toBe(false);
    const knows = tp.BLOCKED.find((b) => b.peer === 'commit')!;
    expect(tp.terminate(knows, 'wait').why).toMatch(/locked/);
  });
});
