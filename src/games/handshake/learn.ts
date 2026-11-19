/** Handshake: concept cards, hints and the opening incident. */
import { arrow, box, person, server, svg, text } from '../learnkit';
import type { Hint, LearnCard } from '../types';

export const pager = '11:20 · the mobile app shows half-loaded images on train Wi-Fi · packets are getting lost · the server logs look perfectly normal.';

export const learn: (LearnCard | null)[] = [
  {
    title: 'Packets, and agreeing to talk',
    frames: [
      {
        svg: svg(
          box(30, 80, 120, 50, 'photo.jpg', { col: 'var(--ink)', sub: '5,000 bytes' }) + arrow(156, 105, 214, 105, 'cut into', 'muted') +
            [0, 1, 2, 3, 4].map((i) => box(220 + i * 64, 85, 56, 40, `#${i + 1}`, { col: 'var(--append)', size: 14 })).join('') +
            text(380, 160, 'each packet travels on its own, and may be lost or late', { size: 13, col: 'var(--muted)' }),
          'Data is cut into numbered packets that travel separately.',
        ),
        html: '<p>The internet doesn’t send a file in one piece. It cuts it into small <b>packets</b> (here called <b>segments</b>), and each travels on its own. Some get lost; some arrive in the wrong order. <b>TCP</b> is the protocol that turns this mess back into a reliable stream.</p>',
      },
      {
        svg: svg(
          person(60, 110, 'client') + server(490, 105, 'server') +
            arrow(95, 60, 455, 75, 'SYN: “can we talk? I’ll start at byte 1”', 'blue') +
            arrow(455, 110, 95, 125, 'SYN-ACK: “yes, and so will I”', 'green') +
            arrow(95, 165, 455, 175, 'ACK: “got it”', 'blue'),
          'The three-way handshake: SYN, SYN-ACK, ACK.',
        ),
        html: '<p>Before any data, both sides agree to talk and on how they will number their bytes. That is the <b>three-way handshake</b>: <b>SYN</b> (“let’s talk”), <b>SYN-ACK</b> (“yes, you too”), <b>ACK</b> (“confirmed”). Only then does data flow.</p>',
      },
    ],
    check: {
      q: 'The client sent SYN and the server answered SYN-ACK. What does the client send next?',
      options: ['DATA', 'ACK', 'SYN again'],
      answer: 1,
      why: 'The client confirms the server’s SYN with an ACK. That completes the handshake, and data can follow.',
    },
  },
  null,
  {
    title: 'How does the sender know a packet was lost?',
    frames: [
      {
        svg: svg(
          [0, 1, 2, 3].map((i) => box(30 + i * 130, 40, 110, 40, `bytes ${1 + i * 1000}–`, { col: i === 1 ? 'var(--bad)' : 'var(--append)', size: 13, dash: i === 1 })).join('') +
            text(160, 100, 'lost on the way', { col: 'var(--bad)', size: 13 }) +
            text(280, 150, 'receiver: ACK 1001 → ACK 1001 → ACK 1001', { size: 15, bold: true }) +
            text(280, 180, '“I still need byte 1001, whatever else you sent”', { size: 13, col: 'var(--muted)' }),
          'After a gap, every ACK repeats the next byte the receiver still needs.',
        ),
        html: '<p>The receiver answers each segment with an <b>ACK</b> carrying one number: <b>the next byte it needs</b>. If segment 1001 is lost, every later ACK still says “1001”. Those repeats are <b>duplicate ACKs</b>, and they name exactly what to resend.</p><p>You won’t be told which segment was lost. Read the ACKs.</p>',
      },
    ],
    check: {
      q: 'ACKs come back: 1001, 2001, 3001, 3001, 3001. Which segment was lost?',
      options: ['The one starting at byte 2001', 'The one starting at byte 3001', 'The last one'],
      answer: 1,
      why: 'The receiver keeps asking for byte 3001, so the segment that starts at 3001 never arrived.',
    },
  },
  {
    title: 'Out of order, back in order',
    frames: [
      {
        svg: svg(
          box(30, 40, 110, 40, 'seq 3001', { col: 'var(--append)' }) + box(150, 40, 110, 40, 'seq 1', { col: 'var(--append)' }) + box(270, 40, 110, 40, 'seq 2001', { col: 'var(--append)' }) +
            text(205, 110, 'arrive in any order → wait in the receive buffer', { size: 13, col: 'var(--muted)' }) +
            box(30, 140, 110, 40, '1–1000', { col: 'var(--ok)' }) + box(150, 140, 110, 40, '1001– ?', { col: 'var(--line)', dash: true }) + text(400, 165, 'the app only gets bytes in order', { size: 13 }),
          'Early segments wait in the receive buffer until the gap before them is filled.',
        ),
        html: '<p>Segments can overtake each other. TCP keeps early arrivals in a <b>receive buffer</b> and hands the app bytes strictly in order. If the next piece hasn’t arrived, everything behind it waits: that is <b>head-of-line blocking</b>.</p>',
      },
    ],
  },
  {
    title: 'The round-trip tax',
    frames: [
      {
        svg: svg(
          text(20, 40, 'new connection per request:', { anchor: 'start', size: 13 }) + box(20, 52, 180, 26, 'handshakes', { col: 'var(--vote)', size: 12 }) + box(204, 52, 90, 26, 'request', { col: 'var(--append)', size: 12 }) +
            box(298, 52, 180, 26, 'handshakes', { col: 'var(--vote)', size: 12 }) + box(482, 52, 70, 26, 'req', { col: 'var(--append)', size: 12 }) +
            text(20, 120, 'keep-alive (reuse the connection):', { anchor: 'start', size: 13 }) + box(20, 132, 180, 26, 'handshakes', { col: 'var(--vote)', size: 12 }) + [0, 1, 2].map((i) => box(204 + i * 94, 132, 90, 26, 'request', { col: 'var(--append)', size: 12 })).join('') +
            text(20, 196, 'HTTP/2: many requests at once over one connection', { anchor: 'start', size: 13 }),
          'Reusing a connection skips repeated handshakes.',
        ),
        html: '<p>Every new connection pays for handshakes (2 round trips with encryption). A page needing 20 files pays that again and again. Browsers fix it by <b>reusing</b> connections (keep-alive), opening a few in parallel, and with <b>HTTP/2</b>, sending all requests at once over one connection.</p>',
      },
    ],
  },
];

