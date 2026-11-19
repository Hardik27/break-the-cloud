import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const ticks = (y: number, from: number, to: number, step: number, col: string) => {
  let s = '';
  for (let x = from; x <= to; x += step) s += `<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y + 8}" style="stroke:${col};stroke-width:2.5"/>`;
  return s;
};
const diagram = `<svg viewBox="0 0 520 190" role="img" aria-label="Three heartbeat timelines: a healthy server, a server with a GC pause that resumes, and a crashed server. A short timeout evicts both silent ones; a longer one waits out the pause but detects the crash later.">
  <text x="0" y="34" ${mono} style="fill:var(--ink)">healthy</text>${ticks(30, 90, 500, 30, 'var(--ok)')}
  <text x="0" y="84" ${mono} style="fill:var(--ink)">GC pause</text>${ticks(80, 90, 240, 30, 'var(--ok)')}${ticks(80, 330, 500, 30, 'var(--ok)')}
  <text x="0" y="134" ${mono} style="fill:var(--ink)">crashed</text>${ticks(130, 90, 270, 30, 'var(--ok)')}
  <line x1="240" y1="160" x2="300" y2="160" style="stroke:var(--bad);stroke-width:2"/><text x="270" y="178" text-anchor="middle" ${mono} style="fill:var(--bad)">short timeout</text>
  <line x1="240" y1="168" x2="390" y2="168" style="stroke:var(--ok);stroke-width:2"/><text x="400" y="178" ${mono} style="fill:var(--ok)">long timeout</text>
  <line x1="300" y1="70" x2="300" y2="140" style="stroke:var(--bad);stroke-dasharray:3 3"/><line x1="390" y1="120" x2="390" y2="140" style="stroke:var(--ok);stroke-dasharray:3 3"/>
</svg>`;

export const meta: GameMeta = {
  id: 'heartbeat',
  level: 2,
  title: 'Heartbeat',
  concept: 'Health checks and failover',
  intro:
    'How do you know a server died? It can’t tell you. Instead, every server sends a small <b>heartbeat</b> message twice a second. When the beats stop, it might have <b>crashed</b>, or it might just be frozen for a moment by a <b>GC pause</b> (its memory clean-up). <b>Evicting</b> a server takes it out of the pool so users stop reaching it. Evict too early and you lose healthy servers; too late and users see errors.',
  legend: [
    { color: 'var(--ok)', shape: 'line', label: 'A heartbeat (one tick on the timeline)' },
    { color: 'var(--vote)', shape: 'square', label: 'Silent for a while: crashed, or pausing?' },
    { color: 'var(--bad)', shape: 'square', label: 'Silent a long time' },
    { color: 'var(--muted)', shape: 'dash', label: 'Evicted: out of the pool, gets no traffic' },
  ],
  howTo: [
    'A short tutorial shows you how to evict a server and bring one back. The clock starts after it.',
    'Click a server to evict it, or to put it back in the pool.',
    'Catching a crash fast earns a combo. Evicting a server that was only pausing is a mistake.',
  ],
  tasks: [
    'Tutorial: evict a crashed server, return its replacement',
    'Be the failure detector: catch 3 crashes',
    'Stop the false evictions',
    'Catch the crash within 5 s, with no false evictions',
  ],
  lessons: [
    'A server that stops sending heartbeats might be dead. Evicting it takes it out of the pool, and a fresh replacement boots, just like an AWS Auto Scaling group replacing an unhealthy instance.',
    'From the outside, a crash and a long pause look the same: silence. The only tool you have is time. Wait longer and you are surer, but users keep hitting the dead server meanwhile. That is why perfect failure detection is impossible over an unreliable network.',
    'A timeout shorter than a normal hiccup evicts healthy servers. GC pauses, slow disks and busy networks easily cause a 2-second silence. Evicting healthy servers moves their load onto the rest, which can slow those down too: a <b>cascading failure</b>.',
    'Detection time is about heartbeat interval × missed beats. You needed a timeout longer than the longest normal pause and shorter than your detection budget. Kubernetes works the same way: a node is marked NotReady when its heartbeats stop for a grace period.',
  ],
  walkthrough: [
    { id: 'evict', target: '[data-hb="2"]', text: 'web-3’s heartbeats stopped: its timeline went quiet. Click web-3 to evict it from the pool.' },
    { id: 'return', target: '[data-hb="2"]', text: 'A replacement for web-3 is booting. When it says ready, click it to put it back in the pool.' },
  ],
  minTimeMs: RULES['heartbeat'].minTimeMs,
  parMs: RULES['heartbeat'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'A <b>failure detector</b> turns silence into a decision. The simplest one is a fixed timeout: “no heartbeat for T seconds means dead”. Pick T from the longest normal silence you see in production (GC pauses, network blips), plus a margin, and accept that detection takes about T.',
      'Better detectors adapt. The <b>phi accrual</b> detector (used by Cassandra and Akka) learns how regular each server’s heartbeats are and outputs a suspicion level instead of yes/no. <b>SWIM</b> (used by HashiCorp’s Consul and Serf) asks a few other members to probe a silent server before declaring it dead, so one bad network link does not cause an eviction.',
      'The cost of a false positive is real: evicting a healthy server shifts its load to the others, and a cluster can evict itself to death. Many systems therefore limit how many servers can be evicted at once, or require several independent observers to agree.',
    ],
    diagram,
    caption: 'A short timeout evicts the pausing server as well as the crashed one. A longer timeout waits out the pause, but takes longer to catch the crash.',
    links: [
      { label: 'Kubernetes docs: Nodes and node heartbeats', url: 'https://kubernetes.io/docs/concepts/architecture/nodes/#node-heartbeats' },
      { label: 'AWS docs: Health checks for instances in an Auto Scaling group', url: 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-health-checks.html' },
      { label: 'Das, Gupta and Motivala: SWIM, scalable failure detection (paper)', url: 'https://www.cs.cornell.edu/projects/Quicksilver/public_pdfs/SWIM.pdf' },
    ],
  },
};
