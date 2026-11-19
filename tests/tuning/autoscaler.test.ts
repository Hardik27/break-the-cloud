/** Difficulty tuning for Autoscaler: task 2 has a fixed length; correct play must stay clean, reactive play must not. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as as from '../../src/games/autoscaler/sim';
import { report } from './util';

function play(seed: number, ahead: boolean) {
  const rng = mulberry32(seed);
  const m = as.createManual(1);
  let mistakes = 0;
  let nextLook = 0;
  while (!m.done) {
    for (const e of as.stepManual(m, 50)) if (e.type === 'overload-second' || e.type === 'idle-second') mistakes++;
    if (m.now < nextLook) continue;
    nextLook = m.now + between(rng, 500, 1100); // a human glances at the gauge every half second or so
    const at = ahead ? m.now + as.BOOT_MS : m.now;
    const load = as.rampDemand(at) / ((m.running + m.booting.length) * as.PER_INSTANCE);
    if (load > (ahead ? 0.8 : 0.98)) as.addInstance(m);
  }
  return mistakes;
}

describe('Autoscaler difficulty', () => {
  it('task 2: scale ahead vs react to current CPU', () => {
    let clean = 0, reactiveFails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (play(seed, true) <= 1) clean++;
      if (play(seed, false) >= 2) reactiveFails++;
    }
    report('autoscaler', `task 2 (fixed ${(as.RAMP_MS + 3000) / 1000} s; ahead clean ${clean}/200; wrong: react at 98% CPU)`, (as.RAMP_MS + 3000) / 1000, clean / 200, reactiveFails / 200);
    expect(clean / 200).toBeGreaterThan(0.9);
    expect(reactiveFails / 200).toBeGreaterThan(0.5);
  });
  it('tasks 3–4: modelled', () => {
    report('autoscaler', 'tasks 3–4 (wrong: 95% target / no pre-warm)', 15, 1, 1);
    expect(as.dayOk(as.runDay({ target: 95, min: 2, prewarm: false }, false), false)).toBe(false);
  });
});
