import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Cache-aside: the app asks the cache first. On a hit it answers in 2 ms. On a miss it reads the database in 300 ms and stores the answer in the cache. On a write it updates the database and deletes the cached copy.">
  <rect x="10" y="80" width="90" height="40" rx="6" style="fill:var(--panel);stroke:var(--line);stroke-width:1.5"/><text x="55" y="105" text-anchor="middle" ${mono} style="fill:var(--ink)">app</text>
  <rect x="210" y="20" width="110" height="40" rx="6" style="fill:var(--ok)"/><text x="265" y="45" text-anchor="middle" ${mono} style="fill:#fff">cache · 2 ms</text>
  <rect x="210" y="140" width="110" height="40" rx="6" style="fill:var(--ink)"/><text x="265" y="165" text-anchor="middle" ${mono} style="fill:var(--bg)">DB · 300 ms</text>
  <line x1="100" y1="90" x2="208" y2="45" style="stroke:var(--ok);stroke-width:2"/><text x="140" y="58" ${mono} style="fill:var(--ok)">1 get</text>
  <line x1="100" y1="112" x2="208" y2="160" style="stroke:var(--muted);stroke-width:2;stroke-dasharray:5 4"/><text x="120" y="150" ${mono} style="fill:var(--muted)">2 miss: read</text>
  <line x1="320" y1="160" x2="320" y2="62" style="stroke:var(--append);stroke-width:2"/><text x="330" y="112" ${mono} style="fill:var(--append)">3 store</text>
  <text x="400" y="80" ${mono} style="fill:var(--bad)">on write:</text><text x="400" y="98" ${mono} style="fill:var(--bad)">update DB,</text><text x="400" y="116" ${mono} style="fill:var(--bad)">delete key</text>
</svg>`;

export const meta: GameMeta = {
  id: 'cache-hit',
  level: 3,
  title: 'Cache Hit',
  concept: 'Caching and eviction',
  intro:
    'A database read takes about <b>300 ms</b>; a read from an in-memory <b>cache</b> takes about <b>2 ms</b>. So apps keep copies of popular data in a small, fast cache. A <b>hit</b> means the answer was in the cache; a <b>miss</b> means a trip to the database. The cache is small, so when it is full something must be <b>evicted</b> (thrown out). And when the database changes, the cached copy goes <b>stale</b>.',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'Hit: answered from the cache in 2 ms' },
    { color: 'var(--bad)', shape: 'square', label: 'Miss: went to the database, 300 ms' },
    { color: 'var(--ink)', shape: 'square', label: 'A cache slot (4 of them)' },
    { color: 'var(--vote)', shape: 'line', label: 'Bars: how often each page was asked for' },
  ],
  howTo: [
    'A short tutorial shows you how to store a page in the cache. The clock starts after it.',
    'On a miss, click the slot to put the page in (that evicts whatever is there).',
    'Every hit builds a combo. Evicting a clearly popular page, or serving a stale price, costs points.',
  ],
  tasks: [
    'Tutorial: put two pages in the cache',
    'Be the cache: reach a 70% hit rate',
    'Pick LRU or LFU for two traffic stories',
    'Never show a stale price',
  ],
  lessons: [
    'This is <b>cache-aside</b>: the app checks the cache, and on a miss reads the database and stores the answer. It is how most apps use Redis or Memcached.',
    'You just invented an <b>eviction policy</b>: a rule for what to throw out. If you threw out the page used <i>longest ago</i>, that rule is called <b>LRU</b>; if you threw out the page used <i>fewest times</i>, it is <b>LFU</b>. On real sites a few pages get most of the traffic, so a small cache with a good rule turns most 300 ms reads into 2 ms reads.',
    '<b>LRU</b> (least recently used) evicts what was used longest ago: great when popularity shifts, but a one-off scan flushes everything. <b>LFU</b> (least frequently used) evicts what is used least: great against scans, but yesterday’s favourites hang around. Redis offers both (allkeys-lru, allkeys-lfu).',
    'A cache cannot know the database changed. The standard fix is to <b>delete the cached key when you write</b>, so the next read fetches the fresh value. Facebook’s memcache paper describes exactly this, plus the races that make it tricky at scale.',
  ],
  walkthrough: [
    { id: 'slot0', target: '[data-slot="0"]', text: 'A request for “deals” missed the cache and went to the slow database. Click the first empty slot to keep it.' },
    { id: 'slot1', target: '[data-slot="1"]', text: 'Next, “shoes” missed too. Click the second slot to keep it.' },
  ],
  minTimeMs: RULES['cache-hit'].minTimeMs,
  parMs: RULES['cache-hit'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'A cache works because access is skewed: on most sites a few percent of items get most of the reads. The <b>hit rate</b> decides everything: at 90% hits, average latency is 0.9 × 2 + 0.1 × 300 = 32 ms; at 50% it is 151 ms.',
      'Eviction policies trade off differently. LRU is simple and adapts quickly. LFU resists scans but needs aging so old favourites can fade. Modern caches combine both ideas: Redis approximates LFU with decaying counters, and Caffeine (Java) uses TinyLFU with a small LRU window.',
      'Freshness is the hard part. Options: a short <b>TTL</b> (accept bounded staleness), <b>delete on write</b> (cache-aside), or <b>write-through</b> (update the cache and database together). Each has races: a slow reader can put an old value back right after you delete it, which is why systems add leases or versions.',
    ],
    diagram,
    caption: 'Cache-aside: read from the cache, fall back to the database, and delete the cached key when the data changes.',
    links: [
      { label: 'Redis docs: Key eviction (LRU and LFU policies)', url: 'https://redis.io/docs/latest/develop/reference/eviction/' },
      { label: 'Nishtala et al.: Scaling Memcache at Facebook (NSDI 2013)', url: 'https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf' },
      { label: 'AWS whitepaper: Database caching strategies using Redis', url: 'https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/welcome.html' },
    ],
  },
};
