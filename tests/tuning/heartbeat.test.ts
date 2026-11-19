/**
 * Difficulty tuning for Heartbeat task 2 (real time): a patient player evicts after ~2.5 s of silence;
 * an eager one after ~0.9 s. Patience must finish in 10–40 s with no mistakes; eagerness must make mistakes.
 */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as hb from '../../src/games/heartbeat/sim';
import { median, report } from './util';

function play(seed: number, waitMs: number) {
  const rng = mulberry32(seed + 500);
  const s = hb.create(1, mulberry32(seed));
  const t0 = s.now;
  const pending = new Map<number, number>();
  let mistakes = 0;
  while (s.now - t0 < 60_000 && !hb.byHandDone(s)) {
    for (const e of hb.step(s, 50)) if (e.type === 'overdue') mistakes++;
    s.servers.forEach((srv, i) => {
      const ready = !srv.inPool && srv.replaceAt === null && srv.state !== 'dead';
      const want = (srv.inPool && hb.silence(s, i) >= waitMs) || ready;
      if (!want) return pending.delete(i);
      if (!pending.has(i)) pending.set(i, s.now + between(rng, 400, 800));
      if (s.now >= pending.get(i)!) {
        const r = hb.toggle(s, i);
        if (r.kind === 'evicted-paused' || r.kind === 'evicted-healthy') mistakes++;
        pending.delete(i);
      }
    });
  }
  return { ms: s.now - t0 + 3000, done: hb.byHandDone(s), mistakes };
}

describe('Heartbeat difficulty', () => {
  it('task 2: patient vs eager failure detection', () => {
    const times: number[] = [];
    let eagerFails = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const c = play(seed, 2500);
      expect(c.done).toBe(true);
      expect(c.mistakes).toBe(0);
      times.push(c.ms);
      if (play(seed, 900).mistakes >= 1) eagerFails++;
    }
    const med = median(times) / 1000;
    report('heartbeat', 'task 2 (wrong: evicts after 0.9 s of silence)', med, 1, eagerFails / 200);
    expect(med).toBeGreaterThanOrEqual(10);
    expect(med).toBeLessThanOrEqual(40);
    expect(eagerFails / 200).toBeGreaterThan(0.5);
  });
  it('tasks 3–4: a few runs of the detector', () => {
    const ms = 6000 + 3 * 2500;
    report('heartbeat', 'tasks 3–4 (wrong: keep the timeout short)', ms / 1000, 1, 1);
    expect(hb.runDetector(500, 5).falseEvictions.length).toBeGreaterThan(0);
  });
});