export const hints: (Hint | null)[] = [
  null,
  {
    nudge: 'Read the ladder from the top: what did the other side just send?',
    concept: 'The order is always SYN → SYN-ACK → ACK, then data. A server answers SYN with SYN-ACK; a client answers SYN-ACK with ACK.',
    show: 'Send the next packet in SYN, SYN-ACK, ACK, DATA, FIN that belongs to your side.',
    target: '[data-pkt]',
  },
  {
    nudge: 'Wait for the ACKs to stream in. Which number keeps repeating?',
    concept: 'An ACK names the next byte the receiver still needs. The repeated number is the start of the lost segment.',
    show: 'Click the segment whose first byte equals the repeated ACK number.',
    target: '#hs-acks',
  },
  {
    nudge: 'Look at “Receiver’s ACK: next byte needed”.',
    concept: 'Only the segment that starts at that byte can be delivered. If it hasn’t arrived yet, wait.',
    show: 'Deliver seq 1, then 1001, 2001, 3001, 4001, waiting for each to arrive.',
  },
  {
    nudge: 'Look at the bars: how much of each lane is orange (handshakes)?',
    concept: 'Reusing connections (keep-alive) removes repeated handshakes. HTTP/2 then sends every request at once.',
    show: 'Turn on <b>keep-alive</b> for under 800 ms, then <b>HTTP/2</b> for under 400 ms.',
    target: '#hs-ka',
  },
];
