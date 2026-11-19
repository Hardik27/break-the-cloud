import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const arrow = (y: number, ltr: boolean, label: string, color: string) => {
  const [x1, x2] = ltr ? [90, 430] : [430, 90];
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y + 26}" style="stroke:${color};stroke-width:2.5" marker-end="url(#hsarrow)"/><text x="260" y="${y + 8}" text-anchor="middle" ${mono} style="fill:${color}">${label}</text>`;
};
const diagram = `<svg viewBox="0 0 520 230" role="img" aria-label="Ladder diagram: client sends SYN, server replies SYN-ACK, client sends ACK and then the request; the response comes back. Two round trips before the first byte of the page.">
  <defs><marker id="hsarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:var(--ink)"/></marker></defs>
  <text x="90" y="16" text-anchor="middle" ${mono} style="fill:var(--ink)">client</text><text x="430" y="16" text-anchor="middle" ${mono} style="fill:var(--ink)">server</text>
  <line x1="90" y1="24" x2="90" y2="220" style="stroke:var(--line);stroke-width:2"/><line x1="430" y1="24" x2="430" y2="220" style="stroke:var(--line);stroke-width:2"/>
  ${arrow(32, true, 'SYN', 'var(--vote)')}${arrow(72, false, 'SYN-ACK', 'var(--ok)')}${arrow(112, true, 'ACK + GET /', 'var(--append)')}${arrow(152, false, '200 OK (page)', 'var(--ink)')}
  <text x="20" y="100" ${mono} style="fill:var(--accent)">1 RTT</text><text x="20" y="160" ${mono} style="fill:var(--accent)">2 RTT</text>
</svg>`;

export const meta: GameMeta = {
  id: 'handshake',
  level: 1,
  title: 'Handshake',
  concept: 'TCP: connections, loss and order',
  intro:
    'The internet only promises to <i>try</i> to deliver packets: they can be lost, duplicated or arrive out of order. <b>TCP</b> builds a reliable, ordered stream on top. It opens a <b>connection</b> with a three-way handshake, numbers every byte, <b>acknowledges</b> (ACKs) what arrived, and resends what did not. Each trip there and back is a <b>round trip (RTT)</b>, and round trips are what make pages slow.',
  legend: [
    { color: 'var(--vote)', shape: 'line', label: 'SYN: “let’s connect”' },
    { color: 'var(--ok)', shape: 'line', label: 'SYN-ACK: “ok, and here is mine”' },
    { color: 'var(--append)', shape: 'line', label: 'ACK: “got it”' },
    { color: 'var(--ink)', shape: 'line', label: 'DATA: your request or response' },
    { color: 'var(--bad)', shape: 'line', label: 'Wrong packet: the other side resets (RST)' },
  ],
  howTo: [
    'A short tutorial opens your first connection with you. The clock starts after it.',
    'Click the packet to send. Time flows down the ladder diagram: each arrow is one packet.',
    'Right packets build a combo. A wrong packet resets the connection and costs points.',
  ],
  tasks: [
    'Tutorial: open a connection and send a request',
    'Open 4 connections, as client and as server',
    'Recover 3 lost packets',
    'Reassemble 2 shuffled messages',
    'Load a 20-request page under 800 ms, then 400 ms',
  ],
  lessons: [
    'That was TCP’s <b>three-way handshake</b>: SYN, SYN-ACK, ACK. Both sides agree on starting byte numbers before any data flows, which costs one full round trip. Every HTTPS request you have ever made started this way.',
    'The handshake is symmetric: each side sends its own SYN and acknowledges the other’s. Servers such as NGINX keep half-open connections in a queue while handshakes finish; a <b>SYN flood</b> attack fills that queue with fake SYNs.',
    'The receiver acknowledges the next byte it needs, so after a gap every ACK repeats the same number. Three duplicate ACKs trigger <b>fast retransmit</b>: the sender resends just the missing segment instead of waiting for a timeout. Linux TCP does exactly this.',
    'Packets take different paths and arrive out of order. TCP numbers every byte, buffers early arrivals and hands the app a clean, ordered stream. The catch: one lost packet stalls everything behind it (<b>head-of-line blocking</b>).',
    'Round trips, not bandwidth, decide how fast small pages load. <b>Keep-alive</b> reuses connections to skip handshakes, and <b>HTTP/2</b> sends every request at once over one connection. HTTP/3 (QUIC) goes further and merges the TCP and TLS handshakes.',
  ],
  walkthrough: [
    { id: 'syn', target: '[data-pkt="SYN"]', text: 'You are the client. Every TCP connection starts with SYN: click SYN to send it.' },
    { id: 'ack', target: '[data-pkt="ACK"]', text: 'The server answered SYN-ACK. Finish the handshake: click ACK.' },
    { id: 'data', target: '[data-pkt="DATA"]', text: 'The connection is open. Now send your request: click DATA.' },
  ],
  minTimeMs: RULES['handshake'].minTimeMs,
  parMs: RULES['handshake'].parMs,
  learnMore: {
    paragraphs: [
      'TCP gives applications a reliable byte stream over an unreliable network. It numbers bytes (sequence numbers), acknowledges them cumulatively, keeps a timer for each unacknowledged segment, and resends on timeout or after three duplicate ACKs. <b>Flow control</b> stops a fast sender from flooding a slow receiver, and <b>congestion control</b> slows everyone down when the network is overloaded.',
      'The price is latency. A new HTTPS connection needs a TCP handshake (1 RTT) plus a TLS handshake (1 more RTT with TLS 1.3) before the first request. On a 100 ms mobile link that is 200 ms of waiting per connection, which is why browsers reuse connections and why CDNs put servers close to users.',
      'HTTP/2 multiplexes many requests over one TCP connection, but a single lost packet still blocks them all. HTTP/3 runs over QUIC on UDP, so each stream recovers on its own, and it can resume a known server with zero extra round trips.',
    ],
    diagram,
    caption: 'A ladder diagram: time flows down. Two round trips pass before the page starts to arrive.',
    links: [
      { label: 'RFC 9293: Transmission Control Protocol (TCP)', url: 'https://www.rfc-editor.org/rfc/rfc9293' },
      { label: 'MDN: Connection management in HTTP/1.x (keep-alive, parallel connections)', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Connection_management_in_HTTP_1.x' },
      { label: 'RFC 9000: QUIC, the transport under HTTP/3', url: 'https://www.rfc-editor.org/rfc/rfc9000' },
    ],
  },
};
