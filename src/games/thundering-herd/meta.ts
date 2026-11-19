import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const bars = (x0: number, y0: number, vals: number[], col: string) =>
  vals.map((v, i) => `<rect x="${x0 + i * 9}" y="${y0 - v}" width="7" height="${v}" style="fill:${col}"/>`).join('');
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Database load over time. Without jitter, every key expires in the same second, making tall spikes every 60 seconds. With jitter, the same refreshes spread into a low, even band.">
  <text x="0" y="16" ${mono} style="fill:var(--ink)">no jitter: everything expires together</text>
  ${bars(0, 90, Array.from({ length: 56 }, (_, i) => (i % 14 === 6 ? 66 : 1)), 'var(--bad)')}
  <line x1="0" y1="72" x2="510" y2="72" style="stroke:var(--muted);stroke-dasharray:4 4"/><text x="510" y="68" text-anchor="end" ${mono} style="fill:var(--muted)">DB limit</text>
  <text x="0" y="116" ${mono} style="fill:var(--ink)">±20% jitter: the same work, spread out</text>
  ${bars(0, 190, Array.from({ length: 56 }, (_, i) => 6 + ((i * 7) % 9)), 'var(--ok)')}
  <line x1="0" y1="172" x2="510" y2="172" style="stroke:var(--muted);stroke-dasharray:4 4"/>
</svg>`;

export const meta: GameMeta = {
  id: 'thundering-herd',
  level: 3,
  title: 'Thundering Herd',
  concept: 'Cache stampedes',
  intro:
    'The homepage is read <b>1,000 times a second</b>. It lives in a cache with a <b>TTL</b> (time to live), so the database barely notices. But the instant the TTL runs out, every request misses at the same moment and they all hit the database together: a <b>cache stampede</b>, or <b>thundering herd</b>. The database can handle about 50 queries at once. You will prevent the herd three ways.',
  legend: [
    { color: 'var(--ok)', shape: 'line', label: 'TTL bar: time left before the cached copy expires' },
    { color: 'var(--vote)', shape: 'square', label: 'The sweet spot: refresh in the last 30%' },
    { color: 'var(--bad)', shape: 'square', label: 'Database load (red = overloaded)' },
  ],
  howTo: [
    'A short tutorial shows you how to refresh a key and what a stampede looks like. The clock starts after it.',
    'Click Refresh to reload the cached copy before it expires. Later, choose protections and press Run.',
    'Every well-timed refresh builds a combo. A stampede, or a wasted early refresh, costs points.',
  ],
  tasks: [
    'Tutorial: refresh a hot key, then watch a stampede',
    'Refresh just in time, 5 times',
    'Protect one hot key: calm database, fast users',
    'Stop 200 keys expiring at once',
  ],
  lessons: [
    'When a hot key expires, every request that arrives during the reload (about 300 requests in 300 ms) goes to the database at once. Refreshing slightly <b>before</b> expiry means the herd never forms.',
    'Refreshing near the end of the TTL is called <b>refresh-ahead</b> or early expiration. Real systems do it automatically, often with a bit of randomness so that many servers don’t all refresh at the same instant (the “XFetch” technique).',
    '<b>Request coalescing</b> lets one request reload the key while the rest wait for it: the database is safe, but users wait 300 ms. <b>Stale-while-revalidate</b> serves the old copy instantly while one request reloads it in the background. CDNs like Cloudflare and Fastly support it via the <code>stale-while-revalidate</code> Cache-Control directive.',
    'Keys cached together expire together. Adding random <b>jitter</b> to each TTL spreads the refreshes out, so the database sees a gentle trickle instead of a spike every minute. The same trick protects you from retry storms and cron jobs that all fire at :00.',
  ],
  walkthrough: [
    { id: 'refresh', target: '#th-refresh', text: 'The homepage expires soon (see its TTL bar). Click Refresh to reload it before it runs out.' },
    { id: 'expire', target: '#th-expire', text: 'Safe. Now see what you prevented: click Expire now and watch the database.' },
  ],
  minTimeMs: RULES['thundering-herd'].minTimeMs,
  parMs: RULES['thundering-herd'].parMs,
  learnMore: {
    paragraphs: [
      'A stampede needs three things: a key that is very hot, a reload that is slow, and many requests arriving during that reload. Remove any one and the herd disappears: keep the key warm (refresh-ahead), make one request do the work (coalescing, also called single-flight), or don’t make anyone wait (stale-while-revalidate).',
      'Synchronized expiry is the multi-key version: a deploy, a cache restart or a bulk import sets thousands of keys at the same moment with the same TTL. Every TTL later they all expire together. Jitter (a random ± on each TTL) breaks the synchronization for free.',
      'Facebook’s memcache uses <b>leases</b> to allow only one reload per key at a time, and returns slightly stale values to everyone else. Go’s <code>singleflight</code> package and Varnish’s request coalescing implement the same idea in a few lines.',
    ],
    diagram,
    caption: 'Same total work, very different peak: jitter turns synchronized spikes into a smooth trickle.',
    links: [
      { label: 'Vattani et al.: Optimal Probabilistic Cache Stampede Prevention (VLDB 2015)', url: 'https://www.vldb.org/pvldb/vol8/p886-vattani.pdf' },
      { label: 'RFC 5861: HTTP Cache-Control extensions for stale content (stale-while-revalidate)', url: 'https://www.rfc-editor.org/rfc/rfc5861' },
      { label: 'Go package singleflight (request coalescing)', url: 'https://pkg.go.dev/golang.org/x/sync/singleflight' },
    ],
  },
};
