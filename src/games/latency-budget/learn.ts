/** Latency Budget: concept cards, hints and the opening incident. */
import { arrow, box, person, server, stopwatch, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '09:05 · “Your site takes forever” from users in Mumbai and Tokyo · server CPU at 12%. The servers are bored. So what is slow?';

const trip = (y: number, label: string, col: 'blue' | 'green' | 'muted') => arrow(110, y, 440, y, label, col) + arrow(440, y + 12, 110, y + 12, '', col);

export const learn: (LearnCard | null)[] = [
  {
    title: 'Distance is time',
    frames: [
      {
        svg: svg(
          person(60, 110, 'you, London') + server(490, 105, 'server, Sydney') +
            arrow(95, 100, 455, 100, '17,000 km', 'blue') +
            text(275, 160, 'light in fibre: about 200 km every millisecond', { col: 'var(--muted)' }) +
            text(275, 190, '17,000 ÷ 200 = 85 ms one way', { bold: true }),
          'Light in fibre covers about 200 km per millisecond, so London to Sydney takes about 85 ms one way.',
        ),
        html: '<p>Data travels through fibre-optic cable as light, at about <b>200 km per millisecond</b>. Nothing on the internet goes faster. So distance <i>is</i> time: London to Sydney is about 17,000 km, so <b>85 ms</b> one way.</p>',
      },
      {
        svg: svg(
          person(60, 110, 'you') + server(490, 105, 'server') +
            arrow(95, 92, 455, 92, 'question: 85 ms', 'blue') + arrow(455, 122, 95, 122, 'answer: 85 ms', 'green') +
            stopwatch(275, 175, 'RTT 170 ms'),
          'A question and its answer make one round trip: 170 ms.',
        ),
        html: '<p>Every question needs an answer back. Out and back again is one <b>round trip</b>, called the <b>RTT</b> (round-trip time). London ↔ Sydney: about <b>170 ms</b>.</p>',
      },
      {
        svg: svg(
          text(60, 30, '1', { bold: true, col: 'var(--append)' }) + trip(26, 'TCP: “hello?” “hello!” (connect)', 'blue') +
            text(60, 92, '2', { bold: true, col: 'var(--append)' }) + trip(88, 'TLS: agree on encryption keys', 'blue') +
            text(60, 154, '3', { bold: true, col: 'var(--ok)' }) + trip(150, 'HTTP: “send me the page” → the page', 'green') +
            text(275, 212, '3 round trips before the first byte of the page', { bold: true }),
          'Loading a page over a new secure connection takes three round trips: TCP, TLS, then the request.',
        ),
        html: '<p>Opening a secure page needs <b>3 round trips</b>: one to connect (TCP), one to set up encryption (TLS), and one to ask for the page. So from Sydney, a page from London takes 3 × 170 ms ≈ <b>half a second</b>, however fast the server is.</p>',
      },
    ],
    check: {
      q: 'Your server is 100 ms away (RTT). Roughly how long until a new visitor sees the first byte of your page?',
      options: ['About 100 ms', 'About 300 ms', 'About 30 ms'],
      answer: 1,
      why: 'Three round trips (connect, encrypt, request) × 100 ms ≈ 300 ms. The only real fix is to be closer to the user.',
    },
  },
  null,
  {
    title: 'Bring the files to the users',
    frames: [
      {
        svg: svg(
          box(230, 20, 100, 44, 'origin', { col: 'var(--ink)', sub: 'Virginia' }) +
            box(40, 140, 110, 44, 'edge', { col: 'var(--accent)', sub: 'London' }) + box(225, 140, 110, 44, 'edge', { col: 'var(--accent)', sub: 'Mumbai' }) + box(410, 140, 110, 44, 'edge', { col: 'var(--accent)', sub: 'Tokyo' }) +
            arrow(260, 66, 100, 136, 'copies', 'muted', true) + arrow(280, 66, 280, 136, '', 'muted', true) + arrow(300, 66, 460, 136, '', 'muted', true),
          'The origin server copies static files to edge servers in many cities.',
        ),
        html: '<p>A <b>CDN</b> (content delivery network) keeps copies of your files on <b>edge servers</b> in many cities. Your real server, the <b>origin</b>, stays where it is.</p>',
      },
      {
        svg: svg(
          person(70, 110, 'user, Tokyo') + box(190, 80, 120, 50, 'edge Tokyo', { col: 'var(--accent)' }) + box(420, 80, 120, 50, 'origin', { col: 'var(--ink)', sub: 'Virginia' }) +
            arrow(100, 100, 184, 100, '26 ms', 'green') + arrow(316, 105, 414, 105, '548 ms', 'red', true),
          'A Tokyo user gets the page from the Tokyo edge in 26 ms instead of 548 ms from Virginia.',
        ),
        html: '<p>Each user is served by the <b>nearest</b> edge: a Tokyo user loads in 26 ms instead of 548 ms. An edge only helps people close to it: within about 2,500 km it can answer in under 150 ms.</p>',
      },
      {
        svg: svg(
          box(30, 40, 150, 60, 'Mumbai', { col: 'var(--bad)', sub: '16M people' }) + box(205, 40, 150, 60, 'Sydney', { col: 'var(--bad)', sub: '6M people' }) + box(380, 40, 150, 60, 'Tokyo', { col: 'var(--bad)', sub: '14M people' }) +
            text(280, 150, 'You can pay for 3 edges. Which cities win?', { size: 14, bold: true }),
          'You have a budget of three edges and more slow cities than that.',
        ),
        html: '<p>Edges cost money. You get <b>3</b>. Cover the most <b>people</b>, not the most dots on the map, and be ready to move an edge when your users change.</p>',
      },
    ],
    check: {
      q: 'One edge left. Still slow: Sydney (6M people) and Mumbai (16M). Where does it go?',
      options: ['Sydney: it is the furthest away', 'Mumbai: more people get fast pages'],
      answer: 1,
      why: 'Budgets go where they help the most users. Sydney waits, until it grows.',
    },
  },
  {
    title: 'What can an edge keep?',
    frames: [
      {
        svg: svg(
          box(30, 30, 240, 70, 'logo.png, app.js, fonts', { col: 'var(--ok)', sub: 'same for everyone → edge' }) +
            box(290, 30, 240, 70, 'your cart, your profile', { col: 'var(--bad)', sub: 'personal → origin' }) +
            box(30, 120, 240, 70, 'POST /checkout', { col: 'var(--bad)', sub: 'a write → origin' }) +
            box(290, 120, 240, 70, 'live stock counts', { col: 'var(--bad)', sub: 'changes every second → origin' }),
          'Shared, unchanging files can be served by an edge; personal data, writes and live data must go to the origin.',
        ),
        html: '<p>An edge can only answer with a <b>stored copy</b>. That works when every user would get the <b>same answer</b> and it doesn’t change every second. Personal data, private data, live data and <b>writes</b> (actions that change something) must go to the origin.</p>',
      },
    ],
    check: {
      q: 'Can an edge serve /cart (your shopping cart)?',
      options: ['Yes, it is just a page', 'No: every user’s cart is different'],
      answer: 1,
      why: 'A cached cart would show one user’s items to another. Personal pages go to the origin.',
    },
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Click a city to see its load time worked out: 3 round trips × the RTT, plus 20 ms.',
    concept: 'One server can’t be close to everyone. Put it where the most people (the M numbers) are within a few thousand km.',
    show: 'Click <b>Ireland</b> (or Frankfurt): Europe is close to London, Lagos and Mumbai, and not too far from New York.',
    target: '[data-site="eu-west"]',
  },
  {
    nudge: 'The numbers on the map are millions of people. Which slow cities are biggest?',
    concept: 'An edge only makes its own city (or a very close one) fast. With 3 edges, cover the 3 biggest slow cities. When the numbers change, move one.',
    show: 'Round 1: Ireland, Mumbai, Tokyo. Round 2: remove the Tokyo edge and put it in São Paulo.',
    target: '[data-site="ap-south"]',
  },
  {
    nudge: 'For each request ask: would two different users get exactly the same answer?',
    concept: 'Same for everyone and rarely changing → edge. Personal, private, live, or a write → origin.',
    show: 'Edge: logo.png, app.js, the font, index.html. Origin: /cart, /api/me, POST /checkout, /api/stock.',
  },
];
