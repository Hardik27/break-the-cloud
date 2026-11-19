/** Blast Radius: concept cards, hints and the opening incident. */
import { box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '17:30 · power failure in one data center of our cloud region · 40% of our servers just disappeared · lunch rush in 7 minutes.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Zones and regions',
    frames: [
      {
        svg: svg(box(20, 30, 520, 160, '', { col: 'var(--line)' }) + text(40, 55, 'region: Mumbai', { anchor: 'start', size: 14, bold: true }) + ['zone a', 'zone b', 'zone c'].map((z, i) => box(50 + i * 165, 75, 140, 90, z, { col: 'var(--append)', sub: 'own power & network' })).join(''), 'A region contains several independent zones.'),
        html: '<p>A cloud <b>region</b> (say, Mumbai) is made of several <b>availability zones</b>: separate data centers a few km apart, each with its own power and network. A fire or power cut takes out one zone, not the others.</p>',
      },
      {
        svg: svg(box(40, 60, 220, 80, 'all in zone a', { col: 'var(--bad)', sub: 'zone fails → everything fails' }) + box(300, 60, 220, 80, 'spread a / b / c', { col: 'var(--ok)', sub: 'zone fails → two thirds left' }), 'Spreading across zones limits what one failure takes down.'),
        html: '<p>How much one failure takes down is its <b>blast radius</b>. Put every server in one zone and a single power cut is a total outage. Spread servers and database copies across zones so that losing any one leaves enough to run.</p>',
      },
    ],
    check: {
      q: 'You need 4 web servers running at all times, across 3 zones. Any one zone can fail. How many web servers do you need in total?',
      options: ['4', '6', '12'],
      answer: 1,
      why: 'Two per zone: losing any zone leaves 4. Spreading cleverly costs less than duplicating everything.',
    },
  },
  {
    title: 'Placement',
    frames: [{ html: '<p>Click a cell to move a server or database copy into that zone. Then press <b>Test zone failure</b>: it knocks out each zone in turn and checks what is left.</p>' }],
  },
  {
    title: 'Losing a zone, live',
    frames: [
      {
        svg: svg(box(40, 60, 220, 80, 'primary DB', { col: 'var(--bad)', sub: 'in the failed zone' }) + box(300, 60, 220, 80, 'replica DB', { col: 'var(--ok)', sub: 'promote it → new primary' }), 'Promote a database replica when the primary is lost.'),
        html: '<p>When a zone dies, two things need you: the database <b>primary</b> (the copy that accepts writes) may be gone, so <b>promote</b> a replica to take over; and the surviving web servers get all the traffic, so add capacity before the lunch rush.</p>',
      },
    ],
  },
  {
    title: 'Losing a whole region',
    frames: [
      {
        svg: svg(box(30, 40, 240, 60, 'RPO', { col: 'var(--append)', sub: 'how much data you can lose' }) + box(290, 40, 240, 60, 'RTO', { col: 'var(--append)', sub: 'how long you can be down' }) + text(280, 150, 'sync copy: no loss, slower writes · async: seconds of loss · backup: hours', { size: 12.5 }) + text(280, 180, 'hot standby: instant, pricey · warm: minutes · cold: hours', { size: 12.5 }), 'RPO and RTO trade-offs.'),
        html: '<p>For a whole region, plan in two numbers. <b>RPO</b> (recovery point objective): how much recent data you may lose. <b>RTO</b> (recovery time objective): how long you may be down. Copies and standbys trade these against cost and write speed.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Press Test zone failure: which zone’s loss causes an outage, and why?',
    concept: 'After losing any one zone you still need 4 web servers and 1 database copy.',
    show: 'Put 2 web servers in each zone and a database copy in at least two zones.',
  },
  {
    nudge: 'Read the writes counter: are writes failing?',
    concept: 'Promote the surviving replica so writes work again, then add web servers before lunch.',
    show: 'Click Promote, then add web servers in the zones that are still up.',
    target: '#br-promote',
  },
  {
    nudge: 'Read each goal: data loss, downtime, write delay, budget.',
    concept: 'Async copies lose only seconds without slowing writes; a warm standby is fast to promote and affordable.',
    show: 'Replication <b>async</b>, standby <b>warm</b>.',
    target: '[data-repl="async"]',
  },
];
