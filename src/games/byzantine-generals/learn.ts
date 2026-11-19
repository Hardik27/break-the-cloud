/** Byzantine Generals: concept cards, hints and the opening incident. */
import { arrow, box, person, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = 'Security review · “What if one of our servers is hacked and starts lying to the others?” · crash-safe isn’t enough any more.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'When some nodes lie',
    frames: [
      {
        svg: svg(person(280, 50, 'commander') + person(110, 180, 'L1') + person(450, 180, 'L2') + arrow(260, 70, 130, 150, 'attack!', 'green') + arrow(300, 70, 430, 150, 'retreat!', 'red') + text(280, 215, 'a traitor tells different people different things', { size: 13, col: 'var(--bad)' }), 'A traitorous commander gives different orders.'),
        html: '<p>Generals surround a city. They must all attack or all retreat; half an army attacking alone is a disaster. They talk only by messenger, and some are <b>traitors</b> who lie, and lie <i>differently</i> to different generals. Computers can fail like this too (bugs, hacks): a <b>Byzantine fault</b>.</p>',
      },
      {
        svg: svg(person(110, 110, 'L1') + text(110, 40, 'heard from C: attack', { size: 13 }) + text(110, 190, 'L2 says C said: retreat', { size: 13 }) + text(400, 110, 'who is lying? C or L2?', { size: 15, bold: true, col: 'var(--vote)' }), 'A lieutenant cannot tell which other general is lying.'),
        html: '<p>Lieutenants compare notes: “the commander told me X.” But with just 3 generals, a lieutenant who hears “attack” from the commander and “retreat” from the other lieutenant can’t tell which one lied. First you play the traitor and exploit that.</p>',
      },
    ],
  },
  null,
  {
    title: 'Majority beats one liar',
    frames: [
      {
        svg: svg(box(30, 60, 150, 60, 'C: attack', { col: 'var(--ok)' }) + box(205, 60, 150, 60, 'L2: attack', { col: 'var(--ok)' }) + box(380, 60, 150, 60, 'L3: retreat', { col: 'var(--bad)' }) + text(280, 170, 'majority of 3 reports: attack', { size: 15, bold: true }), 'With three reports, one lie is outvoted.'),
        html: '<p>With 4 generals, each lieutenant hears 3 reports: the commander’s order, plus what each other lieutenant was told. One traitor can spoil only one report, so taking the <b>majority</b> gives every loyal lieutenant the same answer.</p>',
      },
    ],
    check: {
      q: 'You hear: attack (commander), retreat (L2), attack (L3). One of them may be a traitor. What do you do?',
      options: ['Attack', 'Retreat'],
      answer: 0,
      why: 'Two of three say attack. One liar can’t outvote two honest reports.',
    },
  },
  {
    title: 'How many liars can you survive?',
    frames: [{ html: '<p>The rule you are about to find: with <b>f</b> traitors you need at least <b>3f + 1</b> generals. Make some of the 7 generals traitors and run it to see where agreement breaks.</p>' }],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Read the loyal generals’ rule above the buttons. What message makes them act differently?',
    concept: 'As commander, give each lieutenant a different order. As lieutenant, tell L1 the opposite of what the commander said.',
    show: 'Commander: attack to L1, retreat to L2. Lieutenant: relay the opposite of the real order.',
  },
  {
    nudge: 'Click Hear the others first, then count the reports.',
    concept: 'Go with the majority of the three reports.',
    show: 'Pick whichever word appears at least twice.',
    target: '#bz-relay',
  },
  {
    nudge: 'Run with 2 traitors, then with 3.',
    concept: 'Agreement holds while N ≥ 3f + 1.',
    show: '7 generals survive at most 2 traitors; 3 traitors need 10 generals.',
  },
];
