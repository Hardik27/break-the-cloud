/** Clock Skew: concept cards, hints and the opening incident. */
import { arrow, box, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '20:30 · bug report: “in the group chat, Bob’s reply shows up ABOVE the question he answered” · sorting is by timestamp. So what is wrong?';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Every clock is a little wrong',
    frames: [
      {
        svg: svg(box(30, 50, 150, 70, 'Alice’s phone', { col: 'var(--ok)', sub: '12:00:05' }) + box(205, 50, 150, 70, 'Bob’s phone', { col: 'var(--bad)', sub: '11:59:56 (9 s slow)' }) + box(380, 50, 150, 70, 'Carol’s phone', { col: 'var(--vote)', sub: '12:00:11 (6 s fast)' }) + text(280, 170, 'the same instant, three different times', { size: 14, bold: true }), 'Three phones show different times at the same instant.'),
        html: '<p>Every computer has its own clock, and no two agree exactly. The difference is <b>clock skew</b>. Phones can be seconds apart. So when events happen on different machines, their timestamps can lie about which came first.</p>',
      },
    ],
    check: {
      q: 'Alice asks a question at 12:00:05 (her clock). Bob, whose clock is 9 s slow, answers 4 s later. What timestamp does his answer carry?',
      options: ['12:00:09', '12:00:00', '11:59:56'],
      answer: 1,
      why: 'Real time 12:00:09 minus 9 s of skew = 12:00:00: earlier than the question it answers.',
    },
  },
  null,
  {
    title: 'Lamport clocks: counting instead of timing',
    frames: [
      {
        svg: svg(text(30, 50, 'A', { anchor: 'start', size: 16, bold: true }) + `<line x1="60" y1="45" x2="530" y2="45" style="stroke:var(--line);stroke-width:2"/>` + text(30, 150, 'B', { anchor: 'start', size: 16, bold: true }) + `<line x1="60" y1="145" x2="530" y2="145" style="stroke:var(--line);stroke-width:2"/>` +
            `<circle cx="120" cy="45" r="9" style="fill:var(--ink)"/>` + text(120, 30, '1', { bold: true }) + `<circle cx="220" cy="45" r="9" style="fill:var(--ink)"/>` + text(220, 30, '2 (send)', { bold: true }) + arrow(226, 52, 360, 136, '', 'blue') +
            `<circle cx="160" cy="145" r="9" style="fill:var(--ink)"/>` + text(160, 175, '1', { bold: true }) + `<circle cx="370" cy="145" r="9" style="fill:var(--append)"/>` + text(370, 175, 'max(1, 2) + 1 = 3', { bold: true, col: 'var(--append)' }),
          'Lamport clock: +1 per event; on receive, max of own and message, plus 1.',
        ),
        html: '<p>Instead of trusting clocks, count events. A <b>Lamport clock</b> is one counter per server: add 1 on every event or send. A message carries the sender’s counter. On receive, take <b>max(your counter, the message’s) + 1</b>. Now if a caused b, a’s number is smaller.</p>',
      },
    ],
    check: {
      q: 'B’s counter is 4. A message arrives stamped 7. What is the receive event’s timestamp?',
      options: ['5', '8', '11'],
      answer: 1,
      why: 'max(4, 7) + 1 = 8.',
    },
  },
  {
    title: 'Vector clocks: who knew about what',
    frames: [
      {
        svg: svg(box(30, 50, 230, 70, 'x = [2, 1, 0]', { col: 'var(--append)' }) + box(300, 50, 230, 70, 'y = [0, 0, 1]', { col: 'var(--vote)' }) + text(280, 160, 'x bigger in A and B, y bigger in C → concurrent', { size: 14, bold: true }), 'Vector clocks compared entry by entry.'),
        html: '<p>Lamport numbers can’t tell you that two events were <b>concurrent</b> (neither knew about the other). A <b>vector clock</b> keeps one counter per server: [A, B, C]. x happened before y if <b>every</b> entry of x is ≤ the same entry of y. If each is bigger somewhere, they are concurrent: a real conflict.</p>',
      },
    ],
    check: {
      q: 'x = [1, 2, 0], y = [2, 2, 1]. How are they related?',
      options: ['x happened before y', 'y happened before x', 'Concurrent'],
      answer: 0,
      why: 'Every entry of x (1, 2, 0) is ≤ y’s (2, 2, 1), and they differ: x happened before y.',
    },
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Ignore the timestamps. Read what each message replies to.',
    concept: 'A reply always comes after the message it answers, whatever the clocks say.',
    show: 'Start with the question that opens the conversation, then follow each reply.',
  },
  {
    nudge: 'Is this event a receive, or a local event / send?',
    concept: 'Local or send: previous value on this server + 1. Receive: max(own, message) + 1.',
    show: 'For a receive, take the larger of the server’s last number and the sender’s number, then add 1.',
    target: '#ck-q',
  },
  {
    nudge: 'Compare the two vectors one entry at a time.',
    concept: 'All entries ≤ (and not equal) means “before”. Bigger in some and smaller in others means “concurrent”.',
    show: 'If neither vector is ≤ the other in every entry, pick concurrent.',
  },
];
