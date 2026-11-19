import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const diagram = `<svg viewBox="0 0 520 210" role="img" aria-label="Without a CDN, a user in Sydney makes three long round trips to Virginia. With a CDN, the same three round trips go to a nearby edge, and only cache misses travel to the origin.">
  <text x="10" y="20" ${mono} style="fill:var(--muted)">without CDN</text>
  <circle cx="40" cy="60" r="12" style="fill:var(--bad)"/><text x="40" y="90" text-anchor="middle" ${mono} style="fill:var(--ink)">Sydney</text>
  <rect x="440" y="44" width="70" height="32" rx="5" style="fill:var(--ink)"/><text x="475" y="64" text-anchor="middle" ${mono} style="fill:var(--bg)">origin</text>
  <line x1="55" y1="60" x2="438" y2="60" style="stroke:var(--bad);stroke-width:2;stroke-dasharray:6 4"/><text x="245" y="52" text-anchor="middle" ${mono} style="fill:var(--bad)">3 × 254 ms = 780 ms</text>
  <text x="10" y="130" ${mono} style="fill:var(--muted)">with CDN</text>
  <circle cx="40" cy="170" r="12" style="fill:var(--ok)"/><text x="40" y="200" text-anchor="middle" ${mono} style="fill:var(--ink)">Sydney</text>
  <rect x="120" y="154" width="70" height="32" rx="5" style="fill:var(--accent)"/><text x="155" y="174" text-anchor="middle" ${mono} style="fill:#fff">edge</text>
  <line x1="55" y1="170" x2="118" y2="170" style="stroke:var(--ok);stroke-width:2"/><text x="86" y="160" text-anchor="middle" ${mono} style="fill:var(--ok)">3 × 2 ms</text>
  <rect x="440" y="154" width="70" height="32" rx="5" style="fill:var(--ink)"/><text x="475" y="174" text-anchor="middle" ${mono} style="fill:var(--bg)">origin</text>
  <line x1="192" y1="170" x2="438" y2="170" style="stroke:var(--muted);stroke-width:1.5;stroke-dasharray:3 5"/><text x="315" y="162" text-anchor="middle" ${mono} style="fill:var(--muted)">only on a cache miss</text>
</svg>`;

export const meta: GameMeta = {
  id: 'latency-budget',
  level: 1,
  title: 'Latency Budget',
  concept: 'RTT, CDNs and edge caching',
  intro:
    'Every request travels to a server and back: one <b>round trip</b>, or <b>RTT</b>. Light in fibre covers about 200 km per millisecond, so distance is time. A page needs about <b>3 round trips</b> (TCP handshake, TLS handshake, the request), so a far-away server is slow no matter how fast it is. Here you decide where servers live.',
  legend: [
    { color: 'var(--ok)', shape: 'dot', label: 'City whose page loads within the goal' },
    { color: 'var(--bad)', shape: 'dot', label: 'City over the goal' },
    { color: 'var(--ink)', shape: 'square', label: 'Origin: the main server with all the data' },
    { color: 'var(--accent)', shape: 'square', label: 'CDN edge: a nearby copy of static files' },
  ],
  howTo: [
    'A short tutorial shows you how to measure a city and move a server. The clock starts after it.',
    'Click a data center to move the server or add an edge. Click a city to see where its time goes.',
    'Moves that get more people under the goal build a combo. A wasted edge costs points.',
  ],
  tasks: [
    'Tutorial: measure a user, move the server',
    'Place one server for the whole world',
    'Get every city under 150 ms with CDN edges',
    'Sort requests: edge or origin?',
  ],
  lessons: [
    'Distance is time. Light in fibre covers about 200 km per millisecond, and a page needs about 3 round trips, so a user 10,000 km away waits well over 300 ms before anything appears. No faster server fixes the speed of light.',
    'With one server, someone is always far away. Ireland reached the most people because it sits between North America, Europe and Africa. Many companies start with one region in the US or Europe, and it is never enough for a global product.',
    'A <b>CDN</b> (content delivery network) keeps copies of static files on edge servers in hundreds of cities. Users fetch from the nearest edge, so their round trips are short. Cloudflare, Akamai and Amazon CloudFront all work this way. Notice Lagos: no cloud region was close, but a CDN edge was.',
    'Edges only help with content that is the same for everyone, or safe to reuse for a while. Personalised, private, live and write requests still travel to the origin. Teams speed those up with regional servers and database replicas, which raises the next problem: keeping copies in sync.',
  ],
  walkthrough: [
    { id: 'mumbai', target: '[data-user="mumbai"]', text: 'Your only server is in Virginia. Click Mumbai to see how long its page takes.' },
    { id: 'move', target: '[data-site="ap-south"]', text: 'That is slow. Move the server: click the Mumbai data center.' },
    { id: 'newyork', target: '[data-user="newyork"]', text: 'Mumbai is fast now. Click New York to see what the move cost them.' },
  ],
  minTimeMs: RULES['latency-budget'].minTimeMs,
  parMs: RULES['latency-budget'].parMs,
  learnMore: {
    paragraphs: [
      'Latency has a floor set by physics: about 5 ms per 1,000 km of fibre, each way, plus routing detours. Bandwidth keeps improving; that floor does not. For most web pages, the number of round trips matters more than the size of the files.',
      'CDNs attack the floor by moving content closer. An edge answers from its cache when it can (a <b>hit</b>) and fetches from the origin when it can’t (a <b>miss</b>), usually over a fast, already-open connection. The <code>Cache-Control</code> header tells edges what they may keep and for how long; <code>private</code> means “never share this between users”.',
      'Dynamic, personalised data needs a different tool: run your application in several regions, put read replicas of the database near users, or compute at the edge (Cloudflare Workers, Lambda@Edge). Each copy you add brings back the consistency problems you will meet in Level 6.',
    ],
    diagram,
    caption: 'The same three round trips, either across the planet or across town.',
    links: [
      { label: 'Cloudflare Learning: What is a CDN?', url: 'https://www.cloudflare.com/learning/cdn/what-is-a-cdn/' },
      { label: 'MDN: HTTP caching and Cache-Control', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching' },
      { label: 'Ilya Grigorik: High Performance Browser Networking, “Primer on Latency and Bandwidth”', url: 'https://hpbn.co/primer-on-latency-and-bandwidth/' },
    ],
  },
};
