/**
 * Difficulty tuning for Traffic Cop. Simulated players with human-like delays play each task
 * 200 times. A correct strategy must finish in 10–40 s at the median with few drops; a wrong one
 * must usually fail (no finish within 60 s, or 4+ drops, which costs most of the points).
 * Run: npm run tune
 */
import { describe, expect, it } from 'vitest';
import { between, mulberry32, type Rng } from '../../src/lib/rng';
import * as tc from '../../src/games/traffic-cop/sim';
import { median, report } from './util';

const DT = 50;
const LIMIT = 60_000;
const READ = 3000;

type Bot = (s: tc.State, rng: Rng, t: number, events: tc.SimEvent[]) => void;
interface Result { ms: number | null; drops: number }

function play(stage: number, seed: number, bot: Bot): Result {
  const rng = mulberry32(seed);
  const s = tc.create(mulberry32(seed * 7 + 1));
  tc.enterStage(s, stage);
  const t0 = s.now;
  let events: tc.SimEvent[] = [];
  while (s.now - t0 < LIMIT) {
    bot(s, rng, s.now - t0, events);
    events = tc.step(s, DT);
    if (s.stageDone) return { ms: s.now - t0, drops: s.drops };
  }
  return { ms: null, drops: s.drops };
}

/** Routes by hand: reacts 350–900 ms after a request shows up. */
function manualBot(choose: (s: tc.State) => number, onlyHeavy = false): Bot {
  let seenAt = -1, delay = 0;
  return (s, rng) => {
    const q = s.queue;
    if (!q || (onlyHeavy && !q.heavy)) { seenAt = -1; return; }
    if (seenAt < 0) { seenAt = s.now; delay = between(rng, 350, 900); }
    if (s.now - seenAt >= delay) {
      const i = choose(s);
      tc.route(s, i < 0 ? 0 : i);
      seenAt = -1;
    }
  };
}

/** Pulls a server 0.7–1.3 s after it crashes, returns it 0.7–1.3 s after it recovers. */
function rotationKeeper(): Bot {
  const todo: { at: number; server: number }[] = [];
  return (s, rng, _t, ev) => {
    for (const e of ev) if (e.type === 'crash' || e.type === 'recover') todo.push({ at: s.now + between(rng, 700, 1300), server: e.server });
    for (let k = todo.length - 1; k >= 0; k--) {
      if (s.now >= todo[k].at) {
        const srv = s.servers[todo[k].server];
        if (srv.up !== srv.inRotation) tc.toggleRotation(s, todo[k].server);
        todo.splice(k, 1);
      }
    }
  };
}

const both = (...bots: Bot[]): Bot => (s, r, t, e) => bots.forEach((b) => b(s, r, t, e));
const after = (ms: number, f: (s: tc.State) => void): Bot => (s, _r, t) => { if (t >= ms) f(s); };

const TASKS: { name: string; stage: number; correct: () => Bot; wrong: Record<string, () => Bot> }[] = [
  {
    name: 'task 2: rush hour by hand', stage: 1,
    correct: () => manualBot((s) => tc.bestFit(s)),
    wrong: { 'always web-1': () => manualBot(() => 0) },
  },
  {
    name: 'task 3: be the health check', stage: 2,
    correct: () => both(after(READ, (s) => s.strategy === 'manual' && tc.setStrategy(s, 'rr')), rotationKeeper()),
    wrong: { 'never pulls dead servers': () => after(READ, (s) => s.strategy === 'manual' && tc.setStrategy(s, 'rr')) },
  },
  {
    name: 'task 4: heavy hitters', stage: 3,
    correct: () => manualBot((s) => tc.bestFit(s), true),
    wrong: { 'lets round robin route heavies': () => () => {} },
  },
  {
    name: 'task 5: boss wave', stage: 4,
    correct: () => both(after(READ, (s) => s.strategy !== 'least' && tc.setStrategy(s, 'least')), rotationKeeper()),
    wrong: {
      'stays on round robin': () => rotationKeeper(),
      'least loaded but never pulls the dead server': () => after(READ, (s) => s.strategy !== 'least' && tc.setStrategy(s, 'least')),
    },
  },
];

describe('Traffic Cop difficulty', () => {
  for (const tk of TASKS) {
    it(tk.name, () => {
      const RUNS = 200;
      const ok: number[] = [];
      const drops: number[] = [];
      for (let seed = 1; seed <= RUNS; seed++) {
        const r = play(tk.stage, seed, tk.correct());
        ok.push(r.ms ?? LIMIT);
        drops.push(r.drops);
      }
      const med = median(ok) / 1000;
      const correctRate = ok.filter((x) => x < LIMIT).length / RUNS;
      console.log(`[tune]   correct strategy median drops: ${median(drops)}`);
      for (const [label, mk] of Object.entries(tk.wrong)) {
        let fails = 0;
        const wd: number[] = [];
        for (let seed = 1; seed <= RUNS; seed++) {
          const r = play(tk.stage, seed, mk());
          wd.push(r.drops);
          if (r.ms === null || r.drops >= 4) fails++;
        }
        report('traffic-cop', `${tk.name} (wrong: ${label}, median drops ${median(wd)})`, med, correctRate, fails / RUNS);
        expect(fails / RUNS, label).toBeGreaterThan(0.5);
      }
      expect(med).toBeGreaterThanOrEqual(10);
      expect(med).toBeLessThanOrEqual(40);
      expect(correctRate).toBeGreaterThan(0.9);
      expect(median(drops)).toBeLessThanOrEqual(2);
    });
  }
});
