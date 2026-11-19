import { describe, expect, it } from 'vitest';
import * as sg from '../../src/games/saga/sim';

const run = (trip: sg.Trip, acts: [('do' | 'undo'), number][]) => {
  const s = sg.createSaga(trip);
  const out = acts.map(([a, i]) => (a === 'do' ? sg.doStep(s, i) : sg.undoStep(s, i)));
  return { s, out };
};

describe('task 1: booking step by step', () => {
  it('runs the steps in order and books the trip', () => {
    const { s, out } = run(sg.BOOK_TRIPS[0], [['do', 0], ['do', 1], ['do', 2], ['do', 3]]);
    expect(out.every((r) => r.ok)).toBe(true);
    expect(s.outcome).toBe('booked');
  });
  it('rejects running a later step first', () => {
    const { out } = run(sg.BOOK_TRIPS[0], [['do', 1]]);
    expect(out[0].ok).toBe(false);
  });
  it('a timeout succeeds on retry', () => {
    const { s, out } = run(sg.BOOK_TRIPS[1], [['do', 0], ['do', 1], ['do', 1], ['do', 2], ['do', 3]]);
    expect(out[1]).toMatchObject({ ok: true, event: 'failed' });
    expect(s.outcome).toBe('booked');
  });
  it('undoing after a timeout is a mistake: retry instead', () => {
    const { out } = run(sg.BOOK_TRIPS[1], [['do', 0], ['do', 1], ['undo', 0]]);
    expect(out[2]).toMatchObject({ ok: false });
    expect((out[2] as { why: string }).why).toMatch(/Retry/);
  });
  it('undoing when nothing failed is a mistake', () => {
    expect(run(sg.BOOK_TRIPS[0], [['do', 0], ['undo', 0]]).out[1].ok).toBe(false);
  });
});

describe('task 2: compensating a permanent failure', () => {
  it('car sold out: cancel hotel, then flight', () => {
    const { s, out } = run(sg.FAIL_TRIPS[0], [['do', 0], ['do', 1], ['do', 2], ['undo', 1], ['undo', 0]]);
    expect(out.every((r) => r.ok)).toBe(true);
    expect(s.outcome).toBe('rolled back');
  });
  it('retrying a permanent failure does not help', () => {
    const { out } = run(sg.FAIL_TRIPS[0], [['do', 0], ['do', 1], ['do', 2], ['do', 2]]);
    expect(out[3].ok).toBe(false);
  });
  it('undo must go newest first', () => {
    const { out } = run(sg.FAIL_TRIPS[1], [['do', 0], ['do', 1], ['do', 2], ['do', 3], ['undo', 0]]);
    expect((out[4] as { why: string }).why).toMatch(/newest first/);
  });
  it('the failed step itself has nothing to undo', () => {
    const { out } = run(sg.FAIL_TRIPS[1], [['do', 0], ['do', 1], ['do', 2], ['do', 3], ['undo', 3]]);
    expect((out[4] as { why: string }).why).toMatch(/nothing to undo/);
  });
});

describe('task 3: publishing the event', () => {
  it('save-then-publish loses events; publish-then-save invents them', () => {
    expect(sg.runOutbox('commit-publish', true).lost).toBeGreaterThan(0);
    expect(sg.runOutbox('publish-commit', true).ghost).toBeGreaterThan(0);
  });
  it('the outbox never loses or invents events but can deliver twice', () => {
    const r = sg.runOutbox('outbox', false);
    expect(r.lost + r.ghost).toBe(0);
    expect(r.dup).toBeGreaterThan(0);
  });
  it('only outbox plus a deduplicating consumer is exactly once', () => {
    const pass = sg.DESIGNS.flatMap((d) => [false, true].filter((x) => sg.outboxOk(sg.runOutbox(d.id, x))).map((x) => `${d.id}:${x}`));
    expect(pass).toEqual(['outbox:true']);
  });
});
