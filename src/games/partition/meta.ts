import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const node = (x: number, y: number, label: string, col: string) => `<circle cx="${x}" cy="${y}" r="20" style="fill:${col}"/><text x="${x}" y="${y + 4}" text-anchor="middle" ${mono} style="fill:#fff">${label}</text>`;
const diagram = `<svg viewBox="0 0 520 190" role="img" aria-label="A partition splits two New York replicas from one London replica. New York has a majority and keeps accepting writes. London must choose: reject writes (CP) or accept them and merge later (AP).">
  <rect x="20" y="40" width="190" height="110" rx="10" style="fill:none;stroke:var(--ok);stroke-width:1.5"/><text x="115" y="32" text-anchor="middle" ${mono} style="fill:var(--ok)">New York: majority (2 of 3)</text>
  ${node(80, 95, 'R1', 'var(--ok)')}${node(150, 95, 'R2', 'var(--ok)')}
  <rect x="330" y="40" width="170" height="110" rx="10" style="fill:none;stroke:var(--vote);stroke-width:1.5"/><text x="415" y="32" text-anchor="middle" ${mono} style="fill:var(--vote)">London: alone (1 of 3)</text>
  ${node(415, 95, 'R3', 'var(--vote)')}
  <line x1="210" y1="95" x2="330" y2="95" style="stroke:var(--bad);stroke-width:3;stroke-dasharray:6 6"/><text x="270" y="86" text-anchor="middle" style="fill:var(--bad);font-size:18px">✕</text>
  <text x="415" y="172" text-anchor="middle" ${mono} style="fill:var(--ink)">CP: refuse · AP: accept, merge later</text>
</svg>`;

export const meta: GameMeta = {
  id: 'partition',
  level: 6,
  title: 'Partition',
  concept: 'CAP: consistency or availability',
  intro:
    'Your data lives on three replicas: two in New York, one in London. Then the transatlantic link fails: a <b>network partition</b>. Both cities still have users. The <b>CAP theorem</b> says that during a partition you must choose: stay <b>consistent</b> (refuse writes on the side that can’t reach a majority) or stay <b>available</b> (accept them, and fix the differences later). The right choice depends on the data.',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'New York: 2 of 3 replicas, a majority' },
    { color: 'var(--vote)', shape: 'square', label: 'London: 1 of 3, cut off from the majority' },
    { color: 'var(--bad)', shape: 'dash', label: 'The broken link' },
  ],
  howTo: [
    'A short tutorial shows you how to cut the link and accept a write. The clock starts after it.',
    'For each incoming write, choose Accept or Reject. Later, merge diverged carts and sort real systems.',
    'Right calls build a combo. A double-spend risk, a needlessly refused user or a lost cart item costs points.',
  ],
  tasks: [
    'Tutorial: cut the link, accept a write',
    'Accept or reject 8 writes during the partition',
    'Merge two diverged shopping carts',
    'Sort six real systems into CP and AP',
  ],
  lessons: [
    'A partition is not a crash: both sides are alive and serving users, they just can’t talk. The side with a majority can keep going safely; the other side has to decide what to do.',
    'You chose per kind of data. Money on the minority side: reject (<b>CP</b>), because two sides approving withdrawals could spend the same money twice. Carts and likes: accept (<b>AP</b>), because a little divergence is cheap to fix later. Real banks and real shops make exactly this split.',
    'Accepting writes on both sides means merging later. “Last writer wins” would have thrown away one side’s changes. Merging operations keeps both: here, an item someone re-added stays in the cart (<b>add wins</b>). Amazon’s Dynamo cart worked like this, which is why deleted items sometimes reappeared.',
    'CP systems (etcd, ZooKeeper, Spanner) refuse service on the minority side to keep one truth. AP systems (Cassandra at low consistency, Dynamo, CouchDB) keep answering and reconcile later. Most real systems let you tune this per request.',
  ],
  walkthrough: [
    { id: 'cut', target: '#pt-cut', text: 'Three replicas, two cities. Click Cut the link to simulate the transatlantic cable failing.' },
    { id: 'accept', target: '#pt-accept', text: 'A write arrives in New York, which still has 2 of 3 replicas (a majority). Click Accept.' },
  ],
  minTimeMs: RULES['partition'].minTimeMs,
  parMs: RULES['partition'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'Eric Brewer’s CAP conjecture (2000), later proved by Gilbert and Lynch, says a distributed store cannot be Consistent, Available and Partition-tolerant all at once. Since partitions do happen, the real choice is what to give up <i>while</i> one is happening: consistency or availability.',
      'Brewer later pointed out that the choice need not be global. One system can be CP for account balances and AP for shopping carts, and can switch behaviour per operation. Daniel Abadi’s <b>PACELC</b> adds the everyday trade-off: even with no partition (Else), you trade Latency against Consistency.',
      'AP systems need a reconciliation story: <b>last-writer-wins</b> timestamps (simple, but loses data), keeping all conflicting versions for the app to merge (Dynamo, CouchDB), or data types that merge automatically (<b>CRDTs</b>, the final game in this course).',
    ],
    diagram,
    caption: 'During a partition, the majority side keeps going; the minority side chooses consistency or availability.',
    links: [
      { label: 'Eric Brewer: CAP Twelve Years Later, How the “Rules” Have Changed (IEEE Computer, 2012)', url: 'https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/' },
      { label: 'Gilbert and Lynch: Brewer’s Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services', url: 'https://dl.acm.org/doi/10.1145/564585.564601' },
      { label: 'DeCandia et al.: Dynamo, Amazon’s Highly Available Key-value Store (SOSP 2007)', url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf' },
    ],
  },
};
