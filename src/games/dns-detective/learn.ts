/** DNS Detective: concept cards, hints and the opening incident. */
import { arrow, box, person, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '08:12 · ops moved api.shop.com to a new server last night · some customers still reach the old one, which is switched off.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Names to numbers',
    frames: [
      {
        svg: svg(
          person(70, 110, 'you type') + box(150, 85, 170, 50, 'api.shop.com', { col: 'var(--ink)' }) + arrow(326, 110, 384, 110, 'DNS', 'blue') + box(390, 85, 150, 50, '203.0.113.7', { col: 'var(--append)', sub: 'IP address' }),
          'DNS turns a name like api.shop.com into an IP address.',
        ),
        html: '<p>Computers find each other by number: an <b>IP address</b> like 203.0.113.7. People use names. <b>DNS</b> (the Domain Name System) is the internet’s phone book: it turns a name into an address.</p>',
      },
      {
        svg: svg(
          box(30, 90, 110, 46, 'Resolver', { col: 'var(--accent)', sub: 'asks for you' }) +
            box(200, 20, 120, 40, 'Root', { col: 'var(--ink)', size: 14 }) + box(200, 90, 120, 40, '.com', { col: 'var(--ink)', size: 14 }) + box(200, 160, 120, 40, 'ns1.shop.com', { col: 'var(--ok)', size: 13 }) +
            arrow(142, 100, 196, 44, '1', 'muted') + arrow(142, 112, 196, 110, '2', 'muted') + arrow(142, 124, 196, 176, '3', 'muted') +
            text(440, 40, '“ask .com”', { size: 13 }) + text(440, 110, '“ask ns1.shop.com”', { size: 13 }) + text(440, 180, '“203.0.113.7”', { size: 13, col: 'var(--ok)', bold: true }),
          'The resolver asks the root, then .com, then the name’s own server.',
        ),
        html: '<p>No single server holds the whole book. It is a tree. Your <b>resolver</b> asks the <b>root</b> (“who handles .com?”), then the <b>.com</b> servers (“who handles shop.com?”), then shop.com’s own server, which gives the actual address. Each answer points to the next server to ask.</p>',
      },
    ],
    check: {
      q: 'Which server actually knows the address of api.shop.com?',
      options: ['The root server', 'The .com server', 'ns1.shop.com, shop.com’s own server'],
      answer: 2,
      why: 'Root and .com only point the way. The name’s own (authoritative) server holds the record.',
    },
  },
  null,
  {
    title: 'Remember the answer',
    frames: [
      {
        svg: svg(box(40, 70, 200, 70, 'resolver cache', { col: 'var(--ok)', sub: 'api.shop.com → 203.0.113.7' }) + text(390, 95, 'asked again?', { size: 14 }) + text(390, 125, 'answer at once, no tree walk', { size: 14, col: 'var(--ok)', bold: true }), 'The resolver caches answers.'),
        html: '<p>Walking the tree costs several round trips. So the resolver <b>caches</b> each answer for a while. Ask for the same name again and it answers straight away.</p>',
      },
    ],
  },
  {
    title: 'When the answer changes',
    frames: [
      {
        svg: svg(box(30, 60, 220, 70, 'cache: old address', { col: 'var(--bad)', sub: 'saved an hour ago' }) + box(310, 60, 220, 70, 'ns1.shop.com: new address', { col: 'var(--ok)', sub: 'changed 10 min ago' }), 'The cached answer is older than the change.'),
        html: '<p>A cached answer doesn’t update itself. If the record changed after it was cached, the resolver keeps handing out the <b>old</b> address until the cached copy expires. Check how old a cached answer is before trusting it.</p>',
      },
    ],
  },
  {
    title: 'TTL: how long to trust an answer',
    frames: [
      {
        svg: svg(
          box(30, 40, 240, 60, 'short TTL (60 s)', { col: 'var(--append)', sub: 'fresh, but more lookups' }) + box(290, 40, 240, 60, 'long TTL (1 day)', { col: 'var(--vote)', sub: 'fast, but stale after a move' }) +
            text(280, 160, 'Records that rarely change → long. Records you may move soon → short.', { size: 13 }),
          'Short TTLs stay fresh but cost lookups; long TTLs are fast but stay stale longer.',
        ),
        html: '<p>Every record carries a <b>TTL</b> (time to live): how long resolvers may reuse it. Short TTL: changes reach everyone fast, but every resolver asks again and again. Long TTL: few lookups, but a change takes that long to reach everyone.</p>',
      },
    ],
    check: {
      q: 'You will move a server to a new address tomorrow. What TTL should its record have today?',
      options: ['Short, so the change spreads fast', 'Long, to save lookups'],
      answer: 0,
      why: 'Lower the TTL before a planned move; raise it again afterwards.',
    },
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Read the last line of the log: each server tells you exactly who to ask next.',
    concept: 'The order is always resolver → root → the TLD (.com, .org…) → the name’s own server.',
    show: 'Click Resolver, Root, the TLD the log names, then the server the TLD names.',
  },
  {
    nudge: 'Look at the cache list before walking the tree.',
    concept: 'If the name is already cached and still fresh, the resolver can answer straight away.',
    show: 'For a name already in the cache, click <b>Answer from cache</b>.',
  },
  {
    nudge: 'Compare when api.shop.com was cached with when it moved.',
    concept: 'An answer cached before the move is stale. Walk the tree to get the new address.',
    show: 'For api.shop.com, don’t use the cache: walk the tree again.',
  },
  {
    nudge: 'Think about each record: how often does it change?',
    concept: 'Short TTL for anything that may move soon; long TTL for things that never change.',
    show: 'Short TTL for the record being moved, long for the stable one.',
  },
];
