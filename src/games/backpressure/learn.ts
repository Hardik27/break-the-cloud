/** Backpressure: concept cards, hints and the opening incident. */
import { arrow, box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '18:40 · 120 orders stuck in the queue · customers emailing “where is my order?” · one consumer keeps crashing and restarting.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'A queue between the shop and the kitchen',
    frames: [
      {
        svg: svg(
          box(20, 80, 110, 50, 'checkout', { col: 'var(--ink)' }) + arrow(134, 105, 176, 105, '', 'muted') +
            Array.from({ length: 6 }, (_, i) => `<rect x="${182 + i * 26}" y="88" width="20" height="34" rx="3" style="fill:var(--append)"/>`).join('') + text(255, 70, 'queue', { size: 13 }) +
            arrow(342, 105, 384, 105, '', 'muted') + box(390, 60, 150, 40, 'consumer 1', { col: 'var(--ok)', size: 14 }) + box(390, 110, 150, 40, 'consumer 2', { col: 'var(--ok)', size: 14 }),
          'Orders wait in a queue until a consumer takes them.',
        ),
        html: '<p>When you check out, the shop doesn’t process your order on the spot. It drops a <b>message</b> into a <b>queue</b>, and worker programs called <b>consumers</b> take messages off the front, one by one. If orders arrive faster than consumers finish, the queue grows: a <b>backlog</b>.</p>',
      },
      {
        svg: svg(box(40, 60, 200, 70, 'more consumers', { col: 'var(--ok)', sub: 'drain faster' }) + box(320, 60, 200, 70, 'database', { col: 'var(--bad)', sub: 'every consumer uses it' }) + text(280, 180, 'too many consumers overload what they all depend on', { size: 13 }), 'More consumers drain faster but load the database.'),
        html: '<p>More consumers drain the backlog faster, but every consumer talks to the same database. Too many overload it. And once the queue is empty, extra consumers just cost money. Matching consumers to what downstream can take is called <b>backpressure</b>.</p>',
      },
    ],
    check: {
      q: '10 orders arrive per second; each consumer handles 4 per second. How many consumers just to keep up?',
      options: ['2', '3', '10'],
      answer: 1,
      why: '3 × 4 = 12 per second, just above 10. Two would fall behind (8 per second).',
    },
  },
  null,
  {
    title: 'The poison message',
    frames: [
      {
        svg: svg(Array.from({ length: 5 }, (_, i) => `<rect x="${60 + i * 50}" y="70" width="40" height="50" rx="4" style="fill:${i === 0 ? 'var(--bad)' : 'var(--append)'}"/>`).join('') + text(80, 150, 'broken order: crashes the consumer, goes back to the front', { size: 13, anchor: 'start' }) + box(400, 60, 140, 60, 'DLQ', { col: 'var(--vote)', sub: 'set aside' }), 'A broken message at the front blocks the queue.'),
        html: '<p>Some messages are broken: processing them always crashes the consumer. The message goes back to the front of the queue, crashes the next consumer, and blocks everything behind it. That is a <b>poison message</b>. Fix: move it to a <b>dead-letter queue</b> (DLQ) so a human can look at it later.</p>',
      },
    ],
  },
  {
    title: 'How many tries?',
    frames: [
      {
        svg: svg(box(30, 50, 240, 70, '1 try', { col: 'var(--bad)', sub: 'a one-off blip loses a good order' }) + box(290, 50, 240, 70, '20 tries', { col: 'var(--bad)', sub: 'poison crashes 20 times' }), 'Too few tries lose good orders; too many let poison crash consumers.'),
        html: '<p>Queues can dead-letter automatically: after <b>N</b> failed tries, the message moves to the DLQ. Too few tries and a good order that hit a brief network blip is given up on. Too many and each poison message crashes consumers over and over.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Compare how many orders arrive per second with what your consumers handle.',
    concept: 'Add consumers until the queue shrinks, but stay under the database limit; scale down once it is empty.',
    show: 'Add consumers up to the limit, wait for the queue to empty, then remove them down to the settled number.',
  },
  {
    nudge: 'Watch the order at the front. Does it keep coming back?',
    concept: 'A message that keeps crashing the consumer is poison. Good orders belong in the queue.',
    show: 'Click only the orders marked broken to move them to the DLQ.',
  },
  {
    nudge: 'Good orders fail at most once or twice (a blip). Poison fails every time.',
    concept: 'Allow enough tries to survive a blip, and no more.',
    show: 'Pick 3 tries.',
    target: '[data-maxr="3"]',
  },
];
