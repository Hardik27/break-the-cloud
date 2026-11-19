/** Gossip: concept cards, hints and the opening incident. */
import { arrow, dot, person, server, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '16:05 · the config server pushing updates to 5,000 nodes is at 100% CPU · half the cluster is running yesterday’s config.';

const spread = (cx: number, cy: number, level: number) => {
  let out = '';
  const pts = [[0, 0], [60, -40], [60, 40], [120, -70], [120, -20], [120, 20], [120, 70]];
  pts.forEach(([dx, dy], i) => {
    const on = i === 0 || (level >= 1 && i <= 2) || (level >= 2 && i > 2);
    out += dot(cx + dx, cy + dy, on ? 'var(--append)' : 'var(--line)', 9);
  });
  if (level >= 1) out += arrow(cx + 8, cy - 4, cx + 52, cy - 36, '', 'blue') + arrow(cx + 8, cy + 4, cx + 52, cy + 36, '', 'blue');
  if (level >= 2) out += arrow(cx + 68, cy - 44, cx + 112, cy - 66, '', 'blue') + arrow(cx + 68, cy - 38, cx + 112, cy - 22, '', 'blue') + arrow(cx + 68, cy + 38, cx + 112, cy + 22, '', 'blue') + arrow(cx + 68, cy + 44, cx + 112, cy + 66, '', 'blue');
  return out;
};

export const learn: (LearnCard | null)[] = [
  {
    title: 'Telling thousands of servers something',
    frames: [
      {
        svg: svg(
          server(80, 110, 'one sender') + Array.from({ length: 12 }, (_, i) => dot(300 + (i % 4) * 60, 50 + Math.floor(i / 4) * 60, 'var(--line)', 10)).join('') +
            arrow(110, 100, 290, 60, '', 'muted') + arrow(110, 110, 290, 110, '', 'muted') + arrow(110, 120, 290, 170, '', 'muted') +
            text(280, 212, 'one sender, one message at a time: slow, and a single point of failure', { size: 12.5, col: 'var(--bad)' }),
          'One server sending to every node one by one.',
        ),
        html: '<p>A cluster of thousands of servers often needs the same news: a new config, a member that joined, one that died. If one server tells everyone itself, it becomes a bottleneck, and if it dies nobody hears anything.</p>',
      },
      {
        svg: svg(spread(60, 110, 0) + text(60, 190, 'round 0: 1', { size: 13 }) + spread(230, 110, 1) + text(230, 190, 'round 1: 3', { size: 13 }) + spread(400, 110, 2) + text(430, 190, 'round 2: 7', { size: 13 }), 'Each node that knows tells others each round, so the number who know multiplies.'),
        html: '<p><b>Gossip</b> works like a rumour at school: everyone who knows tells a couple of others each <b>round</b>, and they do the same. The number who know <b>multiplies</b> every round, so even millions of nodes hear it in a few dozen rounds, and no single node does much work.</p>',
      },
    ],
    check: {
      q: 'If the number who know doubles every round, about how many rounds to reach 1,000 nodes?',
      options: ['About 10', 'About 100', 'About 1,000'],
      answer: 0,
      why: '2¹⁰ = 1,024. Doubling reaches N nodes in about log₂ N rounds: 10 for a thousand, 20 for a million.',
    },
  },
  null,
  {
    title: 'Nobody sees the whole cluster',
    frames: [
      {
        svg: svg(
          person(80, 110, 'node 7') + text(80, 40, '“who already knows?”', { size: 13, col: 'var(--muted)' }) + text(80, 62, 'no idea', { size: 13, bold: true }) +
            Array.from({ length: 9 }, (_, i) => dot(260 + (i % 3) * 70, 60 + Math.floor(i / 3) * 55, i % 4 === 0 ? 'var(--append)' : 'var(--line)', 11)).join('') +
            arrow(110, 105, 254, 62, 'random pick', 'blue') + arrow(110, 115, 324, 115, '', 'blue', true) + text(420, 205, 'some picks land on nodes that already know: wasted', { size: 12.5, col: 'var(--vote)' }),
          'A node picks random targets, and some already know the rumour.',
        ),
        html: '<p>By hand you could see who already knew. Real nodes can’t: each one just picks a few <b>random</b> others every round. Some picks land on nodes that already know, and those messages are wasted. The number each node tells per round is the <b>fanout</b>.</p><p>Too low and the rumour crawls. Too high and every node floods the network. Find the smallest fanout that is still fast.</p>',
      },
    ],
  },
  {
    title: 'Is it dead, or is it me?',
    frames: [
      {
        svg: svg(
          person(70, 110, 'you') + person(470, 110, 'Bea') + arrow(100, 100, 440, 100, 'ping…', 'red', true) + text(270, 140, 'no answer in 500 ms', { col: 'var(--bad)', bold: true }) + text(270, 170, 'is Bea dead, or is your own link slow?', { size: 13, col: 'var(--muted)' }),
          'Your ping to Bea gets no answer.',
        ),
        html: '<p>To check on a member, you <b>ping</b> it: a tiny “are you there?”. No answer could mean it is dead. Or it could mean the network between <i>you</i> and it is slow. From where you stand, the two look identical.</p>',
      },
      {
        svg: svg(
          person(60, 110, 'you') + person(260, 50, 'Ana') + person(260, 175, 'Kim') + person(480, 110, 'Bea') +
            arrow(90, 100, 232, 58, 'please ping Bea', 'muted') + arrow(90, 120, 232, 168, '', 'muted') + arrow(290, 55, 450, 100, '', 'green') + arrow(290, 170, 450, 120, '', 'green') +
            text(380, 210, 'Bea answers them → Bea is alive', { col: 'var(--ok)', bold: true, size: 13 }),
          'You ask two others to ping Bea for you; Bea answers them.',
        ),
        html: '<p>So ask others to ping it for you: an <b>indirect ping</b>. If it answers them, it’s alive and your link was the problem. If nobody can reach it, declare it dead and gossip the news. That is <b>SWIM</b>, the failure detector inside Consul and Serf.</p>',
      },
    ],
    check: {
      q: 'Your ping to Dev failed. What is the safest next step?',
      options: ['Declare Dev dead', 'Ask two others to ping Dev', 'Ignore it'],
      answer: 1,
      why: 'One failed ping can be your own slow link. Indirect pings from other members tell you whether Dev is really gone.',
    },
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Count the glowing nodes: each one can tell exactly one more this round.',
    concept: 'Use every tell, every round: then the number who know doubles each round.',
    show: 'Click as many grey nodes as there are tells left, then press Next round. Repeat.',
    target: '.gs-node:not(.on)',
  },
  {
    nudge: 'Try fanout 1 first and watch the animation. Then compare the numbers.',
    concept: 'You need enough fanout that random picks still cover everyone within 6 rounds, but no more than 3 messages per node.',
    show: 'Pick fanout <b>3</b>.',
    target: '[data-f="3"]',
  },
  {
    nudge: 'Start every case with Ping.',
    concept: 'If your ping fails, ask others to ping. Dead only if nobody can reach it; alive if anyone can.',
    show: 'Ping → if no answer, Ask 2 others → verdict “dead” only if they got no answer either.',
    target: '#gs-ping',
  },
];
