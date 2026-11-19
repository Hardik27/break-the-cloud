/**
 * Per-game rules shared by the browser and the finish-run Edge Function (single source of truth).
 * Index 0 is always the tutorial.
 *   minTimeMs  fastest humanly possible time per task (anti-cheat floor)
 *   parMs      "good" time per task: at or under par earns the full speed bonus
 */
export interface GameRules {
  tasks: number;
  minTimeMs: number[];
  parMs: number[];
}

export const RULES: Record<string, GameRules> = {
  autoscaler: { tasks: 4, minTimeMs: [0, 28000, 2000, 2000], parMs: [0, 33000, 14000, 16000] },
  backpressure: { tasks: 4, minTimeMs: [0, 8000, 10000, 2000], parMs: [0, 23000, 32000, 14000] },
  'blast-radius': { tasks: 4, minTimeMs: [0, 5000, 18000, 2000], parMs: [0, 20000, 23000, 16000] },
  'cache-hit': { tasks: 4, minTimeMs: [0, 10000, 2000, 11000], parMs: [0, 28000, 10000, 16000] },
  'circuit-breaker': { tasks: 4, minTimeMs: [0, 28000, 2000, 2000], parMs: [0, 33000, 12000, 14000] },
  'dns-detective': { tasks: 5, minTimeMs: [0, 4000, 5000, 3000, 2000], parMs: [0, 21000, 25000, 18000, 16000] },
  handshake: { tasks: 5, minTimeMs: [0, 3000, 2500, 4000, 2000], parMs: [0, 16000, 13000, 17000, 15000] },
  heartbeat: { tasks: 4, minTimeMs: [0, 12000, 2000, 2000], parMs: [0, 19000, 12000, 14000] },
  'latency-budget': { tasks: 4, minTimeMs: [0, 2000, 5000, 6000], parMs: [0, 17000, 19000, 19000] },
  partition: { tasks: 4, minTimeMs: [0, 6000, 4000, 4000], parMs: [0, 21000, 21000, 15000] },
  quorum: { tasks: 4, minTimeMs: [0, 6000, 2000, 2000], parMs: [0, 38000, 12000, 12000] },
  'clock-skew': { tasks: 4, minTimeMs: [0, 3000, 4000, 3000], parMs: [0, 22000, 31000, 27000] },
  'two-phase-commit': { tasks: 4, minTimeMs: [0, 6000, 3000, 7000], parMs: [0, 26000, 27000, 28000] },
  saga: { tasks: 4, minTimeMs: [0, 2500, 3500, 2000], parMs: [0, 24000, 34000, 15000] },
  gossip: { tasks: 4, minTimeMs: [0, 4000, 3000, 14000], parMs: [0, 25000, 19000, 17000] },
  'byzantine-generals': { tasks: 4, minTimeMs: [0, 3000, 4000, 3000], parMs: [0, 18000, 23000, 20000] },
  'crdt-merge': { tasks: 4, minTimeMs: [0, 3000, 4000, 4000], parMs: [0, 18000, 28000, 33000] },
  'rate-limiter': { tasks: 4, minTimeMs: [0, 7000, 2000, 2000], parMs: [0, 12000, 14000, 15000] },
  'the-ring': { tasks: 4, minTimeMs: [0, 5000, 5000, 2000], parMs: [0, 22000, 26000, 12000] },
  'thundering-herd': { tasks: 4, minTimeMs: [0, 15000, 2000, 2000], parMs: [0, 27000, 12000, 14000] },
  'traffic-cop': { tasks: 5, minTimeMs: [0, 7000, 12000, 6000, 7000], parMs: [0, 11000, 18000, 12000, 18000] },
  'replica-diff': { tasks: 5, minTimeMs: [0, 1500, 1500, 1500, 3000], parMs: [0, 15000, 15000, 15000, 28000] },
  'retry-storm': { tasks: 4, minTimeMs: [0, 7000, 2000, 2000], parMs: [0, 12000, 12000, 12000] },
  'split-brain': { tasks: 5, minTimeMs: [0, 3000, 4000, 10000, 7000], parMs: [0, 12000, 11000, 17000, 22000] },
};
