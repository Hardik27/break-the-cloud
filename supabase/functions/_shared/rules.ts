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
  'dns-detective': { tasks: 5, minTimeMs: [0, 4000, 5000, 3000, 2000], parMs: [0, 21000, 25000, 18000, 16000] },
  handshake: { tasks: 5, minTimeMs: [0, 3000, 2500, 4000, 2000], parMs: [0, 16000, 13000, 17000, 15000] },
  'latency-budget': { tasks: 4, minTimeMs: [0, 2000, 5000, 6000], parMs: [0, 17000, 19000, 19000] },
  'traffic-cop': { tasks: 5, minTimeMs: [0, 7000, 12000, 6000, 7000], parMs: [0, 11000, 18000, 12000, 18000] },
  'replica-diff': { tasks: 5, minTimeMs: [0, 1500, 1500, 1500, 3000], parMs: [0, 15000, 15000, 15000, 28000] },
  'split-brain': { tasks: 5, minTimeMs: [0, 3000, 4000, 10000, 7000], parMs: [0, 12000, 11000, 17000, 22000] },
};
