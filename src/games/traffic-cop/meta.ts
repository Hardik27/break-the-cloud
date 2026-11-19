import { RULES } from '../../../supabase/functions/_shared/rules.ts';
import type { GameMeta } from '../types';

const box = 'style="fill:var(--panel);stroke:var(--line);stroke-width:1.5"';
const ink = 'style="fill:var(--ink)"';
const mono = 'font-family="IBM Plex Mono, monospace" font-size="12"';
const disp = 'font-family="Archivo, Arial Narrow, sans-serif" font-weight="800" font-size="15"';

const diagram = `<svg viewBox="0 0 520 230" role="img" aria-label="Clients send requests to a load balancer, which spreads them over three servers and probes each with health checks. One server failed its check and gets no traffic.">
  <rect x="10" y="90" width="90" height="50" rx="6" ${box}/><text x="55" y="120" text-anchor="middle" ${disp} ${ink}>clients</text>
  <rect x="170" y="80" width="120" height="70" rx="6" style="fill:var(--ink)"/><text x="230" y="112" text-anchor="middle" ${disp} style="fill:var(--bg)">balancer</text><text x="230" y="132" text-anchor="middle" ${mono} style="fill:var(--bg)">least loaded</text>
  <line x1="100" y1="115" x2="170" y2="115" style="stroke:var(--append);stroke-width:3"/>
  <g ${mono}>
    <rect x="380" y="20" width="120" height="44" rx="6" ${box}/><text x="440" y="47" text-anchor="middle" ${ink}>web-1 · 2/4</text>
    <rect x="380" y="93" width="120" height="44" rx="6" style="fill:var(--bg);stroke:var(--bad);stroke-width:1.5;stroke-dasharray:5 4"/><text x="440" y="120" text-anchor="middle" style="fill:var(--bad)">web-2 · down</text>
    <rect x="380" y="166" width="120" height="44" rx="6" ${box}/><text x="440" y="193" text-anchor="middle" ${ink}>web-3 · 1/4</text>
  </g>
  <line x1="290" y1="100" x2="380" y2="42" style="stroke:var(--append);stroke-width:3"/>
  <line x1="290" y1="130" x2="380" y2="188" style="stroke:var(--append);stroke-width:3"/>
  <line x1="290" y1="115" x2="380" y2="115" style="stroke:var(--muted);stroke-width:1.5;stroke-dasharray:3 4"/>
  <text x="335" y="108" text-anchor="middle" ${mono} style="fill:var(--bad)">✕ /health</text>
  <text x="230" y="185" text-anchor="middle" ${mono} style="fill:var(--muted)">probes every server</text>
  <text x="230" y="200" text-anchor="middle" ${mono} style="fill:var(--muted)">every few seconds</text>
</svg>`;

export const meta: GameMeta = {
  id: 'traffic-cop',
  level: 2,
  title: 'Traffic Cop',
  concept: 'Load balancing',
  intro:
    'A <b>load balancer</b> sits in front of several servers and decides which one handles each request. Each server here can work on <b>4 units</b> at once: a normal request needs 1 unit, a heavy one needs 3. A request sent to a full or crashed server is <b>dropped</b>: a user sees an error. First you route by hand, then you put an algorithm on autopilot and keep it out of trouble.',
  legend: [
    { color: 'var(--append)', shape: 'dot', label: 'Request (needs 1 unit)' },
    { color: 'var(--vote)', shape: 'dot', label: 'Heavy request (needs 3 units)' },
    { color: 'var(--ok)', shape: 'line', label: 'Server load bar (4 units = full)' },
    { color: 'var(--bad)', shape: 'dash', label: 'Crashed server still getting traffic (pull it!)' },
    { color: 'var(--muted)', shape: 'dash', label: 'Out of rotation: the balancer skips it' },
    { color: 'var(--bad)', shape: 'square', label: 'History: request dropped' },
  ],
  howTo: [
    'A short tutorial shows you every click first. The clock starts after it.',
    'Click a server to send it the waiting request. On autopilot, click a server to pull it out of rotation or put it back.',
    'Good moves build a combo. Every dropped request is a mistake and breaks it.',
  ],
  tasks: [
    'Tutorial: route three requests by hand',
    'Rush hour: route 8 in a row by hand',
    'Be the health check: survive two crashes on autopilot',
    'Heavy hitters: override round robin (5 heavy in a row)',
    'Boss wave: pick the right algorithm and survive a crash',
  ],
  lessons: [
    'You just did a load balancer’s job: pick a server for each request, ideally one with room. Real balancers such as NGINX and the AWS Application Load Balancer (ALB) make this choice millions of times a second, so they follow simple rules instead of a person.',
    'Routing by hand works only while you can keep up, and you had to read every load bar to do it well. That is exactly what algorithms automate. Every production balancer (HAProxy, NGINX, Envoy) ships a few of them.',
    'You were the <b>health check</b>. Round robin is blind: it kept sending every third request to the dead server until you pulled it. Real balancers probe each server every few seconds (for example <code>GET /health</code>) and pull it after a few failures; AWS ALB calls these target-group health checks.',
    'Round robin hands out requests in turn and ignores how busy each server is, so heavy work that arrives in a rhythm lands on the same full machine. You fixed it by checking the load bars first. That rule has a name: <b>least-loaded</b> (NGINX calls it <code>least_conn</code>).',
    'Least loaded beat round robin, until a server died. A dead server has no work, so it looks like the <i>least loaded</i> server of all, and requests poured into it. That is why real balancers always pair least-loaded with health checks.',
  ],
  walkthrough: [
    { id: 'route-1', target: '[data-srv="0"]', text: 'A request is waiting in the request box. Click web-1 to send it there.' },
    { id: 'route-2', target: '[data-srv="1"]', text: 'web-1 is now 1 of 4 units busy (see its bar). Send the next request to web-2.' },
    { id: 'route-heavy', target: '[data-srv="2"]', text: 'This request is heavy (orange): it needs 3 free units. Click web-3.' },
  ],
  minTimeMs: RULES['traffic-cop'].minTimeMs,
  parMs: RULES['traffic-cop'].parMs,
  learnMore: {
    paragraphs: [
      'A load balancer spreads requests over a pool of servers, so no single machine is overwhelmed and one dead machine does not take the service down. Layer 4 balancers route TCP connections by address and port. Layer 7 balancers understand HTTP, so they can also route by path or header.',
      'Algorithms trade simplicity for information. Round robin needs no information at all. Least-loaded (least connections) must track live requests on every server. A neat middle ground is the <b>power of two choices</b>: pick two servers at random and send the request to the less busy one. It gets most of the benefit of least-loaded with far less bookkeeping.',
      'Health checks decide which servers are in the pool. Active checks send a probe (for example <code>GET /health</code> every 10 s, and remove the server after 2 failures). Passive checks watch real traffic for errors. Tuning them is a trade-off you will meet again in Heartbeat: too slow and users hit dead servers, too eager and a short pause evicts a healthy one.',
    ],
    diagram,
    caption: 'A balancer routes each request to a healthy server and probes every server in the background. web-2 failed its check, so it gets no traffic.',
    links: [
      { label: 'NGINX docs: HTTP load balancing (round robin, least_conn, health checks)', url: 'https://nginx.org/en/docs/http/load_balancing.html' },
      { label: 'AWS docs: health checks for Application Load Balancer target groups', url: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html' },
      { label: 'Mitzenmacher: The Power of Two Choices in Randomized Load Balancing (PhD thesis)', url: 'https://www.eecs.harvard.edu/~michaelm/postscripts/mythesis.pdf' },
    ],
  },
};
