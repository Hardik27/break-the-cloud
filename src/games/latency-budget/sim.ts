/**
 * Latency Budget: distance, round trips and CDN edges. Pure simulation, no DOM.
 *
 * Round-trip time (RTT) comes from great-circle distance: light in fibre covers about 200 km per ms,
 * and real routes are about 1.6× longer than a straight line. Loading a page over a new HTTPS
 * connection costs about 3 round trips (TCP handshake, TLS handshake, the request itself).
 *
 * Tasks:
 *   0 tutorial    look at a user, move the server, look again
 *   1 one server  place the only server so most of the world loads fast
 *   2 edges       with the origin in Virginia, place CDN edges so every user loads static pages fast
 *   3 cacheable   decide which requests an edge can answer, and which must go to the origin
 */
export interface Place { id: string; name: string; lat: number; lon: number }

export const USERS: (Place & { people: number })[] = [
  { id: 'newyork', name: 'New York', lat: 40.7, lon: -74.0, people: 18 },
  { id: 'saopaulo', name: 'São Paulo', lat: -23.5, lon: -46.6, people: 10 },
  { id: 'london', name: 'London', lat: 51.5, lon: -0.1, people: 14 },
  { id: 'lagos', name: 'Lagos', lat: 6.5, lon: 3.4, people: 8 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.1, lon: 72.9, people: 16 },
  { id: 'singapore', name: 'Singapore', lat: 1.35, lon: 103.8, people: 8 },
  { id: 'tokyo', name: 'Tokyo', lat: 35.7, lon: 139.7, people: 14 },
  { id: 'sydney', name: 'Sydney', lat: -33.9, lon: 151.2, people: 6 },
];

export const SITES: Place[] = [
  { id: 'us-west', name: 'Oregon', lat: 45.6, lon: -121.2 },
  { id: 'us-east', name: 'Virginia', lat: 38.9, lon: -77.4 },
  { id: 'sa-east', name: 'São Paulo', lat: -23.5, lon: -46.6 },
  { id: 'eu-west', name: 'Ireland', lat: 53.3, lon: -6.3 },
  { id: 'eu-central', name: 'Frankfurt', lat: 50.1, lon: 8.7 },
  { id: 'af-west', name: 'Lagos', lat: 6.5, lon: 3.4 },
  { id: 'af-south', name: 'Cape Town', lat: -33.9, lon: 18.4 },
  { id: 'me-central', name: 'Dubai', lat: 25.2, lon: 55.3 },
  { id: 'ap-south', name: 'Mumbai', lat: 19.1, lon: 72.9 },
  { id: 'ap-southeast', name: 'Singapore', lat: 1.35, lon: 103.8 },
  { id: 'ap-northeast', name: 'Tokyo', lat: 35.7, lon: 139.7 },
  { id: 'ap-sydney', name: 'Sydney', lat: -33.9, lon: 151.2 },
];

export const site = (id: string): Place => SITES.find((s) => s.id === id)!;
export const user = (id: string) => USERS.find((u) => u.id === id)!;

const R = 6371;
export function km(a: Place, b: Place): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Round trip in ms: 1.6× route inflation, 200 km/ms in fibre, plus 2 ms of local network. */
export const rtt = (a: Place, b: Place): number => Math.round((2 * km(a, b) * 1.6) / 200 + 2);
export const ROUND_TRIPS = 3;
export const SERVER_MS = 20;
/** Time to load a page from a server: 3 round trips plus the server's own work. */
export const loadMs = (u: Place, s: Place): number => ROUND_TRIPS * rtt(u, s) + SERVER_MS;

export interface Served { ms: number; from: string }
/** Static content comes from the closest of the origin and any edges. */
export function staticLoad(u: Place, origin: string, edges: string[]): Served {
  let best: Served = { ms: loadMs(u, site(origin)), from: origin };
  for (const e of edges) {
    const ms = loadMs(u, site(e));
    if (ms < best.ms) best = { ms, from: e };
  }
  return best;
}

