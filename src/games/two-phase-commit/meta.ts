import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const box = (x: number, y: number, label: string, col: string) =>
  `<rect x="${x - 55}" y="${y - 20}" width="110" height="40" rx="6" style="fill:var(--panel);stroke:${col};stroke-width:1.5"/><text x="${x}" y="${y + 4}" text-anchor="middle" ${mono} style="fill:var(--ink)">${label}</text>`;
const arrow = (x1: number, y1: number, x2: number, y2: number, label: string, col: string) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${col};stroke-width:1.5" marker-end="url(#tpm-a)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 5}" text-anchor="middle" ${mono} style="fill:${col}">${label}</text>`;
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Phase 1: the coordinator sends prepare to both banks and each votes yes or no. Phase 2: if every vote is yes it sends commit, otherwise abort.">
  <defs><marker id="tpm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--muted)"/></marker></defs>
  ${box(260, 30, 'Coordinator', 'var(--accent)')}${box(110, 160, 'Bank A', 'var(--line)')}${box(410, 160, 'Bank B', 'var(--line)')}
  ${arrow(220, 50, 130, 138, '1 prepare?', 'var(--append)')}${arrow(300, 50, 390, 138, '1 prepare?', 'var(--append)')}
  ${arrow(160, 145, 235, 55, 'yes', 'var(--ok)')}${arrow(360, 145, 285, 55, 'yes', 'var(--ok)')}
  <text x="260" y="120" text-anchor="middle" ${mono} style="fill:var(--ink)">2 all yes → COMMIT · any no → ABORT</text>
</svg>`;

export const meta: GameMeta = {
  id: 'two-phase-commit',
  level: 7,
  title: 'Two-Phase Commit',
  concept: 'Atomic commit across services',
  intro:
    'A transfer takes money out of Bank A and puts it into Bank B. Two separate databases, and it must happen in both or in neither: that is an <b>atomic commit</b>. <b>Two-phase commit (2PC)</b> uses a <b>coordinator</b>. Phase 1: it asks every bank to <b>prepare</b>, and each votes yes (locking the account) or no. Phase 2: commit only if every vote was yes. Then you crash things.',
  legend: [
    { color: 'var(--accent)', shape: 'square', label: 'Coordinator: runs the vote and decides' },
    { color: 'var(--ok)', shape: 'square', label: 'Voted yes / committed' },
    { color: 'var(--bad)', shape: 'square', label: 'Voted no, crashed, or aborted' },
    { color: 'var(--vote)', shape: 'square', label: 'Locked: waiting for a decision' },
  ],
  howTo: [
    'A short tutorial shows you how to prepare and commit one transfer. The clock starts after it.',
    'Run five transfers as the coordinator, then decide for a bank that crashed, then for banks whose coordinator died.',
    'Right calls build a combo. Splitting the banks (one commits, one aborts) or needless aborts and waits cost points.',
  ],
  tasks: [
    'Tutorial: prepare and commit one transfer',
    'Coordinate 5 transfers from the votes',
    'Recover a crashed bank from its log',
    'The coordinator died: commit, abort or wait?',
  ],
  lessons: [
    'Prepare asks “can you commit?”. A bank that votes yes writes its vote to disk and locks the account: it has promised to commit if told to, even after a crash.',
    'Commit only when every participant votes yes. A no, or a vote that never arrives, means abort. That is atomicity across databases: both banks change or neither does. PostgreSQL offers this as PREPARE TRANSACTION; Java and .NET call it XA.',
    'On restart a participant reads its log. No yes vote: abort alone. A logged decision: redo it. Voted yes with no decision: it is <b>in doubt</b> and must ask the coordinator. A participant that voted yes has given up the right to decide.',
    'If the coordinator dies after prepare, banks can sometimes learn the outcome from each other (a no vote or a seen decision). But if every bank voted yes and nobody saw the decision, they must <b>block</b>, locks held, until the coordinator returns. Spanner avoids this by replicating the coordinator with Paxos; many microservices use sagas instead.',
  ],
  walkthrough: [
    { id: 'prepare', target: '#tp-prepare', text: 'A transfer from Bank A to Bank B. Click Prepare to ask both banks whether they can commit.' },
    { id: 'commit', target: '#tp-commit', text: 'Both banks voted yes and locked the accounts. Click Commit to finish the transfer in both.' },
  ],
  minTimeMs: RULES['two-phase-commit'].minTimeMs,
  parMs: RULES['two-phase-commit'].parMs,
  learnMore: {
    paragraphs: [
      'Two-phase commit was described by Jim Gray (1978) and is in every database textbook. Its safety rests on two logged promises: a participant that votes yes can always commit later, and the coordinator logs its decision before telling anyone.',
      'Its weakness is <b>blocking</b>: a participant that voted yes cannot decide alone, so a dead coordinator freezes locks. Three-phase commit tries to fix this but breaks under network partitions. Modern systems make the coordinator itself fault-tolerant: Google Spanner and CockroachDB run each 2PC participant and coordinator as a Raft or Paxos group.',
      'Across microservices, holding locks during a network round trip is often too costly. The <b>saga</b> pattern (next game) gives up atomic isolation and undoes partial work with compensating actions instead.',
    ],
    diagram,
    caption: 'Phase 1 collects votes; phase 2 commits only if every vote was yes.',
    links: [
      { label: 'Gray: Notes on Data Base Operating Systems (1978), the 2PC protocol', url: 'https://jimgray.azurewebsites.net/papers/dbos.pdf' },
      { label: 'PostgreSQL docs: PREPARE TRANSACTION', url: 'https://www.postgresql.org/docs/current/sql-prepare-transaction.html' },
      { label: 'Corbett et al.: Spanner, Google’s Globally-Distributed Database (OSDI 2012)', url: 'https://research.google/pubs/spanner-googles-globally-distributed-database-2/' },
    ],
  },
};
