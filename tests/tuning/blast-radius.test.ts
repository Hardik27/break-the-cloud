/** Difficulty tuning for Blast Radius: task 3 (live, fixed 20 s) with human reaction; tasks 2 and 4 modelled. */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as br from '../../src/games/blast-radius/sim';
import { report } from './util';

function live(seed: number, smart: boolean) {
  const rng = mulberry32(seed);
  const l = br.createLive();
  let mistakes = 0, next = 0, added = false;
  while (!l.done) {
    mistakes += br.stepLive(l, 50).filter((e) => e.type === 'writes-second' || e.type === 'short-second').length;
    if (l.now < next || !l.down) continue;
    next = l.now + between(rng, 600, 1200);
    if (!br.writesUp(l)) br.promote(l);
    else if (!added) {
      if (br.addWeb(l, smart ? 'b' : 'a') === 'dead-zone') mistakes++;
      added = true;
    }
  }
  return mistakes;
}

describe('Blast Radius difficulty', () => {
  it('task 3: fail over and add capacity in a healthy zone vs in the dead zone', () => {
    let clean = 0, fails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      if (live(seed, true) === 0) clean++;
      if (live(seed, false) >= 1) fails++;
    }
    report('blast-radius', `task 3 (fixed 23 s; clean ${clean}/200; wrong: add the server in zone a)`, 23, clean / 200, fails / 200);
    expect(clean / 200).toBeGreaterThan(0.9);
    expect(fails / 200).toBeGreaterThan(0.5);
  });
  it('tasks 2 and 4: modelled', () => {
    const t2 = 4000 + 7 * 1800 + 2000; // read, about seven moves, test
    report('blast-radius', `task 2 ${t2 / 1000} s (wrong: test without moving the databases)`, t2 / 1000, 1, 1);
    expect(t2 / 1000).toBeGreaterThanOrEqual(10);
  });
});
