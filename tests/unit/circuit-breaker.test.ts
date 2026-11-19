import { describe, expect, it } from 'vitest';
import * as cb from '../../src/games/circuit-breaker/sim';

/** A breaker player: open when threads pass `openAt`, probe every 2 s while open, close on a good probe. */
function play(openAt: number) {
  const m = cb.createManual(1);
  let lastProbe = 0;
  while (!m.done) {
    cb.stepManual(m, 100);
    if (!m.open && cb.threadsBusy(m) >= openAt) cb.toggle(m);
    if (m.open && m.now - lastProbe >= 2000) {
      lastProbe = m.now;
      if (cb.probe(m)) cb.toggle(m);
    }
  }
  return m;
}

describe('task 2: you are the breaker', () => {
  it('without a breaker, hanging calls take every thread and the whole page goes down', () => {
    const m = cb.createManual(1);
    while (!m.done) cb.stepManual(m, 100);
    expect(m.pageDownMs).toBeGreaterThan(5000);
  });
  it('opening early and closing after a good probe keeps the page up', () => {
    const m = play(8);
    expect(m.pageDownMs).toBe(0);
    expect(m.lostMs).toBe(0);
  });
  it('a calls slower than 500 ms counts as failed quickly', () => {
    const m = cb.createManual(1);
    cb.stepManual(m, cb.OUTAGES[0][0] + 1500);
    expect(cb.errorRate(m)).toBeGreaterThan(0.5);
  });
  it('a probe tells the truth about the service', () => {
    const m = cb.createManual(1);
    cb.stepManual(m, cb.OUTAGES[0][0] + 100);
    expect(cb.probe(m)).toBe(false);
    cb.stepManual(m, cb.OUTAGES[0][1] - cb.OUTAGES[0][0]);
    expect(cb.probe(m)).toBe(true);
  });
});

describe('task 3: failure threshold', () => {
  it('1 failure trips on harmless blips; 50 lets the page go down; 5 is right', () => {
    expect(cb.runAuto(1, 5).falseOpens).toBeGreaterThan(0);
    expect(cb.runAuto(50, 5).pageDownMs).toBeGreaterThan(0);
    expect(cb.THRESHOLDS.filter((n) => cb.thresholdOk(cb.runAuto(n, 5)))).toEqual([5]);
  });
});

describe('task 4: probe interval', () => {
  it('probing every second hammers the service; every 30–60 s leaves features off too long', () => {
    expect(cb.runAuto(5, 1).probesInOutage).toBeGreaterThan(cb.PROBE_BUDGET);
    expect(cb.runAuto(5, 30).recoveryMs).toBeGreaterThan(cb.RECOVERY_GOAL_MS);
    expect(cb.PROBES_S.filter((p) => cb.probeOk(cb.runAuto(5, p)))).toEqual([5]);
  });
});
