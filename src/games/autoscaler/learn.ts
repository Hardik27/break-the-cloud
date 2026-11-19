/** Autoscaler: concept cards, hints and the opening incident. */
import { box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '07:55 · traffic grows 6× every morning · last Monday we were down for 11 minutes at 09:10 · finance wants the cloud bill cut.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Paying for exactly enough servers',
    frames: [
      {
        svg: svg(
          `<polyline points="30,180 120,170 200,140 280,90 360,50 440,40 530,45" style="fill:none;stroke:var(--bad);stroke-width:2.5"/>` +
            `<polyline points="30,150 200,150 200,110 360,110 360,60 530,60" style="fill:none;stroke:var(--ok);stroke-width:2.5"/>` +
            text(470, 30, 'traffic', { col: 'var(--bad)', size: 13 }) + text(470, 82, 'capacity', { col: 'var(--ok)', size: 13 }) + text(280, 210, 'capacity below traffic = errors · far above = wasted money', { size: 13 }),
          'Capacity should stay just above traffic.',
          220,
        ),
        html: '<p>In the cloud you rent servers (<b>instances</b>) by the minute. Too few, and when traffic grows the servers hit 100% CPU and users get errors. Too many, and you pay for machines doing nothing. <b>Scaling</b> means adding and removing instances as traffic changes.</p>',
      },
      {
        svg: svg(box(40, 70, 220, 70, 'add instance', { col: 'var(--append)', sub: 'ready in 3 minutes' }) + text(400, 100, 'add BEFORE you need it', { size: 15, bold: true }) + text(400, 125, 'boot time is the catch', { size: 13, col: 'var(--muted)' }), 'New instances take minutes to boot.'),
        html: '<p>The catch: a new instance takes a few minutes to <b>boot</b>. If you wait until CPU hits 100% to add one, users get errors until it is ready. Watch CPU: keep it under 100% and above about a third (otherwise you are paying for idle machines).</p>',
      },
    ],
    check: {
      q: 'CPU is at 85% and rising. New instances take 3 minutes to boot. When do you add one?',
      options: ['Now', 'When CPU reaches 100%'],
      answer: 0,
      why: 'At 100% users are already getting errors, and it will be 3 more minutes before help arrives.',
    },
  },
  null,
  {
    title: 'Target tracking',
    frames: [
      {
        svg: svg(box(40, 60, 210, 70, 'target CPU 50%', { col: 'var(--ok)', sub: 'lots of headroom, costly' }) + box(310, 60, 210, 70, 'target CPU 90%', { col: 'var(--bad)', sub: 'cheap, no room for spikes' }), 'A low target leaves headroom; a high target is cheap but fragile.'),
        html: '<p>An <b>autoscaler</b> does it for you: it adds or removes instances to keep average CPU near a <b>target</b>. A low target leaves <b>headroom</b> for spikes while new instances boot, but costs more. A high target is cheap until the first spike.</p>',
      },
    ],
  },
  {
    title: 'When you know a spike is coming',
    frames: [
      {
        svg: svg(`<polyline points="30,170 260,165 270,50 530,50" style="fill:none;stroke:var(--bad);stroke-width:2.5"/>` + text(270, 30, '12:00 flash sale: traffic ×3 in one minute', { size: 13, col: 'var(--bad)' }) + text(280, 200, 'no autoscaler reacts that fast: scale up before it starts', { size: 13 }), 'A flash sale triples traffic in one minute.'),
        html: '<p>No autoscaler can react to traffic tripling in one minute, because instances take minutes to boot. When you <i>know</i> a spike is coming (a sale, a launch), <b>pre-warm</b>: add capacity on a schedule just before it.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Watch the CPU gauge and the clock. Traffic only grows this morning.',
    concept: 'Add an instance when CPU passes about 70%: it will be ready before CPU reaches 100%.',
    show: 'Click Add instance whenever CPU goes above 70%; never remove one while traffic is still rising.',
  },
  {
    nudge: 'Compare the shaded (overloaded) minutes with the cost.',
    concept: 'You need enough headroom to survive while new instances boot, but not more.',
    show: 'Try a target of 60%.',
    target: '[data-target="60"]',
  },
  {
    nudge: 'The sale starts at 12:00 sharp. Can any target react in one minute?',
    concept: 'Known spikes need scheduled capacity: pre-warm before noon.',
    show: 'Turn on pre-warming for the sale and keep a 60% target.',
    target: '#as-pre',
  },
];
