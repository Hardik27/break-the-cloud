/** Heartbeat: concept cards, hints and the opening incident. */
import { arrow, box, server, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '03:47 · 1 in 5 checkout requests fail · web-3 stopped responding 4 minutes ago · the load balancer is still sending it traffic.';

const beats = (y: number, xs: number[], col = 'var(--ok)') => xs.map((x) => `<line x1="${x}" y1="${y - 12}" x2="${x}" y2="${y + 12}" style="stroke:${col};stroke-width:3"/>`).join('');
const lane = (y: number, name: string) => text(20, y + 5, name, { anchor: 'start', size: 13 }) + `<line x1="90" y1="${y}" x2="540" y2="${y}" style="stroke:var(--grid);stroke-width:2"/>`;

export const learn: (LearnCard | null)[] = [
  {
    title: 'How do you know a server is alive?',
    frames: [
      {
        svg: svg(
          server(90, 100, 'web-1') + box(330, 80, 200, 60, 'load balancer', { col: 'var(--append)', sub: 'sends users to servers' }) +
            arrow(118, 92, 324, 100, '“I’m alive” every 0.5 s', 'green'),
          'Each server sends an I am alive message to the load balancer every half second.',
          240,
        ),
        html: '<p>A <b>load balancer</b> sends users to your servers. It can’t see inside them. So every server sends a tiny “I’m alive” message every half second: a <b>heartbeat</b>.</p>',
      },
      {
        svg: svg(
          lane(70, 'web-1') + beats(70, [110, 160, 210, 260, 310, 360, 410, 460, 510]) +
            lane(150, 'web-2') + beats(150, [110, 160, 210, 260]) + text(400, 140, 'silence…', { col: 'var(--bad)', bold: true }) + text(400, 175, 'crashed? or just frozen?', { col: 'var(--muted)', size: 13 }),
          'web-1 beats steadily; web-2 stops beating.',
        ),
        html: '<p>When heartbeats stop, the server has either <b>crashed</b>, or it is <b>paused</b>: busy for a moment, like your laptop freezing for a second (servers do this during <b>garbage collection</b>, when they clean up memory). A paused server comes back. A crashed one never does.</p>',
      },
      {
        svg: svg(
          lane(70, 'paused') + beats(70, [110, 160, 210]) + `<rect x="230" y="56" width="120" height="28" rx="4" style="fill:var(--vote);opacity:.25"/>` + beats(70, [370, 420, 470, 520]) +
            lane(150, 'crashed') + beats(150, [110, 160, 210]) + `<line x1="230" y1="134" x2="230" y2="166" style="stroke:var(--bad);stroke-width:3"/>` +
            `<line x1="390" y1="40" x2="390" y2="180" style="stroke:var(--accent);stroke-width:2;stroke-dasharray:5 4"/>` + text(390, 200, 'timeout: wait this long before deciding', { col: 'var(--accent)', size: 13 }),
          'A timeout longer than the longest pause tells pauses and crashes apart.',
          215,
        ),
        html: '<p>From outside, the two look the same at first: silence. Your only tool is <b>time</b>. Pick a <b>timeout</b>: if a server is silent longer than that, call it dead and stop sending users there (<b>evict</b> it). Longer than any pause, but not so long that users keep hitting a dead server.</p>',
      },
    ],
    check: {
      q: 'A server has been silent for 1 second. Pauses in this cluster last up to 2 seconds. What do you do?',
      options: ['Evict it now', 'Wait: it could still be a pause'],
      answer: 1,
      why: 'One second of silence is still normal here. Only after the longest possible pause can you be confident it crashed.',
    },
  },
  null,
  {
    title: 'Let a machine do it',
    frames: [
      {
        svg: svg(
          box(30, 60, 220, 70, 'heartbeat every 0.5 s', { col: 'var(--ok)' }) + text(275, 100, '×', { size: 22, bold: true }) + box(300, 60, 230, 70, 'evict after 3 missed', { col: 'var(--bad)' }) +
            text(280, 180, 'timeout = 0.5 s × 3 = 1.5 s of silence', { size: 15, bold: true }),
          'The timeout is the heartbeat interval times the number of missed beats allowed.',
        ),
        html: '<p>An automatic <b>failure detector</b> uses two settings: how often servers send a heartbeat, and how many missed beats in a row mean “dead”. Multiply them to get the <b>timeout</b>.</p><p>Too short and it evicts healthy servers during pauses (<b>false evictions</b>). Too long and users hit a dead server for ages.</p>',
      },
    ],
    check: {
      q: 'Heartbeat every 1 s, evict after 2 missed. What is the timeout?',
      options: ['1 s', '2 s', '3 s'],
      answer: 1,
      why: '1 s × 2 missed beats = 2 s of silence before the server is evicted.',
    },
  },
  null,
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Read the “silent … of 2.5” text on each row. What happens to a paused server after a second or two?',
    concept: 'Pauses here end within 2 s. A server silent for longer than that is not coming back.',
    show: 'Wait until a row turns red (silent 2.5 s or more), then click it. When its replacement says ready, click it again.',
    target: '.hb-row.alarm',
  },
  {
    nudge: 'In the replay, look at the amber bands (pauses) and where the ✕ evictions land.',
    concept: 'The timeout (interval × missed beats) must be comfortably longer than the longest pause: 2.4 s, plus the wait for the next beat.',
    show: 'Heartbeat every <b>2 s</b>, evict after <b>2 missed</b> (a 4 s timeout).',
    target: '[data-int="2000"]',
  },
  {
    nudge: 'You need a timeout clearly above the 2.4 s pause, but short enough to catch the crash within 5 s.',
    concept: 'Which interval × missed beats lands around 4 s?',
    show: 'Heartbeat every <b>2 s</b> and evict after <b>2 missed</b>, or every 1 s and after 5 missed.',
    target: '[data-thr="2"]',
  },
];
