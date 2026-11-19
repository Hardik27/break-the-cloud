import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const dot = (x: number, y: number, label: string, v: string, col = 'var(--ink)') =>
  `<circle cx="${x}" cy="${y}" r="7" style="fill:${col}"/><text x="${x}" y="${y - 12}" text-anchor="middle" ${mono} style="fill:var(--muted)">${label}</text><text x="${x}" y="${y + 22}" text-anchor="middle" ${mono} style="fill:var(--ink)">${v}</text>`;
const diagram = `<svg viewBox="0 0 520 210" role="img" aria-label="Two processes. P sends a message to Q; Q's vector clock becomes [2,1], after P's send [2,0]. R's local event [0,0,1] is concurrent with both: neither vector is less than or equal to the other.">
  <defs><marker id="ckm-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--append)"/></marker></defs>
  <text x="14" y="44" ${mono} style="fill:var(--ink)">P</text><line x1="40" y1="40" x2="500" y2="40" style="stroke:var(--line);stroke-width:2"/>
  <text x="14" y="114" ${mono} style="fill:var(--ink)">Q</text><line x1="40" y1="110" x2="500" y2="110" style="stroke:var(--line);stroke-width:2"/>
  <text x="14" y="184" ${mono} style="fill:var(--ink)">R</text><line x1="40" y1="180" x2="500" y2="180" style="stroke:var(--line);stroke-width:2"/>
  <line x1="160" y1="44" x2="290" y2="104" style="stroke:var(--append);stroke-width:2" marker-end="url(#ckm-arr)"/>
  ${dot(90, 40, 'p1', '[1,0,0]')}${dot(160, 40, 'p2 send', '[2,0,0]')}${dot(296, 110, 'q1 recv', '[2,1,0]', 'var(--append)')}${dot(220, 180, 'r1', '[0,0,1]', 'var(--vote)')}
  <text x="400" y="200" text-anchor="middle" ${mono} style="fill:var(--vote)">r1 ∥ p2: concurrent</text>
</svg>`;

export const meta: GameMeta = {
  id: 'clock-skew',
  level: 6,
  title: 'Clock Skew',
  concept: 'Wall clocks vs Lamport clocks vs vector clocks',
  intro:
    'Every computer has its own clock, and no two agree exactly: the difference is called <b>clock skew</b>. So when events happen on different machines, their timestamps can lie about which came first. Here you order a group chat whose phones disagree about the time, then use <b>logical clocks</b> (counters that move with events, not seconds) to find the real order.',
  legend: [
    { color: 'var(--accent)', shape: 'square', label: 'The event or message to work on now' },
    { color: 'var(--append)', shape: 'dash', label: 'A message sent from one process to another' },
    { color: 'var(--ok)', shape: 'square', label: 'Done: placed or timestamped correctly' },
  ],
  howTo: [
    'A short tutorial shows you how to put two messages in their real order. The clock starts after it.',
    'Order a chat by what each message replies to, then work out logical timestamps on a diagram of three servers.',
    'Correct answers build a combo. Trusting a wrong timestamp costs points.',
  ],
  tasks: [
    'Tutorial: fix the order of two messages',
    'Order a group chat with skewed clocks',
    'Compute Lamport timestamps for 8 events',
    'Classify 6 pairs with vector clocks',
  ],
  lessons: [
    'Bob’s reply carried an earlier timestamp than the question it answered. Clocks drift: NTP keeps servers within a few milliseconds on a good day, and phones can be off by seconds.',
    'Sorting by timestamp put replies before their questions, because Bob’s clock was 9 s slow and Carol’s 6 s fast. Lamport called the real order <b>happened-before</b>: events on one machine happen in sequence, and a message is sent before it is received. Wall clocks from different machines can’t give you that order.',
    'A <b>Lamport clock</b> is one counter per process: +1 on every event, messages carry the counter, and a receiver jumps to max(own, message) + 1. If a happened before b, then L(a) &lt; L(b). Raft’s terms are a logical clock like this; Google Spanner instead measures its real clock error (TrueTime) and waits it out.',
    'Lamport numbers can’t show concurrency: c1 has 1 and a2 has 2, yet neither knew about the other. A <b>vector clock</b> keeps one counter per process. x happened before y exactly when every entry of x is ≤ y’s; if neither is ≤, the events are <b>concurrent</b>, a real conflict. Amazon’s Dynamo and Riak used vector clocks to find conflicting versions.',
  ],
  walkthrough: [
    { id: 'first', target: '[data-msg="0"]', text: 'The chat is sorted by timestamp, so Bob’s reply shows up above Alice’s question. Click Alice’s question: it was really sent first.' },
    { id: 'second', target: '[data-msg="1"]', text: 'Now click Bob’s reply. It answers the question, so it came after it, whatever its timestamp says.' },
  ],
  minTimeMs: RULES['clock-skew'].minTimeMs,
  parMs: RULES['clock-skew'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'Leslie Lamport’s 1978 paper defined <b>happened-before</b> (→): a → b if they are on the same process and a comes first, or a is the send and b the receive of the same message, or there is a chain of these. Events with no such chain are concurrent. His logical clocks guarantee a → b implies L(a) &lt; L(b), but not the reverse.',
      'Vector clocks (Fidge and Mattern, 1988) fix that: V(a) &lt; V(b) if and only if a → b. The cost is one counter per process, which is why systems with many clients use variants such as dotted version vectors (Riak) or fall back to <b>last-writer-wins</b> timestamps (Cassandra), accepting that skew can drop a write.',
      'Physical time still matters for leases and timeouts. Google’s Spanner uses GPS and atomic clocks to bound the error (TrueTime) and waits out the uncertainty before committing. <b>Hybrid logical clocks</b> (CockroachDB) mix a physical timestamp with a logical counter so they stay close to real time and still respect causality.',
    ],
    diagram,
    caption: 'Vector clocks show causality: q1 [2,1,0] came after p2 [2,0,0]; r1 [0,0,1] is concurrent with both.',
    links: [
      { label: 'Lamport: Time, Clocks, and the Ordering of Events in a Distributed System (CACM 1978)', url: 'https://lamport.azurewebsites.net/pubs/time-clocks.pdf' },
      { label: 'Kleppmann: Distributed Systems lecture notes (Cambridge), logical time', url: 'https://www.cl.cam.ac.uk/teaching/2122/ConcDisSys/dist-sys-notes.pdf' },
      { label: 'Corbett et al.: Spanner, Google’s Globally-Distributed Database (OSDI 2012)', url: 'https://research.google/pubs/spanner-googles-globally-distributed-database-2/' },
    ],
  },
};
