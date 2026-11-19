import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const pt = (pos: number, r: number) => {
  const a = (pos / 100) * 2 * Math.PI - Math.PI / 2;
  return { x: 130 + r * Math.cos(a), y: 100 + r * Math.sin(a) };
};
const srv = (pos: number, label: string, col: string) => {
  const p = pt(pos, 70);
  return `<circle cx="${p.x}" cy="${p.y}" r="11" style="fill:${col}"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" ${mono} style="fill:#fff">${label}</text>`;
};
const key = (pos: number, col: string) => {
  const p = pt(pos, 70);
  return `<circle cx="${p.x}" cy="${p.y}" r="4" style="fill:${col}"/>`;
};
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="A hash ring with servers A, B and C. Adding server D between B and C moves only the keys in the arc just before D.">
  <circle cx="130" cy="100" r="70" style="fill:none;stroke:var(--line);stroke-width:3"/>
  ${key(30, 'var(--muted)')}${key(52, 'var(--accent)')}${key(58, 'var(--accent)')}${key(70, 'var(--muted)')}${key(90, 'var(--muted)')}
  ${srv(10, 'A', 'var(--ink)')}${srv(45, 'B', 'var(--ink)')}${srv(80, 'C', 'var(--ink)')}${srv(62, 'D', 'var(--accent)')}
  <text x="260" y="60" ${mono} style="fill:var(--ink)">Each key belongs to the next server</text><text x="260" y="76" ${mono} style="fill:var(--ink)">clockwise.</text>
  <text x="260" y="110" ${mono} style="fill:var(--accent)">Adding D moves only the keys between</text><text x="260" y="126" ${mono} style="fill:var(--accent)">B and D (orange). hash mod N would</text><text x="260" y="142" ${mono} style="fill:var(--accent)">move about 3 of every 4 keys.</text>
</svg>`;

export const meta: GameMeta = {
  id: 'the-ring',
  level: 4,
  title: 'The Ring',
  concept: 'Consistent hashing',
  intro:
    'One server can’t hold everything, so data is split into <b>shards</b> across servers. Each key (like <code>user:ana</code>) goes through a <b>hash function</b>, which turns it into a number that looks random but is always the same for the same key. The question is how to turn that number into a server, and what happens when you add one: every key that moves has to be copied over the network.',
  legend: [
    { color: 'var(--ink)', shape: 'square', label: 'A server (a shard)' },
    { color: 'var(--append)', shape: 'dot', label: 'A key, at the position its hash gives it' },
    { color: 'var(--accent)', shape: 'dot', label: 'A key that has to move to another server' },
  ],
  howTo: [
    'A short tutorial shows you how to place a key with hash mod N. The clock starts after it.',
    'Click the server where the current key belongs. Later, click the keys that have to move.',
    'Right answers build a combo. A wrong server, or a key that would not move, costs points.',
  ],
  tasks: [
    'Tutorial: place two keys with hash mod 3',
    'Add a server to hash mod N, and re-place every key',
    'Place keys on a hash ring, then find the ones that move',
    'Balance an unlucky ring with virtual nodes',
  ],
  lessons: [
    '<b>hash mod N</b> is the simplest way to shard: a key with hash 16 on 3 servers goes to 16 mod 3 = server 1. It spreads keys evenly, and every client can work out where a key lives without asking anyone.',
    'Adding one server changed N, and the answer to “hash mod N” changed for most keys: 6 of 8 had to move. On a real cluster that is most of your data copied across the network at once, which is why plain modulo sharding makes scaling painful.',
    'On a <b>hash ring</b>, a key belongs to the next server clockwise. A new server only takes keys from its neighbour, so only about 1/N of keys move. This is <b>consistent hashing</b>, used by Amazon’s Dynamo, Cassandra and many CDNs.',
    'With only one point per server, the gaps on the ring are uneven, so one server gets far more keys. Giving each server many <b>virtual nodes</b> (points on the ring) averages the gaps out. Cassandra uses many tokens per node for exactly this.',
  ],
  walkthrough: [
    { id: 'k0', target: '[data-srv="0"]', text: 'user:ana hashes to 3. With 3 servers, 3 mod 3 = 0: click server S0.' },
    { id: 'k1', target: '[data-srv="1"]', text: 'cart:42 hashes to 16, and 16 mod 3 = 1: click server S1.' },
  ],
  minTimeMs: RULES['the-ring'].minTimeMs,
  parMs: RULES['the-ring'].parMs,
  learnMore: {
    paragraphs: [
      'Consistent hashing was introduced by Karger and colleagues in 1997 for web caches. Servers and keys are hashed onto the same circle; each key is stored on the first server clockwise. When a server joins or leaves, only the keys in its arc move, about K/N of K keys.',
      'Real systems add two refinements. <b>Virtual nodes</b> place each server at many points, which evens out load and lets a bigger machine take more points. <b>Replication</b> stores each key on the next few servers clockwise too, so losing one server loses no data (Dynamo’s “preference list”).',
      'Alternatives exist: <b>rendezvous hashing</b> (highest random weight) picks the server with the highest hash(key, server) score, and <b>jump consistent hash</b> (Google) computes a bucket with no ring at all. All of them aim for the same property: small, predictable movement when the cluster changes.',
    ],
    diagram,
    caption: 'Adding a server to a ring moves only the keys in one arc.',
    links: [
      { label: 'Karger et al.: Consistent Hashing and Random Trees (STOC 1997)', url: 'https://dl.acm.org/doi/10.1145/258533.258660' },
      { label: 'DeCandia et al.: Dynamo, Amazon’s Highly Available Key-value Store (SOSP 2007)', url: 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf' },
      { label: 'Apache Cassandra docs: data distribution and virtual nodes', url: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html' },
    ],
  },
};
