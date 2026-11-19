import { describe, expect, it } from 'vitest';
import * as as from '../../src/games/autoscaler/sim';

/** Scale ahead: add when CPU 90 s from now (with what is already booting) would pass `limit`; remove when idle. */
function playManual(limit: number, ahead: boolean) {
  const m = as.createManual(1);
  let mistakes = 0;
  while (!m.done) {
    for (const e of as.stepManual(m, 100)) if (e.type === 'overload-second' || e.type === 'idle-second') mistakes++;
    const at = ahead ? m.now + as.BOOT_MS : m.now;
    const projected = as.rampDemand(at) / ((m.running + m.booting.length) * as.PER_INSTANCE);
    if (projected > limit) as.addInstance(m);
  }
  return { m, mistakes };
}

describe('tasks 1–2: by hand', () => {
  it('the tutorial is frozen (traffic does not grow) and boots instantly', () => {
    const m = as.createManual(0);
    as.stepManual(m, 60_000);
    expect(m.now).toBe(0);
    expect(as.rampDemand(m.now)).toBe(150);
    as.addInstance(m);
    as.stepManual(m, 16);
    expect(m.running).toBe(as.START_INSTANCES + 1);
    expect(as.removeInstance(m).ok).toBe(true);
  });
  it('booting takes 90 s of real time (3 s of play)', () => {
    const m = as.createManual(1);
    as.addInstance(m);
    as.stepManual(m, as.BOOT_MS - 100);
    expect(m.running).toBe(as.START_INSTANCES);
    as.stepManual(m, 200);
    expect(m.running).toBe(as.START_INSTANCES + 1);
  });
  it('scaling ahead of the ramp avoids overload', () => {
    const { m, mistakes } = playManual(0.8, true);
    expect(m.overloadMs).toBe(0);
    expect(mistakes).toBeLessThanOrEqual(1);
  });
  it('reacting only to current CPU at 100% leaves users with errors', () => {
    const { m } = playManual(1.0, false);
    expect(m.overloadMs).toBeGreaterThan(2000);
  });
  it('doing nothing overloads badly', () => {
    const m = as.createManual(1);
    while (!m.done) as.stepManual(m, 100);
    expect(m.overloadMs).toBeGreaterThan(15000);
  });
});

describe('task 3: target tracking', () => {
  const run = (target: number) => as.runDay({ target, min: 2, prewarm: false }, false);
  it('95% leaves no headroom: noise overloads it', () => {
    expect(run(95).overloadMin).toBeGreaterThan(0);
  });
  it('40% is safe but too expensive', () => {
    expect(run(40).overloadMin).toBe(0);
    expect(run(40).cost).toBeGreaterThan(as.BUDGET_DAY);
  });
  it('60% and 80% are safe and within budget', () => {
    expect(as.TARGETS.filter((t) => as.dayOk(run(t), false))).toEqual([60, 80]);
  });
});

describe('task 4: the flash sale', () => {
  const run = (o: Partial<as.AutoOpts>) => as.runDay({ target: 60, min: 2, prewarm: false, ...o }, true);
  it('no reactive setting survives a step change faster than boot time', () => {
    for (const target of [60, 80]) for (const min of as.MINS) expect(run({ target, min }).overloadMin).toBeGreaterThan(0);
  });
  it('a scheduled pre-warm survives; a huge minimum blows the budget', () => {
    expect(as.dayOk(run({ prewarm: true }), true)).toBe(true);
    expect(as.dayOk(run({ target: 80, prewarm: true }), true)).toBe(true);
    expect(as.dayOk(run({ prewarm: true, min: 12 }), true)).toBe(false);
  });
});
