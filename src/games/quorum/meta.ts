import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const rep = (x: number, label: string, w: boolean, r: boolean) =>
  `<rect x="${x - 34}" y="70" width="68" height="50" rx="6" style="fill:var(--panel);stroke:var(--line)"/><text x="${x}" y="100" text-anchor="middle" ${mono} style="fill:var(--ink)">${label}</text>` +
  (w ? `<rect x="${x - 38}" y="64" width="76" height="62" rx="8" style="fill:none;stroke:var(--append);stroke-width:2"/>` : '') +
  (r ? `<rect x="${x - 42}" y="60" width="84" height="70" rx="10" style="fill:none;stroke:var(--ok);stroke-width:2;stroke-dasharray:5 4"/>` : '');
const diagram = `<svg viewBox="0 0 520 190" role="img" aria-label="Three replicas. A write goes to A and B (W=2); a read asks B and C (R=2). Because 2 + 2 is more than 3, the two sets always share at least one replica, here B, which has the newest value.">
  ${rep(110, 'A', true, false)}${rep(260, 'B · new', true, true)}${rep(410, 'C', false, true)}
  <text x="185" y="40" text-anchor="middle" ${mono} style="fill:var(--append)">write set W = 2 (A, B)</text>
  <text x="335" y="160" text-anchor="middle" ${mono} style="fill:var(--ok)">read set R = 2 (B, C)</text>
  <text x="260" y="182" text-anchor="middle" ${mono} style="fill:var(--ink)">R + W = 4 &gt; N = 3 → they always overlap</text>
</svg>`;

export const meta: GameMeta = {
  id: 'quorum',
  level: 6,
  title: 'Quorum',
  concept: 'Read and write quorums: R + W > N',
  intro:
    'Your data is copied to <b>N = 3 replicas</b>. Waiting for all three on every request is slow and fails when one is down, so a <b>coordinator</b> writes to only <b>W</b> of them and reads from only <b>R</b> of them. A <b>stale read</b> returns an old value after a newer one was written. Your job: find the R and W that never return stale data and keep working when a replica dies.',
  legend: [
    { color: 'var(--append)', shape: 'square', label: 'Replica holding the newest value' },
    { color: 'var(--accent)', shape: 'square', label: 'Selected for this write or read' },
    { color: 'var(--bad)', shape: 'square', label: 'Crashed replica' },
  ],
  howTo: [
    'A short tutorial shows you how to pick replicas and send a write. The clock starts after it.',
    'First you are the coordinator: pick which replicas get each write and which ones you read from. Replicas will crash.',
    'Fresh reads and good settings build a combo. A stale read or a bad R/W choice costs points.',
  ],
  tasks: [
    'Tutorial: pick a replica, send a write',
    'Coordinate 4 writes and reads by hand',
    'Pick R and W: no stale reads, under 80 ms',
    'One replica dies: stay fresh and available',
  ],
  lessons: [
    'Each replica keeps a <b>version number</b> with its value. When a read asks several replicas, the coordinator returns the copy with the highest version.',
    'A read is fresh only if it asks at least one replica that got the latest write. Writing to one replica is fast but fragile: if it crashes, the newest value is gone from every replica you can reach. Writing to a majority and reading from a majority always overlaps.',
    'The rule is <b>R + W &gt; N</b>: then every read set shares at least one replica with every write set, so some replica in the read always has the newest version. R=1, W=3 is fast to read but every write waits for all three; R=2, W=2 balances the two. Cassandra calls this QUORUM consistency.',
    'With one replica down, only R=2, W=2 keeps both reads and writes working <i>and</i> fresh: W=3 or R=3 needs the dead replica, and R + W = 3 lets a read land only on old copies when the dead replica returns. This is why Dynamo, Cassandra and Riak default to N=3 with quorum reads and writes.',
  ],
  walkthrough: [
    { id: 'pick', target: '[data-rep="0"]', text: 'Three replicas each keep a copy of one value. Click replica A to pick it for the next write.' },
    { id: 'write', target: '#qr-send', text: 'A is picked. Click Send write to store the new value on it.' },
  ],
  minTimeMs: RULES['quorum'].minTimeMs,
  parMs: RULES['quorum'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'Quorum replication goes back to David Gifford’s <b>weighted voting</b> (1979): give each copy a vote, require r votes to read and w votes to write, with r + w greater than the total. Every read quorum then intersects every write quorum.',
      'Amazon’s <b>Dynamo</b> made this tunable per request: N, R and W are settings. Cassandra exposes them as consistency levels (ONE, QUORUM, ALL), so one table can trade freshness for latency query by query. These are called <b>sloppy</b> when the system writes to stand-in replicas during failures (hinted handoff), which can break the overlap guarantee.',
      'R + W &gt; N is not the whole story. Concurrent writes still need a way to pick a winner (version numbers, timestamps or vector clocks), and replicas that missed writes catch up through <b>read repair</b> and <b>anti-entropy</b> (Merkle-tree comparison), which you met in Replica Diff.',
    ],
    diagram,
    caption: 'With N = 3, W = 2 and R = 2, every read set overlaps every write set in at least one replica.',
    links: [
      { label: 'Gifford: Weighted Voting for Replicated Data (SOSP 1979)', url: 'https://dl.acm.org/doi/10.1145/800215.806583' },
      { label: 'DeCandia et al.: Dynamo, Amazon’s Highly Available Key-value Store (SOSP 2007)', url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf' },
      { label: 'Apache Cassandra docs: tunable consistency', url: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html' },
    ],
  },
};
