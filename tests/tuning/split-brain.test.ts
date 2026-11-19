/**
 * Difficulty tuning for Split Brain. Simulated players with human-like delays (3 s to read the task,
 * 0.7 s between clicks) play each task 100 times. Run: npm run tune
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import { ALL_LINKS, Raft, TASK_CHECKS, linkKey } from '../../src/games/split-brain/sim';
import { median, report } from './util';

const DT = 100;
const LIMIT = 60_000;
const READ = 3000;
const CLICK = 700;
/** Time to notice something that happened on screen before acting on it. */
const REACT = 1000;

type Bot = (r: Raft, t: number) => void;

function play(task: number, seed: number, mkBot: () => Bot): number | null {
  const r = new Raft(mulberry32(seed));
  const bot = mkBot();
  const t0 = r.now;
  while (r.now - t0 < LIMIT) {
    bot(r, r.now - t0);
    r.step(DT);
    if (TASK_CHECKS[task](r)) return r.now - t0;
  }
  return null;
}

/** Runs a queue of actions, one per CLICK ms, after the reading time. */
function clicker(plan: (r: Raft) => (() => void)[]): () => Bot {
  return () => {
    let queue: (() => void)[] | null = null;
    let nextAt = READ;
    return (r, t) => {
      if (t < READ) return;
      if (!queue) queue = plan(r);
      if (queue.length && t >= nextAt) {
        queue.shift()!();
        nextAt = t + CLICK;
      }
    };
  };
}

/** Crash the leader, restart it, wait for the next leader, repeat. */
function crashLeaderLoop(): Bot {
  let crashed: number | null = null;
  let seenLeader: number | null = null;
  let nextAt = READ;
  return (r, t) => {
    if (t < nextAt) return;
    if (crashed !== null) {
      r.toggleNode(crashed);
      crashed = null;
      nextAt = t + CLICK;
      return;
    }
    const l = r.leaders()[0];
    if (!l) return;
    if (seenLeader !== l.id) {
      seenLeader = l.id;
      nextAt = t + REACT;
      return;
    }
    r.toggleNode(l.id);
    crashed = l.id;
    nextAt = t + CLICK;
  };
}

const tasks: { name: string; task: number; correct: () => Bot; wrong: () => Bot }[] = [
  { name: 'task 2: depose', task: 1, correct: crashLeaderLoop, wrong: () => () => {} },
  {
    name: 'task 3: two crowns',
    task: 2,
    // Isolate the leader (4 cuts); once a second leader appears, restore those links.
    correct: () => {
      let links: [number, number][] | null = null;
      let restoring = false;
      let nextAt = READ;
      return (r, t) => {
        if (t < nextAt) return;
        if (!links) {
          const l = r.leaders()[0].id;
          links = ALL_LINKS.filter(([a, b]) => a === l || b === l);
        }
        if (!restoring && r.staleLeader !== null) {
          restoring = true;
          nextAt = t + REACT;
          return;
        }
        const todo = links.find(([a, b]) => r.cut.has(linkKey(a, b)) === restoring);
        if (todo && (restoring || links.some(([a, b]) => !r.cut.has(linkKey(a, b))))) {
          r.toggleLink(todo[0], todo[1]);
          nextAt = t + CLICK;
        }
      };
    },
    // Crashing the leader instead of isolating it: a crashed server cannot think it leads.
    wrong: clicker((r) => {
      const l = r.leaders()[0].id;
      return [() => r.toggleNode(l)];
    }),
  },
  {
    name: 'task 4: silence',
    task: 3,
    correct: clicker((r) => {
      const keep = new Set([linkKey(0, 1), linkKey(2, 3)]);
      return ALL_LINKS.filter(([a, b]) => !keep.has(linkKey(a, b))).map(([a, b]) => () => r.toggleLink(a, b));
    }),
    // Six cuts are not enough: some server still has two neighbours and can win a majority.
    wrong: clicker((r) => {
      const rng = mulberry32(Math.floor(r.now) + 99);
      const links = [...ALL_LINKS].sort(() => rng() - 0.5).slice(0, 6);
      return links.map(([a, b]) => () => r.toggleLink(a, b));
    }),
  },
  {
    name: 'task 5: storm',
    task: 4,
    correct: crashLeaderLoop,
    // Crashing and restarting followers never forces an election.
    wrong: () => {
      let nextAt = READ;
      return (r, t) => {
        if (t < nextAt) return;
        const f = r.nodes.find((n) => n.role !== 'leader');
        if (f) r.toggleNode(f.id);
        nextAt = t + CLICK;
      };
    },
  },
];

describe('Split Brain difficulty', () => {
  for (const tk of tasks) {
    it(tk.name, () => {
      const RUNS = 100;
      const times: number[] = [];
      let wrongFails = 0;
      for (let seed = 1; seed <= RUNS; seed++) {
        times.push(play(tk.task, seed, tk.correct) ?? LIMIT);
        if (play(tk.task, seed + 1000, tk.wrong) === null) wrongFails++;
      }
      const med = median(times) / 1000;
      const correctRate = times.filter((x) => x < LIMIT).length / RUNS;
      report('split-brain', tk.name, med, correctRate, wrongFails / RUNS);
      expect(med).toBeGreaterThanOrEqual(10);
      expect(med).toBeLessThanOrEqual(40);
      expect(correctRate).toBeGreaterThan(0.9);
      expect(wrongFails / RUNS).toBeGreaterThan(0.5);
    });
  }
});
