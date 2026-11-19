/**
 * Difficulty tuning for Traffic Cop. Simulated players with human-like delays play each task
 * 200 times. A correct strategy must finish in 10–40 s at the median; a wrong one must usually fail.
 * Run: npm run tune
 */
import { describe, expect, it } from 'vitest';
import { between, mulberry32, type Rng } from '../../src/lib/rng';
import * as tc from '../../src/games/traffic-cop/sim';
import { median, report } from './util';

const DT = 50;
const LIMIT = 60_000;

type Bot = (s: tc.State, rng: Rng, t: number, events: tc.SimEvent[]) => void;

/** Plays one stage with a bot. Returns ms to reach the goal, or null if it failed within LIMIT. */
function play(stage: number, seed: number, bot: Bot): number | null {
  const rng = mulberry32(seed);
  const s = tc.create(mulberry32(seed * 7 + 1));
  tc.enterStage(s, stage);
  const t0 = s.now;
  let events: tc.SimEvent[] = [];
  while (s.now - t0 < LIMIT) {
    bot(s, rng, s.now - t0, events);
    events = tc.step(s, DT);
    if (s.stageDone || events.some((e) => e.type === 'goal')) return s.now - t0;
  }
  return null;
}

/** A human routing by hand: reacts 350–900 ms after a request shows up. */
function manualBot(choose: (s: tc.State) => number): Bot {
  let seenAt = -1;
  let delay = 0;
  return (s, rng) => {
    if (!s.queue) { seenAt = -1; return; }
    if (seenAt < 0) { seenAt = s.now; delay = between(rng, 350, 900); }
    if (s.now - seenAt >= delay) {
      const i = choose(s);
      tc.route(s, i < 0 ? 0 : i);
      seenAt = -1;
    }
  };
}

const readTime = 3000;

const bots: Record<string, { correct: () => Bot; wrong: () => Bot }> = {
  'task 2: route by hand': {
    correct: () => manualBot((s) => tc.bestFit(s)),
    wrong: () => manualBot(() => 0), // always web-1
  },
  'task 3: round robin + crash': {
    correct: () => {
      let crashSeen = -1;
      return ((s, _r, t, ev) => {
        if (t >= readTime && s.strategy === 'manual') tc.setStrategy(s, 'rr');
        if (ev.some((e) => e.type === 'crash')) crashSeen = s.now;
        if (crashSeen >= 0 && !s.health && s.now - crashSeen > 1500) tc.setHealth(s, true);
      }) as Bot;
    },
    wrong: () => ((s, _r, t) => {
      if (t >= readTime && s.strategy === 'manual') tc.setStrategy(s, 'rr'); // never turns on health checks
    }) as Bot,
  },
  'task 4: heavy mix': {
    correct: () => ((s, _r, t) => {
      if (t >= readTime && s.strategy !== 'least') tc.setStrategy(s, 'least');
    }) as Bot,
    wrong: () => () => {}, // stays on round robin
  },
};

const stageOf: Record<string, number> = { 'task 2: route by hand': 1, 'task 3: round robin + crash': 2, 'task 4: heavy mix': 3 };

describe('Traffic Cop difficulty', () => {
  for (const name of Object.keys(bots)) {
    it(name, () => {
      const RUNS = 200;
      const ok: number[] = [];
      let wrongFails = 0;
      for (let seed = 1; seed <= RUNS; seed++) {
        const c = play(stageOf[name], seed, bots[name].correct());
        ok.push(c ?? LIMIT);
        const w = play(stageOf[name], seed, bots[name].wrong());
        if (w === null) wrongFails++;
      }
      const med = median(ok) / 1000;
      const correctRate = ok.filter((x) => x < LIMIT).length / RUNS;
      report('traffic-cop', name, med, correctRate, wrongFails / RUNS);
      expect(med).toBeGreaterThanOrEqual(10);
      expect(med).toBeLessThanOrEqual(40);
      expect(correctRate).toBeGreaterThan(0.9);
      expect(wrongFails / RUNS).toBeGreaterThan(0.5);
    });
  }
});
