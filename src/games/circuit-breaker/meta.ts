import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const st = (x: number, y: number, label: string, fill: string) =>
  `<rect x="${x}" y="${y}" width="120" height="44" rx="22" style="fill:${fill}"/><text x="${x + 60}" y="${y + 27}" text-anchor="middle" ${mono} style="fill:#fff">${label}</text>`;
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="Circuit breaker states: closed passes calls through; too many failures open it; after a wait it goes half-open and lets one probe through; success closes it, failure opens it again.">
  ${st(20, 78, 'CLOSED', 'var(--ok)')}${st(200, 20, 'OPEN', 'var(--bad)')}${st(380, 78, 'HALF-OPEN', 'var(--vote)')}
  <path d="M110,78 Q150,30 198,40" style="fill:none;stroke:var(--ink);stroke-width:2" marker-end="url(#cba)"/>
  <path d="M320,42 Q380,40 420,76" style="fill:none;stroke:var(--ink);stroke-width:2" marker-end="url(#cba)"/>
  <path d="M400,124 Q260,190 100,124" style="fill:none;stroke:var(--ok);stroke-width:2" marker-end="url(#cba)"/>
  <path d="M410,78 Q330,60 300,64" style="fill:none;stroke:var(--bad);stroke-width:2;stroke-dasharray:5 4" marker-end="url(#cba)"/>
  <defs><marker id="cba" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" style="fill:var(--ink)"/></marker></defs>
  <text x="100" y="30" ${mono} style="fill:var(--ink)">N failures</text><text x="380" y="34" ${mono} style="fill:var(--ink)">after a wait</text>
  <text x="250" y="190" text-anchor="middle" ${mono} style="fill:var(--ok)">probe succeeds</text><text x="350" y="100" ${mono} style="fill:var(--bad)">probe fails</text>
</svg>`;

export const meta: GameMeta = {
  id: 'circuit-breaker',
  level: 5,
  title: 'Circuit Breaker',
  concept: 'Closed, open, half-open',
  intro:
    'The shop page calls a <b>recommendations</b> service. Normally that takes 100 ms. When recommendations is down, each call hangs until a 5-second timeout, holding one of the web server’s <b>20 threads</b> (workers). Once every thread is stuck waiting, the <b>whole shop page</b> goes down, even though only a small feature broke. A <b>circuit breaker</b> stops calling a dependency that is failing.',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'Breaker CLOSED: calls go through' },
    { color: 'var(--bad)', shape: 'square', label: 'Breaker OPEN: calls skipped, page shows no recommendations' },
    { color: 'var(--vote)', shape: 'line', label: 'Threads busy (20 = the page goes down)' },
  ],
  howTo: [
    'A short tutorial shows you how to open the breaker and probe the service. The clock starts after it.',
    'Click the breaker to open or close it. Click Probe to send one test call.',
    'Tripping it in time and closing it after recovery build a combo. Seconds with the page down, or with features off for no reason, cost points.',
  ],
  tasks: [
    'Tutorial: open the breaker, probe the service',
    'Be the breaker through two outages',
    'Pick how many failures should trip the breaker',
    'Pick how often to probe a broken service',
  ],
  lessons: [
    'An open breaker answers instantly with a <b>fallback</b> (here: no recommendations) instead of waiting on a dead service. A probe is a single test call, so you learn whether the service is back without flooding it.',
    'Without the breaker, a non-essential feature took the whole page down: every thread was stuck waiting on it. That is a <b>cascading failure</b>. You turned it into a graceful one: the shop stayed up, just without recommendations. Netflix’s Hystrix library made this pattern famous.',
    'Trip on a single failure and every blip turns features off. Wait for 50 and the threads are gone before the breaker reacts. A small run of failures (or a failure <i>rate</i> over a short window) is the usual setting in Resilience4j and Envoy.',
    'After opening, the breaker waits, then goes <b>half-open</b> and lets one probe through. Probe every second and you hammer a service that is trying to recover; probe every minute and users go without the feature long after it is back.',
  ],
  walkthrough: [
    { id: 'open', target: '#cb-switch', text: 'Recommendations is failing and threads are filling up. Click the breaker to open it.' },
    { id: 'probe', target: '#cb-probe', text: 'Open: the page no longer waits on recommendations. Click Probe to test whether the service is back.' },
  ],
  minTimeMs: RULES['circuit-breaker'].minTimeMs,
  parMs: RULES['circuit-breaker'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'A circuit breaker wraps calls to a dependency and tracks failures. <b>Closed</b>: calls pass through. <b>Open</b>: calls fail immediately (or use a fallback) for a while. <b>Half-open</b>: a few trial calls go through; success closes the breaker, failure opens it again.',
      'Breakers work best with three friends: <b>timeouts</b> short enough that one slow call can’t hold a thread for long, <b>bulkheads</b> that give each dependency its own small pool of threads so one bad dependency can’t take them all, and <b>fallbacks</b> that keep the page useful when a feature is off.',
      'Modern systems often put this logic in a service mesh (Envoy’s outlier detection ejects failing hosts) or in client libraries (Resilience4j, Polly). The idea is the same: fail fast, protect your own resources, and give the dependency room to recover.',
    ],
    diagram,
    caption: 'The breaker opens after repeated failures, waits, then probes.',
    links: [
      { label: 'Martin Fowler: CircuitBreaker', url: 'https://martinfowler.com/bliki/CircuitBreaker.html' },
      { label: 'Resilience4j docs: CircuitBreaker (slow-call and failure-rate thresholds)', url: 'https://resilience4j.readme.io/docs/circuitbreaker' },
      { label: 'Microsoft Azure Architecture Center: Circuit Breaker pattern', url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker' },
    ],
  },
};
