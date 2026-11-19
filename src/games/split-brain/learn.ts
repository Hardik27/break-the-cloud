/** Split Brain: concept cards, hints and the opening incident. */
import { arrow, box, server, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = 'Chaos day · your team runs etcd for Kubernetes · your job: try to make five servers disagree. Can you break Raft?';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Five servers, one leader',
    frames: [
      {
        svg: svg(server(280, 70, 'leader', { col: 'var(--accent)' }) + [80, 180, 380, 480].map((x) => server(x, 170, 'follower')).join('') + arrow(258, 92, 100, 140, '', 'blue') + arrow(270, 98, 190, 140, '', 'blue') + arrow(290, 98, 370, 140, '', 'blue') + arrow(302, 92, 460, 140, '', 'blue'), 'One leader sends updates to four followers.', 240),
        html: '<p>Systems like etcd (the brain of Kubernetes) keep five copies of their data so they survive crashes. To agree on every change, <b>Raft</b> picks one <b>leader</b>. Clients write to the leader, it copies each entry to the <b>followers</b>, and the entry counts (is <b>committed</b>) once a <b>majority</b>, 3 of 5, have it.</p>',
      },
      {
        svg: svg(box(40, 50, 220, 80, 'leader silent?', { col: 'var(--bad)', sub: 'followers time out' }) + box(300, 50, 220, 80, 'election', { col: 'var(--vote)', sub: 'new term, majority vote' }) + text(280, 180, 'every election starts a new term (a number that only goes up)', { size: 13 }), 'If the leader goes quiet, followers hold an election in a new term.'),
        html: '<p>The leader sends heartbeats. If followers stop hearing them, one starts an <b>election</b>: it moves to a new <b>term</b> (an increasing number) and asks for votes. A majority makes it the new leader. A leader cut off from the majority can’t commit anything, so the data stays safe. Your job: try to break it anyway.</p>',
      },
    ],
    check: {
      q: 'Five servers. How many must store an entry before it is committed?',
      options: ['2', '3', '5'],
      answer: 1,
      why: 'A majority of 5 is 3. Any two majorities overlap, so a committed entry can never be lost by a new leader.',
    },
  },
  null,
  {
    title: 'Two leaders at once?',
    frames: [{ html: '<p>Cut the leader off from the others. The majority elects a new leader in a higher term, but the old one still thinks it leads. Two crowns! Watch what happens to the old leader when you reconnect it: the higher term wins.</p>' }],
  },
  {
    title: 'No majority, no leader',
    frames: [{ html: '<p>A leader needs votes from a majority. If no group of 3 servers can talk to each other, no election can ever succeed. Using links only, keep the cluster without a working leader.</p>' }],
  },
  {
    title: 'Election storms',
    frames: [{ html: '<p>Every election costs a pause in writes. Force as many as you can in a short time. Real systems add random election timeouts so this rarely happens on its own.</p>' }],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Which server wears the crown?',
    concept: 'Without a working leader, followers time out and elect a new one.',
    show: 'Crash the leader, wait for the new election, crash the new leader.',
  },
  {
    nudge: 'Can you separate the leader from everyone else using links?',
    concept: 'Cut every link from the leader. The other four elect a new one. Then reconnect the old leader.',
    show: 'Cut all four of the leader’s links, wait for a new leader, then restore one link.',
  },
  {
    nudge: 'An election needs 3 servers that can talk to each other.',
    concept: 'Split the cluster so that no 3 servers are connected.',
    show: 'Cut links so the servers form groups of at most 2.',
  },
  {
    nudge: 'Each new leader is another election.',
    concept: 'Crash or isolate each new leader as soon as it appears.',
    show: 'Repeatedly crash the current leader, restarting the old ones.',
  },
];
