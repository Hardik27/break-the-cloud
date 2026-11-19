/**
 * Difficulty tuning for DNS Detective. It is a click puzzle, so time is modelled: reading the task,
 * then per click a short think-and-click time (with more thinking at each new lookup).
 * A correct strategy must take 10–40 s; a wrong strategy must make mistakes (losing the flawless bonus and the S grade).
 */
import { describe, expect, it } from 'vitest';
import { between, mulberry32 } from '../../src/lib/rng';
import * as dns from '../../src/games/dns-detective/sim';
import { median, report } from './util';

const READ = 3000;
const click = (rng: () => number) => between(rng, 700, 1300);
const THINK_PER_LOOKUP = 1000;

type Strategy = (s: dns.State) => dns.NodeId;
const correct: Strategy = (s) => dns.expected(s)[0];

function play(task: number, seed: number, strat: Strategy): { ms: number; mistakes: number } {
  const rng = mulberry32(seed);
  const s = dns.create(task, mulberry32(seed + 99));
  let ms = READ;
  let lookups = 0;
  let guard = 0;
  while (s.current && guard++ < 200) {
    if (s.current.hop === 0) {
      lookups++;
      ms += THINK_PER_LOOKUP;
    }
    const r = dns.click(s, strat(s));
    ms += click(rng);
    if (r.kind === 'wrong' && s.current && dns.expected(s)[0] !== undefined) {
      // A student who erred then does the right thing.
      ms += click(rng);
      if (s.current) dns.click(s, dns.expected(s)[0]);
    }
  }
  return { ms, mistakes: s.mistakes };
}

const WRONG: Record<number, [string, Strategy]> = {
  1: ['always picks .com', (s) => (dns.expected(s)[0].startsWith('tld-') ? 'tld-com' : dns.expected(s)[0])],
  2: ['never uses the cache', (s) => (dns.expected(s)[0] === 'cache' ? 'root' : dns.expected(s)[0])],
  3: ['always trusts the cache', (s) => (s.current!.hop === 1 && dns.isCached(s, s.current!.name) ? 'cache' : dns.expected(s)[0])],
};

describe('DNS Detective difficulty', () => {
  for (const task of [1, 2, 3]) {
    it(`task ${task + 1}`, () => {
      const times: number[] = [];
      let wrongFails = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const c = play(task, seed, correct);
        expect(c.mistakes).toBe(0);
        times.push(c.ms);
        if (play(task, seed, WRONG[task][1]).mistakes >= 1) wrongFails++;
      }
      const med = median(times) / 1000;
      report('dns-detective', `task ${task + 1} (wrong: ${WRONG[task][0]})`, med, 1, wrongFails / 200);
      expect(med).toBeGreaterThanOrEqual(10);
      expect(med).toBeLessThanOrEqual(40);
      expect(wrongFails / 200).toBeGreaterThan(0.5);
    });
  }
  it('task 5: picking a TTL', () => {
    // Reading two scenarios (6 s each) plus about two tries each.
    const ms = 2 * (6000 + 2 * 1500);
    report('dns-detective', 'task 5 (wrong: always the shortest TTL)', ms / 1000, 1, 1);
    expect(ms / 1000).toBeGreaterThanOrEqual(10);
    expect(dns.SCENARIOS.every((sc) => !dns.evaluateTtl(sc, 60).ok)).toBe(true);
  });
});
