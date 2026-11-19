/** Two-Phase Commit: concept cards, hints and the opening incident. */
import { arrow, box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '10:02 · customer complaint: “$100 left my account at Bank A but never reached Bank B” · two databases, one transfer.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'All or nothing, across two databases',
    frames: [
      {
        svg: svg(box(30, 60, 200, 80, 'Bank A: −$100', { col: 'var(--ok)', sub: 'done' }) + box(330, 60, 200, 80, 'Bank B: +$100', { col: 'var(--bad)', sub: 'crashed before it ran' }) + text(280, 180, 'money vanished: half a transfer', { col: 'var(--bad)', size: 14, bold: true }), 'Half a transfer: A debited, B never credited.'),
        html: '<p>A transfer changes two separate databases: take $100 out of Bank A, put it into Bank B. If one succeeds and the other fails, money appears or vanishes. It must happen in both or neither: an <b>atomic commit</b>.</p>',
      },
      {
        svg: svg(box(210, 20, 140, 44, 'coordinator', { col: 'var(--accent)', size: 15 }) + box(40, 150, 140, 44, 'Bank A', { col: 'var(--line)' }) + box(380, 150, 140, 44, 'Bank B', { col: 'var(--line)' }) +
            arrow(240, 66, 130, 146, '1 prepare?', 'blue') + arrow(320, 66, 430, 146, '1 prepare?', 'blue') + text(280, 120, '2: all yes → COMMIT · any no → ABORT', { size: 13, bold: true }),
          'Phase 1: ask everyone to prepare. Phase 2: commit only if all said yes.',
        ),
        html: '<p><b>Two-phase commit</b> uses a <b>coordinator</b>. Phase 1, <b>prepare</b>: each bank checks it can do its part, locks the account, and votes yes or no. Phase 2: if every vote is yes, the coordinator says <b>commit</b>; otherwise <b>abort</b>, and both undo.</p>',
      },
    ],
    check: {
      q: 'Bank A votes yes. Bank B votes no (account frozen). What does the coordinator decide?',
      options: ['Commit', 'Abort'],
      answer: 1,
      why: 'Any no means abort. Committing would change A but not B.',
    },
  },
  null,
  {
    title: 'A yes is a promise',
    frames: [
      {
        svg: svg(text(30, 50, 'Bank B’s log on disk:', { anchor: 'start', size: 14 }) + text(50, 85, 'BEGIN T9', { anchor: 'start', size: 14 }) + text(50, 115, 'PREPARED T9 · voted YES', { anchor: 'start', size: 14 }) + text(50, 145, '(crashed here)', { anchor: 'start', size: 13, col: 'var(--bad)' }) + text(330, 115, 'in doubt: only the coordinator knows', { size: 13, col: 'var(--vote)', bold: true }), 'A log with a yes vote and no decision.'),
        html: '<p>Before voting yes, a bank writes the vote to its <b>log</b> on disk, so it remembers after a crash. A yes is a promise: “I can commit if told to.” After restarting, a bank reads its log. No yes vote → abort alone. A decision in the log → redo it. Voted yes, no decision → it is <b>in doubt</b> and must ask.</p>',
      },
    ],
  },
  {
    title: 'When the coordinator dies',
    frames: [
      {
        svg: svg(box(210, 20, 140, 44, 'coordinator', { col: 'var(--bad)', sub: 'crashed' }) + box(40, 140, 180, 60, 'Bank A', { col: 'var(--vote)', sub: 'voted yes · locked' }) + box(340, 140, 180, 60, 'Bank B', { col: 'var(--vote)', sub: 'voted yes · locked' }) + arrow(222, 170, 336, 170, 'what do you know?', 'muted'), 'Both banks voted yes; the coordinator crashed.'),
        html: '<p>If the coordinator dies after prepare, banks that voted yes are stuck holding locks. They can ask each other: if one saw the decision, or voted no, the outcome is known. If every bank voted yes and none saw a decision, they must <b>wait</b>, locks held, for the coordinator to return. That is 2PC’s famous <b>blocking</b> problem.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Wait for both votes. A missing vote counts too.',
    concept: 'Commit only if both banks voted yes. A no, or no answer, means abort.',
    show: 'Prepare, wait for two votes, then Commit if both are yes, otherwise Abort.',
  },
  {
    nudge: 'Read the last line of B’s log.',
    concept: 'No yes vote → abort. A decision in the log → redo it. Yes but no decision → ask the coordinator.',
    show: 'Only press Ask coordinator when the log ends with a YES vote and no DECISION line.',
  },
  {
    nudge: 'Always start by asking Bank A.',
    concept: 'If A saw COMMIT or ABORT, follow it. If A voted no, abort. If A is in doubt too, wait.',
    show: 'Ask Bank A, then: got COMMIT → Commit; got ABORT or voted NO → Abort; voted YES → Wait.',
    target: '#tp-askpeer',
  },
];
