/**
 * Handshake: TCP connection setup, retransmission, ordering, and the cost of round trips. Pure simulation, no DOM.
 *
 * Tasks:
 *   0 tutorial    as the client: SYN, (server SYN-ACK), ACK, DATA
 *   1 both sides  open 4 connections, sometimes as client, sometimes as server
 *   2 lost        a segment is dropped; read the duplicate ACKs and resend the right one (3 rounds)
 *   3 order       segments arrive shuffled; deliver them to the app in sequence order (2 rounds)
 *   4 rtt         load a 20-request page under 800 ms, then under 400 ms
 */
import { intBelow, shuffle, type Rng } from '../../lib/rng';

export type Pkt = 'SYN' | 'SYN-ACK' | 'ACK' | 'DATA' | 'FIN';
export const PKTS: Pkt[] = ['SYN', 'SYN-ACK', 'ACK', 'DATA', 'FIN'];
export type Side = 'client' | 'server';
/** sep marks a divider line between connections in the ladder, not a real packet. */
export interface Packet { from: Side; pkt: Pkt; note: string; bad?: boolean; sep?: boolean }

const OPEN: { from: Side; pkt: Pkt }[] = [
  { from: 'client', pkt: 'SYN' },
  { from: 'server', pkt: 'SYN-ACK' },
  { from: 'client', pkt: 'ACK' },
];
const TUTORIAL = [...OPEN, { from: 'client' as Side, pkt: 'DATA' as Pkt }];

const NOTES: Record<string, string> = {
  'client SYN': 'SYN: “I want to talk. My first byte is number 1.”',
  'server SYN-ACK': 'SYN-ACK: “Got it. Here is my first byte number too.”',
  'client ACK': 'ACK: “Got yours.” The connection is open.',
  'client DATA': 'DATA: GET /index.html, sent over the open connection.',
};

// ---------- tasks 0–1: handshakes ----------
export interface HsState {
  roles: Side[];
  ci: number;
  step: number;
  ladder: Packet[];
  opened: number;
  mistakes: number;
}

export function createHandshake(task: number, rng: Rng): HsState {
  const roles: Side[] = task === 0 ? ['client'] : shuffle(rng, ['client', 'client', 'server', 'server'] as Side[]);
  if (task === 1 && roles[0] === 'server' && roles[1] === 'server') [roles[1], roles[2]] = [roles[2], roles[1]];
  const s: HsState = { roles, ci: 0, step: 0, ladder: [], opened: 0, mistakes: 0 };
  autoPlay(s, task);
  return s;
}

const script = (task: number) => (task === 0 ? TUTORIAL : OPEN);
export const role = (s: HsState): Side | null => s.roles[s.ci] ?? null;
export const hsDone = (s: HsState): boolean => s.ci >= s.roles.length;
/** The packet the student should send now. */
export function expectedPkt(s: HsState, task: number): Pkt | null {
  const e = script(task)[s.step];
  return e && e.from === role(s) ? e.pkt : null;
}

function push(s: HsState, from: Side, pkt: Pkt) {
  s.ladder.push({ from, pkt, note: NOTES[`${from} ${pkt}`] ?? pkt });
}

/** Plays the other side's packets until it is the student's turn; moves to the next connection when one opens. */
function autoPlay(s: HsState, task: number) {
  const sc = script(task);
  for (;;) {
    if (hsDone(s)) return;
    if (s.step >= sc.length) {
      s.opened++;
      s.ci++;
      s.step = 0;
      if (!hsDone(s)) s.ladder.push({ from: 'client', pkt: 'FIN', note: `Connection ${s.ci + 1}: you are the ${role(s)}`, sep: true });
      continue;
    }
    const e = sc[s.step];
    if (e.from === role(s)) return;
    push(s, e.from, e.pkt);
    s.step++;
  }
}

export function send(s: HsState, task: number, pkt: Pkt): { ok: boolean; msg: string; opened: boolean } {
  if (hsDone(s)) return { ok: false, msg: 'All connections are open.', opened: false };
  const want = expectedPkt(s, task)!;
  const me = role(s)!;
  if (pkt !== want) {
    s.mistakes++;
    s.ladder.push({ from: me, pkt, note: `${pkt}?! The other side replies RST (reset).`, bad: true });
    return { ok: false, msg: wrongMsg(me, want, pkt), opened: false };
  }
  push(s, me, pkt);
  s.step++;
  const before = s.opened;
  autoPlay(s, task);
  return { ok: true, msg: NOTES[`${me} ${pkt}`] ?? pkt, opened: s.opened > before };
}

function wrongMsg(me: Side, want: Pkt, got: Pkt): string {
  if (got === 'DATA') return 'No data before the handshake finishes: the other side does not know your byte numbers yet, so it resets the connection.';
  if (got === 'FIN') return 'FIN closes a connection. This one is not even open yet.';
  if (me === 'server' && want === 'SYN-ACK') return 'You are the server. A client just sent SYN, so you answer with SYN-ACK: acknowledge theirs, send your own.';
  if (me === 'client' && want === 'SYN') return 'You are the client. Every connection starts with your SYN.';
  if (want === 'ACK') return 'The server sent SYN-ACK. Acknowledge it with ACK to finish the three-way handshake.';
  return `Not ${got}: the next packet here is ${want}.`;
}

