import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const node = (x: number, y: number, name: string, both = false) =>
  `<circle cx="${x}" cy="${y}" r="24" style="fill:${both ? 'var(--ink)' : 'var(--panel)'};stroke:var(--ink);stroke-width:2"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-family="Archivo, Arial Narrow, sans-serif" font-weight="800" font-size="16" style="fill:${both ? 'var(--bg)' : 'var(--ink)'}">${name}</text>`;

const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Two majorities of five servers: S1, S2, S3 and S3, S4, S5. They overlap at S3.">
  <rect x="20" y="40" width="290" height="96" rx="48" style="fill:color-mix(in srgb,var(--append) 12%,transparent);stroke:var(--append);stroke-width:2"/>
  <rect x="210" y="40" width="290" height="96" rx="48" style="fill:color-mix(in srgb,var(--accent) 12%,transparent);stroke:var(--accent);stroke-width:2"/>
  ${node(75, 88, 'S1')}${node(155, 88, 'S2')}${node(260, 88, 'S3', true)}${node(365, 88, 'S4')}${node(445, 88, 'S5')}
  <text x="40" y="28" ${mono} style="fill:var(--append)">majority that committed a write</text>
  <text x="480" y="160" text-anchor="end" ${mono} style="fill:var(--accent)">majority that elects the next leader</text>
  <text x="260" y="186" text-anchor="middle" ${mono} style="fill:var(--ink)">S3 is in both: it has the write, and votes only for a log as complete as its own</text>
</svg>`;

export const meta: GameMeta = {
  id: 'split-brain',
  level: 7,
  title: 'Split Brain',
  concept: 'Raft consensus',
  intro:
    'Five servers keep one shared list of writes (a <b>log</b>) using <b>Raft</b>, the agreement protocol inside etcd and Consul. One server is the <b>leader</b> (crown): it sends heartbeats and copies each write to the others. A write is <b>committed</b>, safe forever, once 3 of 5 servers store it. If followers stop hearing heartbeats, their timer ring runs out and they hold an election; a server needs 3 of 5 votes to win. You are the network.',
  legend: [
    { color: 'var(--accent)', shape: 'square', label: 'Crown: the leader' },
    { color: 'var(--muted)', shape: 'ring', label: 'Timer ring: when it empties, the server runs for leader' },
    { color: 'var(--vote)', shape: 'dot', label: 'Vote request' },
    { color: 'var(--ok)', shape: 'dot', label: 'Vote granted' },
    { color: 'var(--append)', shape: 'dot', label: 'Heartbeat or a copy of a write' },
    { color: 'var(--bad)', shape: 'dash', label: 'Cut link (red ✕), crashed server (dashed)' },
    { color: 'var(--ok)', shape: 'square', label: 'Client write committed' },
    { color: 'var(--bad)', shape: 'square', label: 'Client write failed' },
  ],
  howTo: [
    'A short tutorial shows you how to cut a link and crash a server. The clock starts after it.',
    'Click a link to cut it (again to restore). Click a server to crash it (again to restart).',
    'Each task asks you to break the cluster in one specific way. Press Hint if you are stuck.',
  ],
  tasks: [
    'Tutorial: cut a link and crash a server',
    'Depose: make the cluster elect a new leader twice',
    'Two crowns: strand the leader, then reconnect it',
    'Silence: no working leader for 10 s (links only)',
    'Storm: force 4 elections within 20 s',
  ],
  lessons: [
    'Cutting a link drops every message on it; crashing a server stops it, but it keeps its log on disk and rejoins when restarted. Those are the two failures every distributed system has to survive, and Raft is built so that neither can lose a committed write.',
    'Followers that stop hearing heartbeats start an election in a higher <b>term</b> (a numbered election round). A server needs votes from a majority (3 of 5) to win, so the cluster heals itself in a few seconds. etcd, the database behind Kubernetes, does exactly this.',
    'For a while there were two leaders, but in different terms. The stranded one could not reach 3 servers, so none of its writes could commit: they stayed dashed and failed. When you reconnected it, it saw the higher term and stepped down at once.',
    'It takes at least 8 cuts: a server linked to two others can usually gather a majority (3 of 5). Raft stays available while some majority can talk, which is why 5 servers survive 2 failures, and why etcd and Consul clusters run 3 or 5 servers, never 4.',
    'Every lost leader costs an election timeout plus a vote round: seconds with no writes. A server that keeps flapping can hold a whole cluster in elections. Production Raft adds a <b>pre-vote</b> round so a server must check it could win before it disrupts anyone; etcd has a PreVote setting for this.',
  ],
  walkthrough: [
    { id: 'cut', target: '[data-link="2-3"]', text: 'Click the highlighted link between S3 and S4 to cut it. Messages on a cut link are lost.' },
    { id: 'restore', target: '[data-link="2-3"]', text: 'Click the same link again to restore it.' },
    { id: 'crash', target: '[data-node="3"]', text: 'Click server S4 to crash it.' },
    { id: 'restart', target: '[data-node="3"]', text: 'Click S4 again to restart it. It keeps its log on disk.' },
  ],
  minTimeMs: [0, 4000, 4000, 10000, 8000],
  learnMore: {
    paragraphs: [
      'Raft splits agreement into three parts. <b>Leader election</b>: one server leads per term, chosen by a majority vote. <b>Log replication</b>: the leader appends each write to its log and copies it to followers; once a majority store it, it is committed. <b>Safety</b>: a server only votes for a candidate whose log is at least as up to date as its own.',
      'The safety argument fits in one picture. A committed write sits on a majority. A new leader needs votes from a majority. Any two majorities of 5 share at least one server, and that server refuses to vote for anyone missing the write. So every leader already holds every committed write. That is why no amount of cutting and crashing in this game can lose a solid cell.',
      'Raft trades availability for that safety: when no majority can talk, it stops accepting writes instead of guessing (the CAP choice you will meet in Partition). Raft was designed to be easier to understand than Paxos, the older protocol behind Google’s Chubby lock service, and it is used today by etcd, Consul and CockroachDB.',
    ],
    diagram,
    caption: 'Any two majorities of 5 servers overlap, so the next leader always meets a server that holds every committed write.',
    links: [
      { label: 'Ongaro and Ousterhout: In Search of an Understandable Consensus Algorithm (the Raft paper, USENIX ATC 2014)', url: 'https://raft.github.io/raft.pdf' },
      { label: 'The Raft website: papers, talks and implementations', url: 'https://raft.github.io/' },
      { label: 'etcd FAQ: why an odd number of cluster members, and failure tolerance', url: 'https://etcd.io/docs/v3.5/faq/' },
    ],
  },
};
