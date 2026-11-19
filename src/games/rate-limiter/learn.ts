/** Rate Limiter: concept cards, hints and the opening incident. */
import { arrow, box, dot, person, server, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '14:32 · API error rate 38% · one IP address is sending 900 requests a minute · paying customers are getting timeouts.';

const bucket = (x: number, y: number, tokens: number, cap: number, label: string) =>
  `<path d="M${x} ${y} l12 90 h56 l12 -90" style="fill:none;stroke:var(--vote);stroke-width:2.2"/>` +
  Array.from({ length: tokens }, (_, i) => dot(x + 22 + (i % 3) * 18, y + 78 - Math.floor(i / 3) * 18, 'var(--vote)', 7)).join('') +
  text(x + 40, y + 112, label, { size: 13 }) + text(x + 40, y - 10, `holds ${cap}`, { size: 12, col: 'var(--muted)' });

export const learn: (LearnCard | null)[] = [
  {
    title: 'Too many requests',
    frames: [
      {
        svg: svg(
          person(60, 70, 'Ana') + person(60, 160, 'Ben') + `<g>${person(170, 115, 'bot')}</g>` +
            server(470, 110, 'API: 5 per second') +
            arrow(90, 70, 430, 100, '', 'green') + arrow(90, 160, 430, 120, '', 'green') +
            [0, 1, 2, 3, 4, 5].map((k) => arrow(200, 105 + k * 3 - 8, 430, 108 + k * 2, '', 'red')).join(''),
          'Two people and a bot send requests to an API that can handle 5 per second.',
        ),
        html: '<p>An <b>API</b> is the door your app’s data goes through. Every server can answer only so many requests a second. Here: <b>5</b>. If one client (a buggy script, a scraper, an attacker) sends far more, the server slows down for <b>everyone</b>.</p>',
      },
      {
        svg: svg(
          person(60, 110, 'bot') + server(470, 110, 'API') + box(230, 85, 110, 50, '429', { col: 'var(--bad)', sub: 'Too Many Requests' }) +
            arrow(90, 110, 224, 110, '', 'red') + arrow(346, 110, 440, 110, 'blocked', 'muted', true),
          'Requests over the limit get the HTTP answer 429 Too Many Requests.',
        ),
        html: '<p>A <b>rate limiter</b> stands at the door and turns away requests over a limit with the answer <b>429 Too Many Requests</b>. The client should slow down and try later. First you will do this by hand.</p>',
      },
    ],
    check: {
      q: 'The API can take 5 requests a second. A bot sends 50 a second. Without a limit, who suffers?',
      options: ['Only the bot', 'Everyone using the API', 'Nobody, servers queue forever'],
      answer: 1,
      why: 'The server’s capacity is shared. If one client takes it all, real people’s requests wait or fail too.',
    },
  },
  null,
  {
    title: 'The token bucket',
    frames: [
      {
        svg: svg(bucket(60, 50, 6, 6, 'full: 6 tokens') + arrow(170, 100, 260, 100, '6 requests at once', 'green') + bucket(290, 50, 0, 6, 'empty: next one waits') + text(460, 105, 'all 6 pass ✓', { col: 'var(--ok)', bold: true }), 'A full bucket of 6 tokens lets a burst of 6 requests through at once.'),
        html: '<p>Each client gets a <b>bucket of tokens</b>. Every request spends one token. No token, no entry: <b>429</b>. The most tokens the bucket can hold is its <b>burst</b>: how many requests can go through <i>at once</i>.</p>',
      },
      {
        svg: svg(bucket(60, 50, 1, 6, 'empty bucket') + `<path d="M100 18 v24" style="stroke:var(--vote);stroke-width:2;stroke-dasharray:3 3"/>` + text(100, 14, '+2 tokens every second', { col: 'var(--vote)', size: 13 }) + text(360, 90, 'rate = how fast tokens drip back in', { size: 14, bold: true }) + text(360, 120, 'a steady sender only gets “rate” per second', { size: 13, col: 'var(--muted)' }), 'Tokens drip back into the bucket at a fixed rate.'),
        html: '<p>Tokens drip back in at a steady <b>rate</b>, say 2 per second. So a client can <b>burst</b> briefly, but over time it gets only <b>rate</b> requests a second, however hard it pushes.</p><p>People load a page in bursts and then read it. Bots hammer non-stop. A good bucket lets bursts through and keeps the steady flood down.</p>',
      },
    ],
    check: {
      q: 'A page load sends 6 requests at once. What must be at least 6?',
      options: ['The rate', 'The burst (bucket size)', 'Both'],
      answer: 1,
      why: 'Six requests arrive at the same instant, so the bucket must already hold 6 tokens. The rate only needs to refill it before the next page load.',
    },
  },
  {
    title: 'One bucket, or one each?',
    frames: [
      {
        svg: svg(
          box(30, 30, 160, 50, 'Acme (paid)', { col: 'var(--ok)' }) + box(30, 90, 160, 50, 'Globex (paid)', { col: 'var(--ok)' }) + box(30, 150, 160, 50, 'Freebie: 30/s', { col: 'var(--bad)' }) +
            box(330, 70, 200, 90, 'one shared bucket', { col: 'var(--vote)', sub: 'whoever sends most wins' }) +
            arrow(192, 55, 324, 100, '', 'muted') + arrow(192, 115, 324, 115, '', 'muted') + arrow(192, 175, 324, 135, '', 'red'),
          'With one shared bucket, the noisiest tenant uses up everyone’s tokens.',
        ),
        html: '<p>Your API now serves companies, called <b>tenants</b>. Some pay, some use the free tier. A limit can be <b>shared</b> (one bucket for everyone) or <b>per tenant</b> (one bucket each). And different tiers can get different rates.</p>',
      },
    ],
    check: {
      q: 'One tenant runs a huge batch job. With a single shared bucket, what happens to the others?',
      options: ['Nothing changes for them', 'They run out of tokens too'],
      answer: 1,
      why: 'A shared bucket is drained by whoever sends the most, so a noisy neighbour hurts everyone.',
    },
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Only the red BOT requests should be blocked. Watch the right-hand side: the API box turns red when it is full.',
    concept: 'Every bot you stop leaves room for a real request. Block bots early, before they get close to the API.',
    show: 'Tap each red <b>BOT</b> request as soon as it appears. Ignore green and grey.',
  },
  {
    nudge: 'In the replay, watch Ana’s orange bucket bar when her 6 requests arrive together.',
    concept: 'Burst must be at least 6, so a whole page load fits. Then the rate must refill 6 tokens in 3 s (2 a second). A lower rate also caps the bot.',
    show: 'Pick rate <b>2/s</b> and burst <b>6</b>.',
    target: '[data-rate="2"]',
  },
  {
    nudge: 'In the replay, compare the paying tenants’ squares with one shared bucket and with one bucket each.',
    concept: 'Give each tenant its own bucket so Freebie only drains its own. Then keep the total of all tiers under the API’s 20 a second.',
    show: 'Limit per <b>Each tenant</b>, paid <b>5/s</b>, free <b>2/s</b>.',
    target: '[data-scope="client"]',
  },
];
