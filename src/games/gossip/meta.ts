import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const bars = [1, 2, 4, 8, 16, 32, 50];
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Nodes that know the rumour roughly double each round: 1, 2, 4, 8, 16, 32, then all 50. So the number of rounds grows with log N.">
  ${bars.map((v, i) => `<rect x="${40 + i * 66}" y="${160 - v * 2.6}" width="44" height="${v * 2.6}" rx="3" style="fill:${i === bars.length - 1 ? 'var(--ok)' : 'var(--append)'}"/><text x="${62 + i * 66}" y="${152 - v * 2.6}" text-anchor="middle" ${mono} style="fill:var(--ink)">${v}</text><text x="${62 + i * 66}" y="178" text-anchor="middle" ${mono} style="fill:var(--muted)">r${i}</text>`).join('')}
  <line x1="30" y1="160" x2="500" y2="160" style="stroke:var(--line)"/>
  <text x="260" y="198" text-anchor="middle" ${mono} style="fill:var(--ink)">nodes that know, per round: doubling → about log₂ N rounds</text>
</svg>`;

export const meta: GameMeta = {
  id: 'gossip',
  level: 8,
  title: 'Gossip',
  concept: 'Epidemic broadcast and failure detection',
  intro:
    'How do you tell 1,000 servers something without a central server that could fail? <b>Gossip</b>: every node that knows a rumour tells a few random nodes each <b>round</b>, and they tell others, like a rumour spreading through a school. The number of nodes each one tells is the <b>fanout</b>. Gossip is slow-looking but fast in practice, and it also spreads heartbeats so nodes can notice who has died.',
  legend: [
    { color: 'var(--append)', shape: 'square', label: 'Knows the rumour' },
    { color: 'var(--accent)', shape: 'square', label: 'Your move: a node to tell, or a setting' },
    { color: 'var(--bad)', shape: 'square', label: 'Suspected dead' },
  ],
  howTo: [
    'A short tutorial shows you how to tell a node and end a round. The clock starts after it.',
    'Spread a rumour by hand, then pick a fanout for random gossip, then watch heartbeats and mark dead nodes.',
    'Good moves build a combo. Wasted tells, a bad fanout or accusing a live node costs points.',
  ],
  tasks: [
    'Tutorial: tell one node, end the round',
    'Spread a rumour to 16 nodes by hand',
    'Pick a fanout for 50 nodes',
    'Find the dead nodes from gossiped heartbeats',
  ],
  lessons: [
    'In one round, each node that knows the rumour can pass it on. Nodes told this round start telling others next round.',
    'Every round the number of nodes that know <b>doubled</b>: 1, 2, 4, 8, 16. So reaching N nodes takes about log₂ N rounds: 4 for 16, 10 for 1,000, 20 for a million. That is why gossip scales.',
    'Random picks waste messages on nodes that already know, so real gossip needs a fanout above 1. With fanout 3 the rounds still grow only with log N: about 5 rounds for 50 nodes, 6 for 200, 8 for 800. Cassandra gossips cluster state every second to a few random peers this way.',
    'Each node bumps its own <b>heartbeat counter</b> and gossips the table. A counter that stops going up for a while means the node is probably dead; one that just stalls briefly may only be slow gossip. Timeouts trade fast detection against false alarms. Consul and Serf use SWIM, a gossip failure detector.',
  ],
  walkthrough: [
    { id: 'tell', target: '[data-node="1"]', text: 'You are node 0 and know a rumour. Click node 1 to tell it.' },
    { id: 'round', target: '#gs-round', text: 'You used your one tell this round. Click Next round: now node 0 and node 1 can each tell someone.' },
  ],
  minTimeMs: RULES['gossip'].minTimeMs,
  parMs: RULES['gossip'].parMs,
  learnMore: {
    paragraphs: [
      'Demers et al. (Xerox PARC, 1987) borrowed the maths of epidemics to keep replicated databases in sync: <b>push</b> gossip sends updates to random peers, <b>pull</b> asks random peers for news, and push-pull does both. With N nodes, a rumour reaches everyone in O(log N) rounds with high probability.',
      'Gossip has no leader and no single point of failure, and each node’s load stays constant as the cluster grows. The price is that delivery is probabilistic and a little delayed. Amazon’s Dynamo, Cassandra and Redis Cluster gossip membership and cluster state.',
      'For failure detection, SWIM (Das, Gupta and Motivala, 2002) has each node ping a random peer, ask others to ping it indirectly if it does not answer, and gossip suspicions, so a slow node gets a chance to refute before being declared dead. HashiCorp’s memberlist (Consul, Serf, Nomad) implements it.',
    ],
    diagram,
    caption: 'Doubling each round reaches N nodes in about log₂ N rounds.',
    links: [
      { label: 'Demers et al.: Epidemic Algorithms for Replicated Database Maintenance (PODC 1987)', url: 'https://dl.acm.org/doi/10.1145/41840.41841' },
      { label: 'Das, Gupta and Motivala: SWIM, Scalable Weakly-consistent Infection-style Process Group Membership (DSN 2002)', url: 'https://www.cs.cornell.edu/projects/Quicksilver/public_pdfs/SWIM.pdf' },
      { label: 'Apache Cassandra docs: gossip and failure detection', url: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html' },
    ],
  },
};
