/** Quorum: concept cards, hints and the opening incident. */
import { box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '15:51 · a user changed their address, refreshed, and saw the old one · then the new one · then the old one again · support is confused.';

const reps = (labels: [string, string][]) => labels.map(([l, c], i) => box(60 + i * 160, 60, 120, 70, l, { col: c, size: 15 })).join('');

export const learn: (LearnCard | null)[] = [
  {
    title: 'Three copies, and the newest one',
    frames: [
      {
        svg: svg(reps([['A: v2 = 20', 'var(--append)'], ['B: v2 = 20', 'var(--append)'], ['C: v1 = 10', 'var(--line)']]) + text(280, 170, 'the write reached A and B; C still has the old value', { size: 13 }), 'A write reached two of three replicas.'),
        html: '<p>Your data is copied to <b>N = 3 replicas</b>. Waiting for all three on every request is slow, and fails if one is down. So a <b>coordinator</b> writes to only some of them and reads from only some. Each copy carries a <b>version number</b>; on a read, the highest version wins.</p>',
      },
      {
        svg: svg(reps([['A: v2', 'var(--line)'], ['B: v2', 'var(--line)'], ['C: v1', 'var(--bad)']]) + text(440, 160, 'read only C → old value', { col: 'var(--bad)', size: 13, bold: true }), 'Reading only the replica that missed the write returns the old value.'),
        html: '<p>If you read from a replica that missed the latest write, you get the old value: a <b>stale read</b>. To always get the newest, your read must reach at least one replica that has it.</p>',
      },
    ],
    check: {
      q: 'The last write went to A and B. You read from B only. Fresh?',
      options: ['Yes', 'No'],
      answer: 0,
      why: 'B has the newest version. Any read set that includes A or B sees it.',
    },
  },
  null,
  {
    title: 'R + W > N',
    frames: [
      {
        svg: svg(reps([['A', 'var(--append)'], ['B', 'var(--ok)'], ['C', 'var(--ok)']]) + `<rect x="50" y="50" width="300" height="90" rx="10" style="fill:none;stroke:var(--append);stroke-width:2"/>` + `<rect x="200" y="40" width="300" height="110" rx="12" style="fill:none;stroke:var(--ok);stroke-width:2;stroke-dasharray:6 4"/>` + text(200, 180, 'write to 2 (W)', { col: 'var(--append)', size: 13 }) + text(400, 180, 'read from 2 (R)', { col: 'var(--ok)', size: 13 }), 'Two of three for writes and two of three for reads always overlap.'),
        html: '<p>Now the coordinator picks replicas at random: every write goes to <b>W</b> of them, every read asks <b>R</b>. If <b>R + W &gt; N</b>, every read set shares at least one replica with every write set, so some replica in the read always has the newest version. Each extra replica asked adds waiting time, though.</p>',
      },
    ],
    check: {
      q: 'N = 3, W = 1, R = 1. Can a read be stale?',
      options: ['Yes', 'No'],
      answer: 0,
      why: '1 + 1 = 2, not more than 3. The one replica you read may not be the one that got the write.',
    },
  },
  {
    title: 'When a replica dies',
    frames: [{ html: '<p>Now replica C goes down for half the run, then comes back with old data. Settings that need all 3 replicas stop working while it is down. Settings with R + W = N can read only old copies once it returns. Find the one setting that survives both.</p>' }],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Before you read, check which replicas got the newest write, and which one crashed.',
    concept: 'Write to two replicas so one survives a crash; read from two so you always reach a fresh one.',
    show: 'Each round: write to 2 replicas, then read from 2 that are up.',
  },
  {
    nudge: 'What must R + W be compared to N = 3?',
    concept: 'R + W must be more than 3, and the wait is (R + W) × 20 ms: at most 80 ms means R + W = 4.',
    show: 'R = 2, W = 2 (or R = 1, W = 3, or R = 3, W = 1).',
    target: '[data-r="2"]',
  },
  {
    nudge: 'With C down only 2 replicas answer. What is the most R or W can be?',
    concept: 'Neither R nor W can be 3, and R + W must still be more than 3.',
    show: 'R = 2, W = 2.',
    target: '[data-w="2"]',
  },
];
