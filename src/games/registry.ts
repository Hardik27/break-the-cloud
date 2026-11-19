import type { GameModule } from './types';

export interface Level {
  n: number;
  name: string;
  sub: string;
}

export interface GameEntry {
  id: string;
  level: number;
  title: string;
  concept: string;
  blurb: string;
  /** Present only for built games. */
  load?: () => Promise<GameModule>;
}

export const LEVELS: Level[] = [
  { n: 1, name: 'The Network', sub: 'How a request reaches a server.' },
  { n: 2, name: 'One Service', sub: 'Keeping a single service up.' },
  { n: 3, name: 'Data', sub: 'Copies, caches and where data lives.' },
  { n: 4, name: 'Scale', sub: 'Growing without falling over.' },
  { n: 5, name: 'Reliability', sub: 'Failing gracefully.' },
  { n: 6, name: 'Distributed Data', sub: 'When copies disagree.' },
  { n: 7, name: 'Consensus and Transactions', sub: 'Agreeing when the network lies.' },
  { n: 8, name: 'Advanced', sub: 'Byzantine faults and convergence.' },
];

/** All 24 games in curriculum order (docs/curriculum.md). */
export const GAMES: GameEntry[] = [
  { id: 'dns-detective', level: 1, title: 'DNS Detective', concept: 'DNS resolution and caching', blurb: 'Walk a name lookup from the root down, then watch a stale answer outlive its record.', load: () => import('./dns-detective') },
  { id: 'handshake', level: 1, title: 'Handshake', concept: 'TCP', blurb: 'Open a connection packet by packet, drop one, and put the rest back in order.', load: () => import('./handshake') },
  { id: 'latency-budget', level: 1, title: 'Latency Budget', concept: 'RTT, CDNs and edge caching', blurb: 'Move servers around the planet and place CDN edges until every city loads fast.', load: () => import('./latency-budget') },
  { id: 'traffic-cop', level: 2, title: 'Traffic Cop', concept: 'Load balancing', blurb: 'Route requests across servers by hand, then let an algorithm do it and watch it fail.', load: () => import('./traffic-cop') },
  { id: 'heartbeat', level: 2, title: 'Heartbeat', concept: 'Health checks and failover', blurb: 'Spot dead servers fast, without evicting healthy ones that are only slow.', load: () => import('./heartbeat') },
  { id: 'rate-limiter', level: 2, title: 'Rate Limiter', concept: 'Token buckets and 429s', blurb: 'A bot floods your API. Block it by hand, then protect paying users with token buckets.', load: () => import('./rate-limiter') },
  { id: 'cache-hit', level: 3, title: 'Cache Hit', concept: 'Caching and eviction', blurb: 'A tiny cache, a stream of requests. Keep the hit rate up and the data fresh.', load: () => import('./cache-hit') },
  { id: 'replica-diff', level: 3, title: 'Replica Diff', concept: 'Replication verification', blurb: 'Two copies of a bucket. Find what is different, including what checksums miss.', load: () => import('./replica-diff') },
  { id: 'thundering-herd', level: 3, title: 'Thundering Herd', concept: 'Cache stampedes', blurb: 'One hot key expires and a thousand requests hit the database at once.', load: () => import('./thundering-herd') },
  { id: 'the-ring', level: 4, title: 'The Ring', concept: 'Consistent hashing', blurb: 'Add a server and move as little data as possible.', load: () => import('./the-ring') },
  { id: 'autoscaler', level: 4, title: 'Autoscaler', concept: 'Scaling policies and cost', blurb: 'Meet the morning spike without burning the budget.', load: () => import('./autoscaler') },
  { id: 'backpressure', level: 4, title: 'Backpressure', concept: 'Queues and dead-letter queues', blurb: 'Drain a backlog, then find the poison message that crashes every consumer.', load: () => import('./backpressure') },
  { id: 'retry-storm', level: 5, title: 'Retry Storm', concept: 'Timeouts, backoff and jitter', blurb: 'A slow dependency plus naive retries triples the load. Calm it down.', load: () => import('./retry-storm') },
  { id: 'circuit-breaker', level: 5, title: 'Circuit Breaker', concept: 'Closed, open, half-open', blurb: 'Stop one failing service from taking the whole page down.', load: () => import('./circuit-breaker') },
  { id: 'blast-radius', level: 5, title: 'Blast Radius', concept: 'Zones, regions and cells', blurb: 'Lose a zone, then a region, and keep serving.', load: () => import('./blast-radius') },
  { id: 'partition', level: 6, title: 'Partition', concept: 'CAP', blurb: 'Split the network and choose: reject writes, or accept them and diverge.', load: () => import('./partition') },
  { id: 'quorum', level: 6, title: 'Quorum', concept: 'N, R, W', blurb: 'Pick read and write quorums so every read sees the latest write.', load: () => import('./quorum') },
  { id: 'clock-skew', level: 6, title: 'Clock Skew', concept: 'Lamport and vector clocks', blurb: 'Order events when every clock is wrong.', load: () => import('./clock-skew') },
  { id: 'split-brain', level: 7, title: 'Split Brain', concept: 'Raft consensus', blurb: 'You are the network. Cut links and crash servers to make five servers disagree.', load: () => import('./split-brain') },
  { id: 'two-phase-commit', level: 7, title: 'Two-Phase Commit', concept: 'Atomic commit', blurb: 'Crash the coordinator mid-vote and see who gets stuck holding locks.', load: () => import('./two-phase-commit') },
  { id: 'saga', level: 7, title: 'Saga', concept: 'Compensating actions', blurb: 'Book a trip across four services and undo it cleanly when one fails.', load: () => import('./saga') },
  { id: 'gossip', level: 8, title: 'Gossip', concept: 'Epidemic broadcast', blurb: 'Spread a rumour to 50 nodes and find out why it takes O(log N) rounds.', load: () => import('./gossip') },
  { id: 'byzantine-generals', level: 8, title: 'Byzantine Generals', concept: 'Traitors and 3f+1', blurb: 'Reach agreement when some of the generals lie.', load: () => import('./byzantine-generals') },
  { id: 'crdt-merge', level: 8, title: 'CRDT Merge', concept: 'Convergent data types', blurb: 'Two offline editors, one shopping list, and no lost updates.' },
];

export const findGame = (id: string): GameEntry | undefined => GAMES.find((g) => g.id === id);
export const builtGames = (): GameEntry[] => GAMES.filter((g) => g.load);
