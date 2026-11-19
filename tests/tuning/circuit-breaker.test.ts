/** Difficulty tuning for Circuit Breaker task 2 (fixed 30 s): a watchful player vs one who never probes. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as cb from '../../src/games/circuit-breaker/sim';
import { report } from './util';

function play(seed: number, probes: boolean) {
  const rng = mulberry32(seed);
  const m = cb.createManual(1);
  let next = 0, mistakes = 0;
  while (!m.done) {
    mistakes += cb.stepManual(m, 50).filter((e) => e.type === 'down-second' || e.type === 'lost-second').length;
    if (m.now < next) continue;
    next = m.now + between(rng, 500, 1000); // glance at the dashboard twice a second
    if (!m.open && cb.threadsBusy(m) >= 6) cb.toggle(m);
    else if (m.open && probes && cb.probe(m)) cb.toggle(m);
  }
  return mistakes;
}

describe('Circuit Breaker difficulty', () => {
  it('task 2: open on rising threads and probe vs never close again', () => {
    let clean = 0, fails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (play(seed, true) <= 1) clean++;
      if (play(seed, false) >= 2) fails++;
    }
    report('circuit-breaker', `task 2 (fixed 33 s; watchful clean ${clean}/200; wrong: open and never probe)`, 33, clean / 200, fails / 200);
    expect(clean / 200).toBeGreaterThan(0.9);
    expect(fails / 200).toBeGreaterThan(0.5);
  });
});