// ---------- task 1: one server ----------
export const ONE_SERVER_GOAL_MS = 300;
export const ONE_SERVER_GOAL_PEOPLE = 40;
export const TOTAL_PEOPLE = USERS.reduce((a, u) => a + u.people, 0);
/** People (out of TOTAL_PEOPLE) whose page loads under the goal with a single server at `origin`. */
export const fastPeople = (origin: string): number => USERS.filter((u) => loadMs(u, site(origin)) < ONE_SERVER_GOAL_MS).reduce((a, u) => a + u.people, 0);
export const oneServerOk = (origin: string): boolean => fastPeople(origin) >= ONE_SERVER_GOAL_PEOPLE;

// ---------- task 2: CDN edges (a coverage puzzle) ----------
export const EDGE_ORIGIN = 'us-east';
export const EDGE_GOAL_MS = 150;
export const EDGE_BUDGET = 3;
/** Distance (km) within which an edge loads a page under the goal: 3 × RTT + server time < 150 ms. */
export const EDGE_REACH_KM = Math.floor((((EDGE_GOAL_MS - SERVER_MS) / ROUND_TRIPS - 2) * 200) / 2 / 1.6);

export interface EdgeRound { title: string; story: string; people: Record<string, number>; goal: number }
const basePeople = Object.fromEntries(USERS.map((u) => [u.id, u.people]));
export const EDGE_ROUNDS: EdgeRound[] = [
  { title: 'Launch day', story: 'Three edges, eight cities. Cover as many people as you can.', people: basePeople, goal: 62 },
  { title: 'Brazil goes viral', story: 'A campaign in Brazil worked: São Paulo now has 30M users. Same budget: three edges.', people: { ...basePeople, saopaulo: 30 }, goal: 78 },
];
export const fastCities = (edges: string[]): string[] => USERS.filter((u) => staticLoad(u, EDGE_ORIGIN, edges).ms < EDGE_GOAL_MS).map((u) => u.id);
export const coveredPeople = (edges: string[], round: EdgeRound): number => fastCities(edges).reduce((a, id) => a + round.people[id], 0);
export const roundPeople = (round: EdgeRound): number => Object.values(round.people).reduce((a, b) => a + b, 0);
export const edgeRoundOk = (edges: string[], round: EdgeRound): boolean => edges.length <= EDGE_BUDGET && coveredPeople(edges, round) >= round.goal;
/** Cities that an edge at `id` would bring under the goal that are not under it yet. */
export const edgeGains = (edges: string[], id: string): string[] => {
  const before = new Set(fastCities(edges));
  return fastCities([...edges, id]).filter((c) => !before.has(c));
};
/** Best possible coverage with the budget (for tests and tuning). */
export function bestCoverage(round: EdgeRound): number {
  const ids = SITES.map((x) => x.id);
  let best = 0;
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) for (let c = b + 1; c < ids.length; c++) best = Math.max(best, coveredPeople([ids[a], ids[b], ids[c]], round));
  return best;
}

// ---------- task 3: what can an edge cache? ----------
export interface Req { path: string; detail: string; edge: boolean; why: string }
export const REQUESTS: Req[] = [
  { path: '/logo.png', detail: 'same image for everyone', edge: true, why: 'Identical for every user, so any edge can keep a copy.' },
  { path: '/cart', detail: 'your shopping cart', edge: false, why: 'Personalised: every user has a different cart. Caching it would show one person’s cart to another.' },
  { path: '/app.js?v=42', detail: 'versioned JavaScript', edge: true, why: 'The version is in the URL, so the file never changes. Cache it for a year.' },
  { path: '/api/me', detail: 'your profile (needs login)', edge: false, why: 'Private data tied to a login. It must come from the origin (Cache-Control: private).' },
  { path: '/fonts/plex.woff2', detail: 'web font', edge: true, why: 'A static file shared by every page and user.' },
  { path: 'POST /checkout', detail: 'places your order', edge: false, why: 'A write. It changes data, so it must reach the origin every time.' },
  { path: '/index.html', detail: 'homepage, max-age=60', edge: true, why: 'The same for everyone and the server allows 60 s of caching, so edges can serve it.' },
  { path: '/api/stock', detail: 'live stock counts', edge: false, why: 'Changes every second and is needed fresh: caching would sell items that are gone.' },
];
