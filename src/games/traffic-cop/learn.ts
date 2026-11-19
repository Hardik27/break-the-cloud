/** Traffic Cop: concept cards, hints and the opening incident. */
import { arrow, box, person, server, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '19:58 · a concert ticket sale opens in 2 minutes · traffic expected at 10× normal · three web servers, one load balancer: you.';

const units = (x: number, y: number, used: number) => Array.from({ length: 4 }, (_, i) => `<rect x="${x + i * 16}" y="${y}" width="13" height="13" rx="2" style="fill:${i < used ? 'var(--append)' : 'none'};stroke:var(--append)"/>`).join('');

export const learn: (LearnCard | null)[] = [
  {
    title: 'One door, many servers',
    frames: [
      {
        svg: svg(
          person(50, 110, 'users') + box(150, 85, 120, 50, 'load balancer', { col: 'var(--accent)', size: 14 }) +
            server(420, 50, 'web-1') + server(420, 130, 'web-2') + server(420, 210, 'web-3').replace(/y="(2\d\d)"/g, 'y="$1"') +
            arrow(80, 110, 144, 110, '', 'muted') + arrow(272, 100, 392, 50, '', 'blue') + arrow(272, 110, 392, 128, '', 'blue'),
          'A load balancer spreads requests across several servers.',
          260,
        ),
        html: '<p>One server can only handle so many requests at once. So sites run several, and put a <b>load balancer</b> in front: every request goes to it first, and it picks a server. Today, that picking is your job.</p>',
      },
      {
        svg: svg(
          text(60, 50, 'web-1', { anchor: 'start', size: 14 }) + units(140, 40, 3) + text(230, 50, '1 unit free', { anchor: 'start', size: 13 }) +
            text(60, 100, 'web-2', { anchor: 'start', size: 14 }) + units(140, 90, 0) + text(230, 100, '4 units free', { anchor: 'start', size: 13, col: 'var(--ok)' }) +
            text(60, 160, 'light request: 1 unit · heavy request (orange): 3 units', { anchor: 'start', size: 14, bold: true }) +
            text(60, 190, 'a full server drops the request: the user sees an error', { anchor: 'start', size: 13, col: 'var(--bad)' }),
          'Each server has 4 units of capacity; light requests need 1 unit, heavy ones need 3.',
        ),
        html: '<p>Each server here has <b>4 units</b> of capacity. A normal request takes 1 unit while it runs; a <b>heavy</b> one (orange) takes 3. Send a request to a server without enough free units and it is <b>dropped</b>.</p>',
      },
    ],
    check: {
      q: 'web-1 has 1 unit free, web-2 has 4. A heavy request (needs 3) arrives. Where does it go?',
      options: ['web-1', 'web-2', 'Either'],
      answer: 1,
      why: 'Only web-2 has 3 free units. Sending it to web-1 would drop it.',
    },
  },
  null,
  {
    title: 'Round robin, and dead servers',
    frames: [
      {
        svg: svg(box(40, 40, 140, 44, 'web-1', { col: 'var(--ok)' }) + box(210, 40, 140, 44, 'web-2', { col: 'var(--bad)', sub: 'crashed' }) + box(380, 40, 140, 44, 'web-3', { col: 'var(--ok)' }) + text(280, 140, 'round robin: 1, 2, 3, 1, 2, 3… even to the dead one', { size: 14 }), 'Round robin sends requests to each server in turn, even a crashed one.'),
        html: '<p>Clicking for every request doesn’t scale, so balancers have rules. <b>Round robin</b> simply takes turns: web-1, web-2, web-3, again and again. But it is blind: if a server crashes, it keeps sending users there. A <b>health check</b> takes a dead server <b>out of rotation</b> and puts it back when it recovers. That will be you.</p>',
      },
    ],
  },
  {
    title: 'Taking turns is not the same as being fair',
    frames: [
      {
        svg: svg(text(60, 60, 'round robin: next in turn, however busy', { anchor: 'start', size: 14 }) + text(60, 100, 'least loaded: the server with the most free units', { anchor: 'start', size: 14, col: 'var(--ok)', bold: true }) + text(60, 160, 'heavy requests break round robin: the next in turn may be full', { anchor: 'start', size: 13, col: 'var(--bad)' }), 'Round robin ignores load; least-loaded picks the server with most room.'),
        html: '<p>Round robin ignores how busy each server is. When heavy requests arrive, the next server in turn may not have room. <b>Least loaded</b> (or least connections) sends each request to the server with the most free capacity. Beat round robin by hand.</p>',
      },
    ],
  },
  {
    title: 'Pick your algorithm',
    frames: [
      {
        svg: svg(box(30, 50, 160, 70, 'round robin', { col: 'var(--line)', sub: 'simple, blind' }) + box(200, 50, 160, 70, 'random', { col: 'var(--line)', sub: 'simple, uneven' }) + box(370, 50, 160, 70, 'least loaded', { col: 'var(--ok)', sub: 'needs live load' }), 'Three balancing algorithms.'),
        html: '<p>Full traffic, heavy requests, and something will crash. Choose the algorithm, and keep doing the health checks yourself.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Look at the bars on each server: how many units are free?',
    concept: 'Send each request where it fits. Heavy ones need 3 free units.',
    show: 'Always click the server with the most free units.',
    target: '[data-srv]',
  },
  {
    nudge: 'Watch for a server turning red: it crashed.',
    concept: 'A crashed server must leave the rotation, and come back when it recovers.',
    show: 'Click a crashed server to pull it out; click it again when it says it recovered.',
    target: '[data-srv]',
  },
  {
    nudge: 'When round robin pauses on a heavy request, look at where it wants to send it.',
    concept: 'If the next server in turn doesn’t have 3 free units, pick one that does.',
    show: 'Click a server with 3 or more free units before the bar runs out.',
  },
  {
    nudge: 'Which algorithm looks at how busy the servers are?',
    concept: 'Least loaded handles heavy requests. A crash still needs a health check.',
    show: 'Pick <b>least loaded</b>, then pull the crashed server out and put it back when it recovers.',
  },
];
