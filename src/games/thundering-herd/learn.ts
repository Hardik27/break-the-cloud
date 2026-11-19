/** Thundering Herd: concept cards, hints and the opening incident. */
import { arrow, box, person, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '12:00:01 · database CPU jumped from 20% to 100% for 4 seconds · it happens every 10 minutes, exactly when the homepage cache expires.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'When a popular cache entry expires',
    frames: [
      {
        svg: svg(
          box(30, 70, 160, 60, 'cache: homepage', { col: 'var(--ok)', sub: 'TTL 10 s left…' }) + Array.from({ length: 8 }, (_, i) => person(260 + (i % 4) * 75, 60 + Math.floor(i / 4) * 90, '')).join('') + arrow(250, 100, 196, 100, 'all read it', 'green'),
          'Hundreds of users read one cached page.',
        ),
        html: '<p>A cached copy has a <b>TTL</b>: after that it expires and must be reloaded from the database. For a page everyone reads, like the homepage, hundreds of requests per second hit that one cache entry.</p>',
      },
      {
        svg: svg(
          box(30, 30, 160, 50, 'cache: (expired)', { col: 'var(--line)', dash: true }) + box(380, 120, 160, 60, 'database', { col: 'var(--bad)', sub: '300 ms per query' }) +
            Array.from({ length: 7 }, (_, i) => arrow(200, 50 + i * 4, 374, 128 + i * 6, '', 'red')).join('') + text(280, 210, 'every request misses at once → hundreds of queries', { col: 'var(--bad)', size: 13 }),
          'When it expires, every request misses and goes to the database at once.',
        ),
        html: '<p>The moment it expires, every request misses <i>at the same time</i>, and every one goes to the database to rebuild the same page. That stampede is the <b>thundering herd</b>. First, prevent it by hand: refresh the entry just before it expires.</p>',
      },
    ],
    check: {
      q: 'A hot cache entry expires. 500 requests arrive in the next 300 ms. Without protection, how many database queries?',
      options: ['1', 'Up to 500'],
      answer: 1,
      why: 'Each request sees a miss and reloads on its own. The database gets a spike of identical queries.',
    },
  },
  null,
  {
    title: 'Two classic protections',
    frames: [
      {
        svg: svg(
          box(30, 40, 240, 70, 'a lock', { col: 'var(--append)', sub: 'only one request reloads' }) + box(290, 40, 240, 70, 'serve stale', { col: 'var(--ok)', sub: 'others get the old copy meanwhile' }) +
            text(280, 160, 'lock: protects the database · serve stale: protects the users', { size: 13 }),
          'A lock makes one request reload; serving stale keeps others fast.',
        ),
        html: '<p><b>A lock</b> (also called request coalescing): the first request to miss takes a lock and reloads; the others wait for its result. The database sees one query. <b>Serve stale</b>: while that one reload runs, everyone else gets the slightly old copy instantly instead of waiting.</p>',
      },
    ],
    check: {
      q: 'With a lock but no stale copy, what do the other users experience while one request reloads?',
      options: ['Nothing, they get the page instantly', 'They wait for the reload (about 300 ms)'],
      answer: 1,
      why: 'The database is safe, but users queue behind the one reload. Serving stale removes that wait.',
    },
  },
  {
    title: 'Expiring all together',
    frames: [
      {
        svg: svg(
          text(30, 40, 'no jitter: 200 keys, TTL 60 s, cached together', { anchor: 'start', size: 13 }) + `<rect x="30" y="50" width="12" height="70" style="fill:var(--bad)"/>` + `<rect x="270" y="50" width="12" height="70" style="fill:var(--bad)"/>` +
            text(30, 160, 'jitter: TTL = 60 s ± a random bit', { anchor: 'start', size: 13 }) + Array.from({ length: 30 }, (_, i) => `<rect x="${30 + i * 16}" y="${190 - 10 - (i % 3) * 4}" width="10" height="${10 + (i % 3) * 4}" style="fill:var(--ok)"/>`).join(''),
          'Without jitter, keys cached together expire together; jitter spreads them.',
          210,
        ),
        html: '<p>After a deploy, thousands of keys may be cached at the same moment with the same TTL. They also <b>expire</b> at the same moment, every TTL: a herd made of many keys. Fix: add random <b>jitter</b> to each TTL (60 s ± a few seconds) so expiries spread out.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Watch the TTL bar: it turns amber in its last 30%.',
    concept: 'Refresh while the entry is still valid, just before it expires. Too early wastes a query; too late lets the herd through.',
    show: 'Click Refresh as soon as the bar turns amber.',
  },
  {
    nudge: 'There are two problems: the database load, and how long users wait.',
    concept: 'A lock lets one request reload. Serving stale lets everyone else skip the wait.',
    show: 'Turn on both the lock (coalescing) and serve stale, then Run.',
    target: '#th-coal',
  },
  {
    nudge: 'In the replay, how wide are the spikes with your jitter?',
    concept: 'More jitter spreads the expiries over more seconds, so fewer happen in any one second.',
    show: 'Pick ±20% jitter (or more), then Run.',
    target: '[data-jitter="20"]',
  },
];
