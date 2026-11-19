/** Retry Storm: concept cards, hints and the opening incident. */
import { arrow, box, person, server, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '02:03 · payments API restarted after a 30 s blip · it has been trying to start for 20 minutes · traffic is 9× normal, all retries.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Try again… and again… and again',
    frames: [
      {
        svg: svg(person(70, 110, 'app') + server(470, 105, 'API (down)', { state: 'bad' }) + arrow(100, 80, 440, 90, 'request', 'red') + arrow(100, 110, 440, 110, 'retry', 'red') + arrow(100, 140, 440, 130, 'retry', 'red'), 'An app retries a failed request immediately.'),
        html: '<p>When a request fails, the natural thing is to <b>retry</b>. One app retrying once is harmless. Thousands of apps retrying immediately and repeatedly turn a short outage into a flood: the API gets far more traffic exactly when it is weakest. That is a <b>retry storm</b>.</p>',
      },
      {
        svg: svg(text(40, 60, 'wait 0.5 s → 1 s → 2 s → 4 s …', { anchor: 'start', size: 16, bold: true }) + text(40, 100, 'each failed try doubles the wait: exponential backoff', { anchor: 'start', size: 14 }) + text(40, 150, 'later: add a random amount (jitter) so clients don’t retry in step', { anchor: 'start', size: 13, col: 'var(--muted)' }), 'Exponential backoff doubles the wait after each failure.'),
        html: '<p>The cure is <b>backoff</b>: wait before retrying, and wait longer each time it fails (0.5 s, 1 s, 2 s, 4 s…: <b>exponential backoff</b>). First, pace retries by hand into an API that is slowly recovering.</p>',
      },
    ],
    check: {
      q: 'An API can handle 1 request a second while it recovers. You have 12 retries to send. What works best?',
      options: ['Send all 12 now', 'Send about one a second, more as it recovers', 'Never retry'],
      answer: 1,
      why: 'Match your retries to what the API can take right now. Flooding it keeps it down longer.',
    },
  },
  null,
  {
    title: 'Retry policies',
    frames: [
      {
        svg: svg(box(20, 50, 160, 70, 'immediate', { col: 'var(--bad)', sub: 'retry at once' }) + box(200, 50, 160, 70, 'fixed delay', { col: 'var(--vote)', sub: 'wait 1 s each time' }) + box(380, 50, 160, 70, 'exponential', { col: 'var(--ok)', sub: 'wait 0.5, 1, 2, 4 s…' }), 'Three retry policies.'),
        html: '<p>Every client runs the same <b>retry policy</b>. Immediate and fixed-delay retries keep the pressure constant. <b>Exponential</b> backoff backs off fast, so the total load falls while the API is down.</p>',
      },
    ],
  },
  {
    title: 'Waves',
    frames: [
      {
        svg: svg(text(30, 50, 'everyone failed at 12:00:00.0 → everyone retries at :00.5, :01.5, :03.5…', { anchor: 'start', size: 13 }) + [70, 140, 280].map((x) => `<rect x="${x}" y="80" width="14" height="90" style="fill:var(--bad)"/>`).join('') + text(380, 130, 'jitter: wait a random part of it', { size: 14, bold: true }) + text(380, 155, 'retries spread out', { size: 13, col: 'var(--ok)' }), 'Clients that fail together retry together, in waves.'),
        html: '<p>Even with backoff, clients that failed at the same moment retry at the same moments: synchronized <b>waves</b> that knock the API over again as it recovers. <b>Jitter</b> makes each client wait a random part of its backoff, spreading the retries out.</p>',
      },
    ],
    check: {
      q: '10,000 clients failed in the same second, all using exponential backoff. What does jitter fix?',
      options: ['They retry too often', 'They all retry at the same instant'],
      answer: 1,
      why: 'Backoff controls how often; jitter breaks up the lockstep so they don’t arrive together.',
    },
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Watch the capacity line: how many requests per second can the API take right now?',
    concept: 'Send retries at about the rate the API can handle, and speed up as it recovers.',
    show: 'Click Send roughly once per second at first, a little faster as capacity grows.',
  },
  {
    nudge: 'In the replay, compare the bars during the outage with the dashed capacity line.',
    concept: 'Waiting longer after each failure lets the load drop while the API is down.',
    show: 'Pick <b>exponential</b> backoff.',
    target: '[data-policy="exponential"]',
  },
  {
    nudge: 'In the replay, look at the spikes right after the API recovers.',
    concept: 'Clients that failed together retry together. Randomness breaks the rhythm.',
    show: 'Pick exponential backoff <b>and</b> turn on jitter.',
    target: '#rs-jitter',
  },
];
