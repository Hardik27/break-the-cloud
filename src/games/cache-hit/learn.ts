/** Cache Hit: concept cards, hints and the opening incident. */
import { arrow, box, person, stopwatch, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '02:14 · /deals takes 3.1 s to load · the database is at 98% CPU · every single page view goes to the database.';

const slots = (x: number, y: number, keys: (string | null)[], hl = -1, col = 'var(--ok)') =>
  keys.map((k, i) => box(x + i * 92, y, 84, 44, k ?? 'empty', { col: i === hl ? 'var(--bad)' : k ? col : 'var(--line)', dash: !k, size: 13 })).join('');

export const learn: (LearnCard | null)[] = [
  {
    title: 'What is a cache?',
    frames: [
      {
        svg: svg(
          person(50, 110, 'you') +
            box(400, 70, 140, 80, 'Library', { col: 'var(--ink)', sub: 'the database' }) +
            arrow(80, 100, 392, 100, 'walk there and back', 'muted') +
            stopwatch(240, 160, '300 ms'),
          'You walk to the library for every fact: 300 ms per trip.',
        ),
        html: '<p>Your app’s data lives in a <b>database</b>. Asking it for a page is like walking to the library: about <b>300 ms</b> every time, even for the same page you read a second ago.</p>',
      },
      {
        svg: svg(
          person(50, 110, 'you') +
            box(150, 70, 150, 80, 'Your desk', { col: 'var(--ok)', sub: '4 sticky notes' }) +
            box(400, 70, 140, 80, 'Library', { col: 'var(--ink)', sub: 'the database' }) +
            arrow(80, 100, 142, 100, '', 'green') +
            stopwatch(225, 185, '2 ms', 'var(--ok)'),
          'A copy on your desk takes 2 ms to read.',
        ),
        html: '<p>So you keep copies of the pages you need most on your desk. Reading a copy takes about <b>2 ms</b>, 150 times faster. That desk is a <b>cache</b>: a small, fast store of copies.</p>',
      },
      {
        svg: svg(
          text(20, 40, 'request “deals”', { anchor: 'start', size: 13 }) + text(20, 64, 'on the desk → HIT · 2 ms', { anchor: 'start', col: 'var(--ok)', bold: true }) +
            text(20, 120, 'request “toys”', { anchor: 'start', size: 13 }) + text(20, 144, 'not on the desk → MISS · walk to the library · 300 ms', { anchor: 'start', col: 'var(--bad)', bold: true }) +
            text(20, 190, 'Hit rate = hits ÷ all requests. Higher is faster.', { anchor: 'start', col: 'var(--muted)' }),
          'A hit is served from the cache in 2 ms; a miss goes to the database in 300 ms.',
        ),
        html: '<p>When the page is on your desk, that is a <b>hit</b>. When it is not, a <b>miss</b>: you walk to the library and can then keep a copy. The share of requests that are hits is the <b>hit rate</b>.</p>',
      },
      {
        svg: svg(slots(40, 60, ['home', 'deals', 'shoes', 'phones']) + text(280, 150, 'full! a miss for “toys” arrives… one note must go', { col: 'var(--bad)', size: 13 }), 'The cache has 4 slots, all full. A new page needs room.'),
        html: '<p>Your desk only fits <b>4 notes</b>. When it is full and you want to keep a new page, one note must be thrown out. That is called <b>eviction</b>. Throw out the wrong one and you will be walking to the library again soon.</p>',
      },
    ],
    check: {
      q: 'The cache is full. A miss for “toys” comes in and you want to keep it. What has to happen?',
      options: ['A fifth slot appears', 'One page in the cache is thrown out (evicted)', 'The cache stops answering requests'],
      answer: 1,
      why: 'A cache has a fixed size. To keep something new, something old must go. Choosing <i>what</i> goes is the whole game.',
    },
  },
  {
    title: 'You decide what to throw out',
    frames: [
      {
        svg: svg(
          box(40, 50, 120, 60, 'home', { col: 'var(--ok)', sub: 'used 9× · 2 s ago' }) +
            box(180, 50, 120, 60, 'toys', { col: 'var(--ok)', sub: 'used 1× · 40 s ago' }) +
            box(320, 50, 120, 60, 'deals', { col: 'var(--ok)', sub: 'used 6× · 5 s ago' }) +
            text(280, 160, 'Which note would you throw out?', { size: 14, bold: true }),
          'Each slot shows how many times its page was used and how long ago.',
        ),
        html: '<p>Requests will start flowing. On a miss, click a slot to keep the new page there; the page in it is thrown out. Each slot shows <b>how many times</b> its page was asked for and <b>how long ago</b>. Use that to choose. There is no single right click: find a rule that works.</p>',
      },
    ],
  },
  {
    title: 'Real caches follow a rule',
    frames: [
      {
        svg: svg(
          slots(40, 40, ['home', 'toys', 'deals', 'bags'], 1, 'var(--ok)') +
            text(40 + 92 + 42, 108, 'used longest ago', { col: 'var(--bad)', size: 13 }) +
            text(280, 170, 'LRU · Least Recently Used: throw out what you haven’t touched for the longest time', { size: 12.5 }),
          'LRU evicts the page used longest ago.',
        ),
        html: '<p>A real cache serves thousands of requests a second, so it can’t ask you. It follows a rule. The first classic rule is <b>LRU, least recently used</b>: throw out the page that hasn’t been asked for in the longest time. It bets that what you used recently, you will use again soon.</p>',
      },
      {
        svg: svg(
          slots(40, 40, ['home', 'toys', 'deals', 'bags'], 3, 'var(--ok)') +
            text(40 + 3 * 92 + 42, 108, 'used fewest times', { col: 'var(--bad)', size: 13 }) +
            text(280, 170, 'LFU · Least Frequently Used: throw out what has been used the fewest times', { size: 12.5 }),
          'LFU evicts the page used the fewest times.',
        ),
        html: '<p>The second is <b>LFU, least frequently used</b>: throw out the page asked for the fewest times. It bets that popular pages stay popular.</p><p>Neither is always better. It depends on how your traffic behaves, and that is what you will test next.</p>',
      },
    ],
    check: {
      q: 'A one-off job reads 50 old pages, each exactly once. Which rule protects your popular pages from being pushed out?',
      options: ['LRU: the old pages were used most recently', 'LFU: the old pages were each used only once'],
      answer: 1,
      why: 'Under LRU each one-off page looks “just used”, so the popular pages get thrown out. LFU sees they were used only once and throws them out first.',
    },
  },
  {
    title: 'When the copy goes out of date',
    frames: [
      {
        svg: svg(
          box(40, 50, 180, 70, 'Cache: $50', { col: 'var(--bad)', sub: 'old copy' }) +
            box(340, 50, 180, 70, 'Database: $45', { col: 'var(--ink)', sub: 'admin changed it' }) +
            person(130, 190, 'shopper sees $50'),
          'The database changed, but the cached copy still has the old value.',
        ),
        html: '<p>A cached copy doesn’t know when the database changes. If an admin lowers the price of shoes, the cache keeps serving the old price. That is <b>stale data</b>.</p>',
      },
      {
        svg: svg(
          box(40, 50, 180, 70, 'Cache: (deleted)', { col: 'var(--line)', dash: true }) +
            box(340, 50, 180, 70, 'Database: $45', { col: 'var(--ink)' }) +
            arrow(338, 100, 226, 100, 'next read fetches $45', 'green'),
          'Deleting the cached copy makes the next read fetch the fresh value.',
        ),
        html: '<p>The fix is <b>invalidation</b>: the moment the database changes, delete the cached copy. The next read misses, fetches the fresh price and caches it again.</p>',
      },
    ],
    check: {
      q: 'An admin just changed the price in the database. The cached price expires in an hour. What should you do?',
      options: ['Nothing: it fixes itself in an hour', 'Delete the cached price now', 'Change the price back'],
      answer: 1,
      why: 'Waiting an hour means an hour of wrong prices. Delete (invalidate) the cached copy as soon as the source changes.',
    },
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Look at the two numbers under each cached page: how many times it was used, and how long ago.',
    concept: 'Pages asked for often will probably be asked for again. A page asked for once may never come back. Keep the popular ones.',
    show: 'On a miss, click the slot whose page has the <b>smallest</b> “used” count. If the new page is rarer than everything cached, press Skip.',
    target: '.ch-slot',
  },
  {
    nudge: 'Read the story: are there one-off pages flooding in, or does what’s popular change over time?',
    concept: 'LRU is fooled by one-off floods (they all look “recent”). LFU is fooled by trends (yesterday’s favourites keep big counts).',
    show: 'The nightly report: pick <b>LFU</b>. Black Friday: pick <b>LRU</b>.',
    target: '[data-pol]',
  },
  {
    nudge: 'Watch the two boxes: when the database price changes, does the cache change too?',
    concept: 'The cache keeps the old price until something deletes it. Delete it right after each database change, before the next shopper reads.',
    show: 'Each time the database price turns different from the cache, click <b>Invalidate</b> straight away.',
    target: '#ch-inv',
  },
];
