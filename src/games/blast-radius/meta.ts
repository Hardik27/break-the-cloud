import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const az = (x: number, label: string, dead = false) =>
  `<rect x="${x}" y="40" width="140" height="110" rx="8" style="fill:${dead ? 'color-mix(in srgb,var(--bad) 10%,transparent)' : 'none'};stroke:${dead ? 'var(--bad)' : 'var(--line)'};stroke-width:1.5;stroke-dasharray:${dead ? '5 4' : 'none'}"/><text x="${x + 70}" y="60" text-anchor="middle" ${mono} style="fill:var(--muted)">zone ${label}</text>`;
const srv = (x: number, y: number, col: string) => `<rect x="${x}" y="${y}" width="40" height="22" rx="3" style="fill:${col}"/>`;
const diagram = `<svg viewBox="0 0 520 190" role="img" aria-label="A region with three availability zones. Two web servers sit in each zone, the database primary in zone b and its replica in zone c. Zone a fails; four web servers and the database survive.">
  <rect x="2" y="20" width="500" height="150" rx="10" style="fill:none;stroke:var(--ink);stroke-width:1.5"/><text x="12" y="14" ${mono} style="fill:var(--ink)">region us-east</text>
  ${az(20, 'a', true)}${az(180, 'b')}${az(340, 'c')}
  ${srv(40, 75, 'var(--muted)')}${srv(100, 75, 'var(--muted)')}${srv(200, 75, 'var(--ok)')}${srv(260, 75, 'var(--ok)')}${srv(360, 75, 'var(--ok)')}${srv(420, 75, 'var(--ok)')}
  <rect x="200" y="110" width="100" height="24" rx="3" style="fill:var(--ink)"/><text x="250" y="126" text-anchor="middle" ${mono} style="fill:var(--bg)">db primary</text>
  <rect x="360" y="110" width="100" height="24" rx="3" style="fill:var(--append)"/><text x="410" y="126" text-anchor="middle" ${mono} style="fill:#fff">db replica</text>
  <text x="90" y="128" text-anchor="middle" ${mono} style="fill:var(--bad)">✕ zone lost</text>
</svg>`;

export const meta: GameMeta = {
  id: 'blast-radius',
  level: 5,
  title: 'Blast Radius',
  concept: 'Zones, regions and failover',
  intro:
    'Every data center fails eventually: power, cooling, a cut fibre. Clouds split each <b>region</b> (like us-east) into several <b>availability zones</b> (AZs): separate buildings with their own power and network, a few kilometres apart. The <b>blast radius</b> of a failure is how much it takes down with it. Your job is to make sure losing one zone, or even a whole region, does not lose the service.',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'Web server (4 needed to serve everyone)' },
    { color: 'var(--ink)', shape: 'square', label: 'Database primary (takes the writes)' },
    { color: 'var(--append)', shape: 'square', label: 'Database replica (a live copy)' },
    { color: 'var(--bad)', shape: 'dash', label: 'A zone that has failed' },
  ],
  howTo: [
    'A short tutorial shows you how to move a server and test a zone failure. The clock starts after it.',
    'Click a zone button to move a component there. Press Test to fail each zone in turn.',
    'Good moves build a combo. Failed tests, outage seconds and servers launched in a dead zone cost points.',
  ],
  tasks: [
    'Tutorial: move a server, test a zone failure',
    'Spread servers and databases across zones',
    'Lose a zone live: fail over and add capacity',
    'Plan for losing a whole region',
  ],
  lessons: [
    'Putting everything in one zone means one power failure takes down everything. The test fails each zone in turn: the only question that matters is what is left standing.',
    'Two web servers per zone and the database copies in different zones: any one zone can fail and you still have 4 servers and a database. AWS, Google Cloud and Azure all recommend spreading across at least 3 zones for this reason.',
    'When the zone holding the primary failed, writes stopped until the replica was <b>promoted</b>. Amazon RDS Multi-AZ does this automatically in about a minute. You also had to add servers in the healthy zones, never in the dead one.',
    '<b>RPO</b> (recovery point objective) is how much recent data you can afford to lose; <b>RTO</b> (recovery time objective) is how long you can be down. Async replication kept RPO to seconds without slowing every write; a warm standby met the RTO without paying for a second full copy.',
  ],
  walkthrough: [
    { id: 'move', target: '[data-place="web-2-b"]', text: 'Everything is in zone a. Click zone b for web-2 to move it there.' },
    { id: 'test', target: '#br-test', text: 'Now press Test zone failures to see what survives when each zone goes down.' },
  ],
  minTimeMs: RULES['blast-radius'].minTimeMs,
  parMs: RULES['blast-radius'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'Zones are close enough (usually under 100 km) for fast synchronous replication, and far enough apart not to share power, cooling or flooding risk. Regions are hundreds of kilometres apart: they survive regional disasters, but replication between them is slow, so it is usually asynchronous.',
      'Disaster recovery strategies trade cost for speed. Backup-and-restore is cheap and slow (hours). Pilot light keeps the data replicated and boots servers when needed. Warm standby runs a small copy of everything. Active-active serves traffic from both regions all the time: near-zero RTO, but the most expensive and the hardest to keep consistent.',
      'The quietest killer is a hidden dependency: one service, DNS zone, or configuration store that lives in a single zone. Teams find these with <b>game days</b> (deliberately failing a zone, like you did) and limit damage further with <b>cells</b>: independent copies of the whole stack, each serving a slice of customers.',
    ],
    diagram,
    caption: 'Spread across three zones, losing any one leaves enough capacity and a copy of the data.',
    links: [
      { label: 'AWS docs: Regions and Availability Zones', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html' },
      { label: 'AWS whitepaper: Disaster Recovery of Workloads on AWS (RPO, RTO, strategies)', url: 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html' },
      { label: 'AWS Well-Architected: Reducing scope of impact with cell-based architecture', url: 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/reducing-scope-of-impact-with-cell-based-architecture.html' },
    ],
  },
};
