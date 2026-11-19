/**
 * Difficulty tuning for Handshake (a decision puzzle, so time is modelled):
 * reading the task, then a think-and-click time per decision. Wrong strategies must make mistakes.
 */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as hs from '../../src/games/handshake/sim';
import { median, report } from './util';

const READ = 3000;
const decide = (rng: () => number, think: number) => think + between(rng, 600, 1200);

function task2(seed: number, wrong: boolean) {
  const rng = mulberry32(seed);
  const s = hs.createHandshake(1, mulberry32(seed + 7));
  let ms = READ;
  while (!hs.hsDone(s)) {
    const want = hs.expectedPkt(s, 1)!;
    const guess = wrong && hs.role(s) === 'server' ? 'SYN' : want;
    ms += decide(rng, 1500);
    if (!hs.send(s, 1, guess).ok) hs.send(s, 1, want);
  }
  return { ms, mistakes: s.mistakes };
}
function task3(seed: number, wrong: boolean) {
  const rng = mulberry32(seed);
  let ms = READ, mistakes = 0;
  for (let round = 0; round < 3; round++) {
    const r = hs.makeLoss(mulberry32(seed * 3 + round));
    ms += decide(rng, 2500); // read the ACK row
    const pick = wrong ? r.n - 1 : r.dropped; // wrong: "resend the last one"
    if (!hs.resend(r, pick).ok) {
      mistakes++;
      ms += decide(rng, 1500);
    }
  }
  return { ms, mistakes };
}
function task4(seed: number, wrong: boolean) {
  const rng = mulberry32(seed);
  let ms = READ, mistakes = 0;
  for (let round = 0; round < 2; round++) {
    const r = hs.makeOrder(mulberry32(seed * 5 + round));
    const clicks = wrong ? r.arrived : [0, 1, 2, 3, 4]; // wrong: click in arrival order
    for (const seg of clicks) {
      ms += decide(rng, 600);
      if (!hs.deliver(r, seg).ok) mistakes++;
    }
  }
  return { ms, mistakes };
}

describe('Handshake difficulty', () => {
  const cases: [string, (seed: number, wrong: boolean) => { ms: number; mistakes: number }, string][] = [
    ['task 2', task2, 'answers like a client when it is the server'],
    ['task 3', task3, 'resends the last segment'],
    ['task 4', task4, 'delivers in arrival order'],
  ];
  for (const [name, play, wrongLabel] of cases) {
    it(name, () => {
      const times: number[] = [];
      let fails = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const c = play(seed, false);
        expect(c.mistakes).toBe(0);
        times.push(c.ms);
        if (play(seed, true).mistakes >= 1) fails++;
      }
      const med = median(times) / 1000;
      report('handshake', `${name} (wrong: ${wrongLabel})`, med, 1, fails / 200);
      expect(med).toBeGreaterThanOrEqual(10);
      expect(med).toBeLessThanOrEqual(40);
      expect(fails / 200).toBeGreaterThan(0.5);
    });
  }
  it('task 5: only connection reuse and HTTP/2 meet the goals', () => {
    // Read 6 s, then about four tries of a few seconds each.
    const ms = 6000 + 4 * 2500;
    report('handshake', 'task 5 (wrong: only adds parallel connections)', ms / 1000, 1, 1);
    expect(hs.loadPage({ keepAlive: false, parallel: 6, http2: false }).ms).toBeGreaterThan(hs.GOALS[0]);
    expect(ms / 1000).toBeGreaterThanOrEqual(10);
  });
});
