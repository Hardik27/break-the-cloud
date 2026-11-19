import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const spikes = (y: number, xs: number[], h: number, col: string) => xs.map((x) => `<rect x="${x}" y="${y - h}" width="8" height="${h}" style="fill:${col}"/>`).join('');
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Retry timing. Without jitter, all clients retry at the same instants: tall synchronized spikes. With exponential backoff and jitter, retries thin out and spread into a low band.">
  <text x="0" y="16" ${mono} style="fill:var(--ink)">exponential backoff, no jitter: everyone retries together</text>
  ${spikes(90, [20, 60, 140, 300], 64, 'var(--bad)')}<line x1="0" y1="70" x2="510" y2="70" style="stroke:var(--muted);stroke-dasharray:4 4"/>
  <text x="0" y="116" ${mono} style="fill:var(--ink)">with jitter: the same retries, spread out</text>
  ${Array.from({ length: 50 }, (_, i) => `<rect x="${10 + i * 10}" y="${190 - (8 + ((i * 7) % 11))}" width="8" height="${8 + ((i * 7) % 11)}" style="fill:var(--ok)"/>`).join('')}
  <line x1="0" y1="170" x2="510" y2="170" style="stroke:var(--muted);stroke-dasharray:4 4"/>
</svg>`;

export const meta: GameMeta = {
  id: 'retry-storm',
  level: 5,
  title: 'Retry Storm',
  concept: 'Timeouts, backoff and jitter',
  intro:
    'When a request fails, the obvious move is to <b>retry</b>. But if a service is failing because it is overloaded, every retry is <i>more</i> load. A hundred clients retrying instantly can multiply traffic many times over and keep the service down long after the original problem is gone: a <b>retry storm</b>. The fix is to wait between retries (<b>backoff</b>) and to wait slightly different amounts (<b>jitter</b>).',
  legend: [
    { color: 'var(--append)', shape: 'square', label: 'Requests and retries per second' },
    { color: 'var(--muted)', shape: 'line', label: 'What the API can take per second' },
    { color: 'var(--bad)', shape: 'square', label: 'Load over capacity (requests fail)' },
  ],
  howTo: [
    'A short tutorial shows you how to send a retry. The clock starts after it.',
    'Send retries only when the API has room. Later, pick a retry policy and press Run.',
    'Every retry that gets through builds a combo. A retry into an overloaded API costs points.',
  ],
  tasks: [
    'Tutorial: send two retries',
    'Pace 12 retries into a recovering API',
    'Pick a retry policy that does not pile on',
    'Break up the synchronized waves',
  ],
  lessons: [
    'Each retry is a brand-new request to the server: the server cannot tell it apart from real traffic. That is why retries help when failures are random and hurt when the server is overloaded.',
    'You paced your retries to what the API could take. When you sent too fast, the failed attempts still added load. Libraries do this pacing for you with a <b>retry budget</b> (for example, retries may add at most 10% extra load), as in gRPC and Finagle.',
    '<b>Exponential backoff</b> waits 0.5 s, 1 s, 2 s, 4 s… between tries, so a client in trouble sends fewer and fewer requests. Immediate retries quadrupled the load during the outage; backoff cut it to well below normal. AWS SDKs back off exponentially by default.',
    'The crash hit every client at the same instant, so their backoff timers were in lockstep: all of them retried together, again and again. <b>Jitter</b> adds randomness to each wait and breaks the lockstep. AWS’s guidance is simple: “backoff and jitter, always together”.',
  ],
  walkthrough: [
    { id: 'send1', target: '#rs-send', text: 'A request to the payment API failed. Click Send retry to try it again.' },
    { id: 'send2', target: '#rs-send', text: 'It went through. The API had room. Send the next queued retry.' },
  ],
  minTimeMs: RULES['retry-storm'].minTimeMs,
  parMs: RULES['retry-storm'].parMs,
  learnMore: {
    paragraphs: [
      'Retries turn a short outage into a long one when they are synchronized and unbounded. The classic sequence: a dependency slows down, clients time out and retry, the extra load slows it further, and the system settles into a stable overloaded state even after the original trigger is gone. This is called a <b>metastable failure</b>.',
      'Good retry hygiene has four parts: a <b>timeout</b> on every call, a small <b>maximum number of attempts</b>, <b>exponential backoff</b> between attempts, and <b>jitter</b> on every wait. Retry only operations that are safe to repeat (idempotent), and only errors that might go away (timeouts, 503s), never a 400.',
      'Add a <b>retry budget</b> at the client and <b>load shedding</b> at the server: when the server is overloaded it rejects work quickly with a clear “try later”, instead of accepting everything and timing out. The next game, Circuit Breaker, stops calling a failing dependency altogether.',
    ],
    diagram,
    caption: 'Backoff alone leaves clients in lockstep; jitter spreads the same retries out.',
    links: [
      { label: 'AWS Builders’ Library: Timeouts, retries and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
      { label: 'AWS Architecture Blog: Exponential backoff and jitter', url: 'https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/' },
      { label: 'Bronson et al.: Metastable Failures in Distributed Systems (HotOS 2021)', url: 'https://sigops.org/s/conferences/hotos/2021/papers/hotos21-s11-bronson.pdf' },
    ],
  },
};
