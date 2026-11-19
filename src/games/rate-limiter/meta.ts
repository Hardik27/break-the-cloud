import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';
import { hints, learn, pager } from './learn';

const mono = 'font-family="IBM Plex Mono, monospace" font-size="11"';
const diagram = `<svg viewBox="0 0 520 200" role="img" aria-label="A token bucket: tokens drip in at a fixed rate up to the bucket size. Each request takes a token; with no token left, the request gets 429 Too Many Requests.">
  <text x="130" y="18" text-anchor="middle" ${mono} style="fill:var(--muted)">refill: rate tokens / s</text>
  <circle cx="130" cy="36" r="6" style="fill:var(--vote)"/><circle cx="130" cy="56" r="6" style="fill:var(--vote)"/>
  <path d="M80,70 L80,170 L180,170 L180,70" style="fill:none;stroke:var(--ink);stroke-width:2.5"/>
  ${[0, 1, 2, 3].map((k) => `<circle cx="${102 + (k % 2) * 28}" cy="${155 - Math.floor(k / 2) * 24}" r="9" style="fill:var(--vote)"/>`).join('')}
  <text x="130" y="190" text-anchor="middle" ${mono} style="fill:var(--muted)">size = burst</text>
  <line x1="190" y1="120" x2="300" y2="120" style="stroke:var(--ok);stroke-width:2.5"/><text x="245" y="112" text-anchor="middle" ${mono} style="fill:var(--ok)">token? → 200 OK</text>
  <rect x="300" y="100" width="90" height="40" rx="6" style="fill:var(--ink)"/><text x="345" y="124" text-anchor="middle" ${mono} style="fill:var(--bg)">API</text>
  <line x1="190" y1="160" x2="300" y2="185" style="stroke:var(--bad);stroke-width:2;stroke-dasharray:5 4"/><text x="400" y="190" text-anchor="middle" ${mono} style="fill:var(--bad)">no token → 429</text>
</svg>`;

export const meta: GameMeta = {
  id: 'rate-limiter',
  level: 2,
  title: 'Rate Limiter',
  concept: 'Token buckets and 429s',
  intro:
    'An API can only answer so many requests per second. If a bot floods it, everyone gets errors, including paying customers. A <b>rate limiter</b> answers excess requests with <b>429 Too Many Requests</b> instead of letting them in. The classic design is a <b>token bucket</b>: each client has a bucket of tokens that refills at a steady <b>rate</b>, up to a maximum (the <b>burst</b>); each request spends one token.',
  legend: [
    { color: 'var(--ok)', shape: 'square', label: 'Paying customer' },
    { color: 'var(--muted)', shape: 'square', label: 'Free user' },
    { color: 'var(--bad)', shape: 'square', label: 'Bot (scraper-9000)' },
    { color: 'var(--vote)', shape: 'dot', label: 'Token: one request’s worth of permission' },
  ],
  howTo: [
    'A short tutorial shows you how to block a request. The clock starts after it.',
    'Tap bot requests before they reach the API. Later, set rate limits and press Run.',
    'Every bot you stop builds a combo. Blocking a real user, or letting the API overload, costs points.',
  ],
  tasks: [
    'Tutorial: block two bot requests',
    'Be the bouncer: block 15 bot requests',
    'Tune a token bucket for each client',
    'Protect paying tenants from a noisy one',
  ],
  lessons: [
    'Blocking a request early is cheap: it never touches your database. Real APIs do this at the edge, before any work happens, and answer with HTTP status <b>429</b> plus a <code>Retry-After</code> header.',
    'Blocking by hand works for one bot, for a minute. Real traffic needs a rule that runs on every request, keyed by who is calling (an API key, a user, an IP address). That rule is a rate limiter.',
    'The <b>burst</b> let a real person’s page load (6 requests at once) through, and the <b>rate</b> held the bot to a trickle. Stripe, GitHub and AWS API Gateway all use token buckets: a burst size plus a steady rate, per client.',
    'One shared limit means one noisy tenant can use it all up. <b>Per-tenant</b> buckets, with bigger limits for paying tiers, keep each customer’s experience independent of the others. This is called <b>fairness</b> or isolation, and it is the heart of every multi-tenant cloud service.',
  ],
  walkthrough: [
    { id: 'bot1', target: '[data-chip-slot="0"]', text: 'Red requests come from a bot flooding your API. Click the highlighted bot request to block it.' },
    { id: 'bot2', target: '[data-chip-slot="1"]', text: 'Blocked: it got a 429 and never reached the API. Block the other bot request too.' },
  ],
  minTimeMs: RULES['rate-limiter'].minTimeMs,
  parMs: RULES['rate-limiter'].parMs,
  pager,
  learn,
  hints,
  learnMore: {
    paragraphs: [
      'A <b>token bucket</b> allows short bursts while enforcing an average rate: the bucket size caps the burst, the refill rate caps the long-run average. A <b>leaky bucket</b> instead smooths traffic to a constant outflow. Fixed and sliding <b>windows</b> count requests per minute; they are simpler, but allow double bursts at window edges.',
      'Where you key the limit matters as much as the numbers. Per IP address is easy but unfair behind shared networks (a whole university can share one IP). Per API key or per tenant is fairer. Large systems layer several limits: per user, per tenant and a global safety limit to protect the service itself.',
      'In a fleet of servers, limits must be shared: each server can’t keep its own private bucket or a client could get N times the limit. Common answers are a central counter in Redis, or giving each server a slice of the budget. Clients should back off when they see 429, which you will meet in Retry Storm.',
    ],
    diagram,
    caption: 'Tokens drip in at the rate, up to the burst size. No token, no entry: 429.',
    links: [
      { label: 'Stripe Engineering: Scaling your API with rate limiters', url: 'https://stripe.com/blog/rate-limiters' },
      { label: 'AWS docs: Throttle requests to your REST APIs (API Gateway token bucket)', url: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html' },
      { label: 'RFC 6585: HTTP status code 429 Too Many Requests', url: 'https://www.rfc-editor.org/rfc/rfc6585#section-4' },
    ],
  },
};
