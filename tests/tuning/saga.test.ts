/** Difficulty tuning for Saga (turn-based; time modelled per click and per decision). */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as sg from '../../src/games/saga/sim';
import { median, report } from './util';

/** A correct player: do steps; retry timeouts; on a permanent failure undo newest first. Returns clicks. */
function solve(trip: sg.Trip) {
  const s = sg.createSaga(trip);
  let clicks = 0;
  while (!s.outcome) {
    clicks++;
    if (sg.permanentlyFailed(s)) sg.undoStep(s, s.status.lastIndexOf('done'));
    else {
      const failed = s.status.indexOf('failed');
      sg.doStep(s, failed >= 0 ? failed : s.status.findIndex((x) => x !== 'done'));
    }
  }
  return clicks;
}
/** A wrong player: undoes in the order the steps ran (oldest first). Counts rejected clicks. */
function oldestFirst(trip: sg.Trip) {
  const s = sg.createSaga(trip);
  let bad = 0;
  for (let i = 0; i < 4 && !sg.permanentlyFailed(s); i++) sg.doStep(s, i);
  for (let i = 0; i < 4; i++) if (s.status[i] === 'done' && !sg.undoStep(s, i).ok) bad++;
  return bad;
}

describe('Saga difficulty', () => {
  it('tasks take 10–40 s; undoing oldest first and naive email designs fail', () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
    const time = (clicks: number) => seeds.map((seed) => {
      const rng = mulberry32(seed);
      let ms = 3000;
      for (let k = 0; k < clicks; k++) ms += between(rng, 1300, 2600);
      return ms;
    });
    const c2 = sg.BOOK_TRIPS.reduce((a, t) => a + solve(t), 0);
    const c3 = sg.FAIL_TRIPS.reduce((a, t) => a + solve(t), 0);
    const t2 = median(time(c2 + 2)) / 1000; // + reading each trip
    const t3 = median(time(c3 + 4)) / 1000;
    const t4 = 3000 / 1000 + 3 * 4;
    const wrong3 = sg.FAIL_TRIPS.map(oldestFirst).filter((b) => b > 0).length / sg.FAIL_TRIPS.length;
    const naive = sg.DESIGNS.flatMap((d) => [false, true].map((x) => sg.outboxOk(sg.runOutbox(d.id, x)))).filter((ok) => !ok).length / 6;
    report('saga', `task 2 (${c2} clicks)`, t2, 1, 1);
    report('saga', `task 3 (${c3} clicks; wrong: undo oldest first)`, t3, 1, wrong3);
    report('saga', 'task 4 (wrong: any design but outbox + dedupe)', t4, 1, naive);
    for (const t of [t2, t3, t4]) {
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(40);
    }
    expect(wrong3).toBe(1);
    expect(naive).toBeGreaterThan(0.5);
  });
});