// ---------- task 2: a lost segment ----------
export const SEG = 1000;
export const seqOf = (i: number): number => 1 + i * SEG;
export interface LossRound { n: number; dropped: number; acks: number[] }

export function makeLoss(rng: Rng): LossRound {
  const n = 6;
  const dropped = 1 + intBelow(rng, 4);
  // The receiver acks cumulatively: "next byte I need". After the gap, every ACK repeats the same number.
  const acks: number[] = [];
  for (let i = 0; i < n; i++) if (i !== dropped) acks.push(i < dropped ? seqOf(i + 1) : seqOf(dropped));
  return { n, dropped, acks };
}

export function resend(r: LossRound, i: number): { ok: boolean; msg: string } {
  if (i === r.dropped) return { ok: true, msg: `Resent bytes ${seqOf(i)}–${seqOf(i + 1) - 1}. The receiver now has everything: ACK ${seqOf(r.n)}.` };
  if (i < r.dropped) return { ok: false, msg: `The receiver already acknowledged byte ${seqOf(i)} (it asked for ${seqOf(r.dropped)} next). Resending it wastes bandwidth.` };
  return { ok: false, msg: `Segment ${seqOf(i)} arrived: it is waiting in the receiver’s buffer. The duplicate ACKs all ask for byte ${seqOf(r.dropped)}.` };
}

// ---------- task 3: out of order ----------
export interface OrderRound { arrived: number[]; delivered: number }
export function makeOrder(rng: Rng): OrderRound {
  let arrived: number[];
  do arrived = shuffle(rng, [0, 1, 2, 3, 4]);
  while (arrived.every((x, i) => x === i));
  return { arrived, delivered: 0 };
}
export function deliver(r: OrderRound, seg: number): { ok: boolean; msg: string } {
  if (seg < r.delivered) return { ok: false, msg: `Bytes from ${seqOf(seg)} were already delivered to the app.` };
  if (seg !== r.delivered) return { ok: false, msg: `The app must get bytes in order. Byte ${seqOf(seg)} has to wait until ${seqOf(r.delivered)} is delivered.` };
  r.delivered++;
  return { ok: true, msg: `Delivered bytes ${seqOf(seg)}–${seqOf(seg + 1) - 1}.` };
}
export const orderDone = (r: OrderRound): boolean => r.delivered >= r.arrived.length;

// ---------- task 4: the RTT tax ----------
export const RTT = 100;
export const REQUESTS = 20;
export const GOALS = [800, 400];
export interface LoadOpts { keepAlive: boolean; parallel: 1 | 2 | 6; http2: boolean }
export interface Lane { blocks: { start: number; len: number; kind: 'hs' | 'req'; n: number }[] }
export interface LoadResult { ms: number; lanes: Lane[]; explain: string }

/** Each new connection costs 2 RTT (TCP + TLS handshakes); each request costs 1 RTT. */
export function loadPage(o: LoadOpts): LoadResult {
  if (o.http2) {
    return {
      ms: 3 * RTT,
      lanes: [{ blocks: [{ start: 0, len: 2 * RTT, kind: 'hs', n: 1 }, { start: 2 * RTT, len: RTT, kind: 'req', n: REQUESTS }] }],
      explain: 'HTTP/2: one connection, one handshake, and all 20 requests travel at once over it (multiplexing).',
    };
  }
  const lanes: Lane[] = [];
  let ms = 0;
  for (let l = 0; l < o.parallel; l++) {
    const count = Math.floor(REQUESTS / o.parallel) + (l < REQUESTS % o.parallel ? 1 : 0);
    const blocks: Lane['blocks'] = [];
    let t = 0;
    if (o.keepAlive) {
      blocks.push({ start: 0, len: 2 * RTT, kind: 'hs', n: 1 });
      t = 2 * RTT;
      for (let k = 0; k < count; k++) {
        blocks.push({ start: t, len: RTT, kind: 'req', n: 1 });
        t += RTT;
      }
    } else {
      for (let k = 0; k < count; k++) {
        blocks.push({ start: t, len: 2 * RTT, kind: 'hs', n: 1 });
        blocks.push({ start: t + 2 * RTT, len: RTT, kind: 'req', n: 1 });
        t += 3 * RTT;
      }
    }
    lanes.push({ blocks });
    ms = Math.max(ms, t);
  }
  const explain = o.keepAlive
    ? `${o.parallel} connection${o.parallel > 1 ? 's' : ''}, each handshakes once (200 ms) then sends ${Math.ceil(REQUESTS / o.parallel)} requests one after another.`
    : `Without keep-alive every request opens a new connection: 200 ms of handshakes before each 100 ms request.`;
  return { ms, lanes, explain };
}
