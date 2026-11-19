/** Circuit Breaker: concept cards, hints and the opening incident. */
import { arrow, box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '13:22 · the whole shop is down · cause: the “recommended for you” service is slow · every page waits 5 s for it, and the threads ran out.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'One slow service can take everything down',
    frames: [
      {
        svg: svg(box(30, 70, 160, 70, 'shop page', { col: 'var(--ink)', sub: '20 threads' }) + arrow(194, 105, 336, 105, 'waits up to 5 s', 'red') + box(340, 70, 190, 70, 'recommendations', { col: 'var(--bad)', sub: 'down: never answers' }), 'The shop page waits on a broken service.'),
        html: '<p>Each page view uses a <b>thread</b> (a worker) while it waits for other services. If the recommendations service hangs, every page waits 5 s for it, each holding a thread. With only 20 threads, they all get stuck, and the <b>whole</b> shop goes down because of one optional feature.</p>',
      },
      {
        svg: svg(box(30, 70, 160, 70, 'shop page', { col: 'var(--ok)' }) + box(230, 70, 110, 70, 'breaker', { col: 'var(--bad)', sub: 'OPEN' }) + box(380, 70, 150, 70, 'recommendations', { col: 'var(--bad)' }) + text(280, 180, 'open: skip the call, hide the feature, keep the page up', { size: 13 }), 'An open breaker stops calls to the broken service.'),
        html: '<p>A <b>circuit breaker</b> sits in front of the call. When the service is failing, <b>open</b> it: stop calling, show the page without recommendations. Every now and then send one test call, a <b>probe</b>; when a probe succeeds, <b>close</b> the breaker again.</p>',
      },
    ],
    check: {
      q: 'Recommendations is down and threads are filling up. What should the breaker do?',
      options: ['Stay closed and keep waiting', 'Open: stop calling, hide the feature'],
      answer: 1,
      why: 'Losing one feature for a while is far better than losing the whole page.',
    },
  },
  null,
  {
    title: 'When should it trip?',
    frames: [
      {
        svg: svg(text(40, 60, 'one slow call now and then = a harmless blip', { anchor: 'start', size: 14 }) + text(40, 100, 'several failures in a row = a real outage', { anchor: 'start', size: 14, bold: true }) + text(40, 150, 'threshold too low: trips on blips · too high: trips after the page is down', { anchor: 'start', size: 13, col: 'var(--muted)' }), 'The failure threshold separates blips from outages.'),
        html: '<p>An automatic breaker opens after <b>N failures in a row</b> (failed, or slower than 500 ms). Too low, and one-off blips hide the feature for nothing. Too high, and threads are all stuck before it trips.</p>',
      },
    ],
  },
  {
    title: 'How often to probe?',
    frames: [
      {
        svg: svg(box(30, 60, 240, 70, 'probe every 1 s', { col: 'var(--bad)', sub: 'hammers a recovering service' }) + box(290, 60, 240, 70, 'probe every 30 s', { col: 'var(--bad)', sub: 'features stay off long after' }), 'Frequent probes add load; rare probes recover slowly.'),
        html: '<p>While open, the breaker probes. Probe too often and you load a service that is trying to recover. Probe too rarely and the feature stays hidden long after the service is back.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Watch the threads bar. When does it start filling up?',
    concept: 'Open as soon as calls start hanging; probe every few seconds; close when a probe succeeds.',
    show: 'Open the breaker when threads pass ~6, click Probe every 3–4 s, close it after a successful probe.',
    target: '#cb-switch',
  },
  {
    nudge: 'In the replay, where does the breaker open on blips, and where is the page down?',
    concept: 'A blip is one or two failures; an outage is many in a row. Pick a threshold in between.',
    show: 'Open after <b>5</b> failures.',
    target: '[data-th="5"]',
  },
  {
    nudge: 'Count the probes during the outage and how long recovery takes.',
    concept: 'Choose an interval that limits probes during the outage yet notices recovery quickly.',
    show: 'Probe every <b>5 s</b>.',
    target: '[data-probe="5"]',
  },
];
