import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const box = (x: number, y: number, w: number, label: string, fill = 'var(--panel)', ink = 'var(--ink)') =>
  `<rect x="${x}" y="${y}" width="${w}" height="34" rx="6" style="fill:${fill};stroke:var(--line);stroke-width:1.5"/><text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" style="fill:${ink}">${label}</text>`;
const arrow = (x1: number, y1: number, x2: number, y2: number, n: string) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(--append);stroke-width:2"/><circle cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" r="9" style="fill:var(--append)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 + 4}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" style="fill:#fff">${n}</text>`;

const diagram = `<svg viewBox="0 0 520 220" role="img" aria-label="A laptop asks a resolver, which asks the root, then the .com server, then the authoritative server, and caches the answer.">
  ${box(10, 90, 90, 'laptop')}${box(150, 90, 110, 'resolver', 'var(--ink)', 'var(--bg)')}
  ${box(370, 14, 120, 'root (.)')}${box(370, 92, 120, '.com TLD')}${box(370, 170, 120, 'ns1.shop.com')}
  ${arrow(100, 107, 150, 107, '1')}${arrow(260, 100, 370, 31, '2')}${arrow(260, 107, 370, 109, '3')}${arrow(260, 114, 370, 187, '4')}
  <text x="205" y="150" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" style="fill:var(--ok)">cache: api.shop.com</text>
  <text x="205" y="165" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" style="fill:var(--ok)">198.51.100.7 · TTL 300 s</text>
</svg>`;

export const meta: GameMeta = {
  id: 'dns-detective',
  level: 1,
  title: 'DNS Detective',
  concept: 'DNS resolution and caching',
  intro:
    'Computers find each other by number (an <b>IP address</b> like 198.51.100.7), but people type names like api.shop.com. <b>DNS</b> turns names into addresses. Your laptop asks a <b>resolver</b>, which walks a tree of servers: the <b>root</b>, then the server for the last part of the name (the <b>TLD</b>, like .com), then the name’s own <b>authoritative</b> server. You are the resolver.',
  legend: [
    { color: 'var(--ink)', shape: 'square', label: 'Resolver: does the lookups for your laptop' },
    { color: 'var(--line)', shape: 'square', label: 'Root, TLD (.com, .io, .org) and authoritative servers' },
    { color: 'var(--ok)', shape: 'square', label: 'Cache: answers the resolver already knows' },
    { color: 'var(--vote)', shape: 'square', label: 'TTL: how long a cached answer may be reused' },
  ],
  howTo: [
    'A short tutorial walks one lookup with you. The clock starts after it.',
    'Click the next server to ask. The log tells you what each server answered.',
    'Right hops build a combo. Asking the wrong server, or a stale cache, costs points.',
  ],
  tasks: [
    'Tutorial: walk one lookup to the top and back',
    'Resolve 4 names by hand',
    'Use the cache for repeat lookups',
    'Catch the stale answer after a server move',
    'Pick the right TTL for two records',
  ],
  lessons: [
    'That was a full <b>recursive lookup</b>: resolver → root → TLD → authoritative server. Each step is a network round trip. Resolvers such as Cloudflare’s 1.1.1.1 and Google’s 8.8.8.8 do this for millions of people.',
    'No single server knows every name. Each level only knows who handles the next part, so the root never needs to hear about shop.com. That delegation is why DNS scales to hundreds of millions of domains.',
    'Repeat lookups came straight from the <b>cache</b>, with zero round trips. Real resolvers answer most queries this way, which is why the root servers are not overwhelmed.',
    'A cache cannot know a record changed, so a real resolver keeps serving the old address until the entry’s <b>TTL</b> (time to live) runs out. You could see the move; real resolvers can’t. That is why teams lower the TTL days before a migration.',
    'TTL is a trade-off: short TTLs mean fast changes but many more queries to your DNS servers; long TTLs mean cheap, cached answers that go stale for longer. Services like Amazon Route 53 let you set it per record.',
  ],
  walkthrough: [
    { id: 'resolver', target: '[data-node="resolver"]', text: 'Your laptop wants api.shop.com. It asks its resolver first: click the Resolver.' },
    { id: 'root', target: '[data-node="root"]', text: 'The resolver knows nothing yet, so it starts at the top: click the Root server.' },
    { id: 'tld', target: '[data-node="tld-com"]', text: 'Root says: ask the .com servers. Click .com.' },
    { id: 'auth', target: '[data-node="auth-shop"]', text: '.com says shop.com is run by ns1.shop.com. Click it to get the address.' },
  ],
  minTimeMs: RULES['dns-detective'].minTimeMs,
  parMs: RULES['dns-detective'].parMs,
  learnMore: {
    paragraphs: [
      'DNS is a distributed database split into <b>zones</b>. The root zone delegates .com to Verisign’s servers, .com delegates shop.com to its owner’s name servers, and so on. A resolver follows these <b>referrals</b> until an authoritative server answers.',
      'Every answer carries a <b>TTL</b>. Resolvers cache answers (and referrals) until the TTL expires, so popular names almost never reach the root. Caches exist at many layers: your browser, your operating system, your router and your ISP’s resolver.',
      'Because caches can’t be recalled, changing a record is slow by design. The standard playbook: lower the TTL well before a change, make the change, then raise it again once traffic has moved.',
    ],
    diagram,
    caption: 'The resolver walks the tree once, then answers repeat questions from its cache until the TTL expires.',
    links: [
      { label: 'RFC 1034: Domain Names, Concepts and Facilities', url: 'https://www.rfc-editor.org/rfc/rfc1034' },
      { label: 'Cloudflare Learning: What is DNS?', url: 'https://www.cloudflare.com/learning/dns/what-is-dns/' },
      { label: 'AWS docs: Route 53 record TTL', url: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values-basic.html' },
    ],
  },
};
