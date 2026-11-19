/** The Ring: concept cards, hints and the opening incident. */
import { box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '21:15 · we added one cache server to handle the sale · cache hit rate fell from 92% to 8% · the database is melting.';

const ring = (cx: number, cy: number, r: number, pts: [number, string, string][]) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" style="fill:none;stroke:var(--line);stroke-width:2"/>` +
  pts.map(([pos, label, col]) => { const a = (pos / 100) * 2 * Math.PI - Math.PI / 2; const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); return `<circle cx="${x}" cy="${y}" r="9" style="fill:${col}"/>` + text(x + (Math.cos(a) >= 0 ? 16 : -16), y + 5, label, { size: 13, anchor: Math.cos(a) >= 0 ? 'start' : 'end' }); }).join('');

export const learn: (LearnCard | null)[] = [
  {
    title: 'Which server holds which key?',
    frames: [
      {
        svg: svg(
          box(30, 40, 140, 50, '“cart:ana”', { col: 'var(--ink)' }) + text(230, 70, 'hash →', { size: 14 }) + box(280, 40, 80, 50, '7', { col: 'var(--append)' }) + text(420, 70, '7 mod 3 = 1 → S1', { size: 15, bold: true }) +
            text(280, 150, 'a hash turns any key into a number; the same key always gives the same number', { size: 12.5, col: 'var(--muted)' }),
          'A key is hashed to a number, and the number picks a server.',
        ),
        html: '<p>A big cache or database is split across servers: each key lives on one of them. To find it again, everyone uses the same rule. A <b>hash</b> turns the key into a number (the same key always gives the same number), and <b>hash mod N</b> (the remainder after dividing by N servers) picks the server.</p>',
      },
    ],
    check: {
      q: 'There are 3 servers (S0, S1, S2). A key hashes to 11. Which server holds it?',
      options: ['S0', 'S1', 'S2'],
      answer: 2,
      why: '11 mod 3 = 2 (11 = 3 × 3 + 2), so S2.',
    },
  },
  null,
  {
    title: 'The hash ring',
    frames: [
      {
        svg: svg(ring(160, 110, 80, [[10, 'A (10)', 'var(--append)'], [45, 'B (45)', 'var(--ok)'], [80, 'C (80)', 'var(--vote)'], [30, 'key 30 → B', 'var(--ink)']]) + text(400, 90, 'each key goes to the next', { size: 14 }) + text(400, 115, 'server clockwise', { size: 14, bold: true }), 'Servers and keys sit on a ring; each key belongs to the next server clockwise.'),
        html: '<p>With mod N, adding one server changes N, so almost every key moves, and every moved key is a cache miss. <b>Consistent hashing</b> puts servers and keys on a <b>ring</b> of positions (here 0–99). A key belongs to the <b>next server clockwise</b> from its position. Add a server and only the keys just before it move.</p>',
      },
    ],
    check: {
      q: 'Servers at 10, 45 and 80. A key sits at 90. Which server owns it?',
      options: ['The one at 80', 'The one at 10 (wrapping past 99)', 'The one at 45'],
      answer: 1,
      why: 'Clockwise from 90 you pass 99, wrap to 0, and reach the server at 10.',
    },
  },
  {
    title: 'Virtual nodes',
    frames: [
      {
        svg: svg(ring(140, 110, 80, [[5, 'A', 'var(--append)'], [20, 'B', 'var(--ok)'], [30, 'C', 'var(--vote)']]) + text(140, 210, 'one point each: A owns 75% of the ring', { size: 12.5, col: 'var(--bad)' }) + ring(410, 110, 80, [[5, '', 'var(--append)'], [20, '', 'var(--ok)'], [30, '', 'var(--vote)'], [45, '', 'var(--append)'], [58, '', 'var(--vote)'], [70, '', 'var(--ok)'], [85, '', 'var(--append)'], [93, '', 'var(--vote)']]) + text(410, 210, 'many points each: shares even out', { size: 12.5, col: 'var(--ok)' }), 'With one point per server the ring is uneven; many virtual nodes even it out.'),
        html: '<p>With one point per server, the gaps between points are random, so one server can own a huge slice. <b>Virtual nodes</b> give each server many points around the ring; the random gaps average out and every server owns close to its fair share.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'For each key, take its hash and divide by 4. What is the remainder?',
    concept: 'hash mod 4 gives 0, 1, 2 or 3: that is the server number.',
    show: 'Click the server whose number equals the key’s hash mod 4.',
  },
  {
    nudge: 'From each key’s position, walk clockwise. Which server do you reach first?',
    concept: 'Only keys between C (at 45) and the new server D (at 62) now reach D first.',
    show: 'Place keys clockwise; then click only the keys between 45 and 62.',
  },
  {
    nudge: 'In the result, how far is the biggest share from a third?',
    concept: 'More points per server average out the random gaps.',
    show: 'Pick the largest number of virtual nodes, then Run.',
    target: '[data-vn="50"]',
  },
];
