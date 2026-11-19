/**
 * Server-side checks for a finished run. Pure TypeScript, so it runs in the Deno Edge Function
 * and in Vitest. The server measures the run's real duration (serverMs) from its own clock.
 */
import { RULES } from './rules.ts';
import { COMBO_CAP_PER_TASK, scoreRun, type RunScore } from './scoring.ts';

export interface FinishPayload {
  /** Elapsed clock time (ms) at the moment each task finished; index 0 (tutorial) is 0. */
  taskMs: number[];
  mistakes: number[];
  comboPoints: number[];
  /** Time added to the clock as penalties (ms). */
  penaltyMs: number;
  moves: number;
}

export type Verdict = ({ ok: true; ms: number } & RunScore) | { ok: false; reason: string };

/** How far the client's clock may drift from the server's (network latency, tab throttling). */
export const SLACK_MS = 4000;
export const SLACK_FRACTION = 0.08;

const isInt = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export function validateRun(gameId: string, serverMs: number, p: FinishPayload): Verdict {
  const rules = RULES[gameId];
  if (!rules) return { ok: false, reason: 'unknown game' };
  const n = rules.tasks;
  if (!p || !Array.isArray(p.taskMs) || !Array.isArray(p.mistakes) || !Array.isArray(p.comboPoints)) return { ok: false, reason: 'bad payload' };
  if (p.taskMs.length !== n || p.mistakes.length !== n || p.comboPoints.length !== n) return { ok: false, reason: 'wrong number of tasks' };
  if (!isInt(p.moves, 0, 5000) || !isInt(p.penaltyMs, 0, 600_000)) return { ok: false, reason: 'bad moves or penalty' };
  if (p.taskMs[0] !== 0) return { ok: false, reason: 'tutorial must end at 0' };
  for (let i = 0; i < n; i++) {
    if (!isInt(p.taskMs[i], 0, 3_600_000)) return { ok: false, reason: `bad time for task ${i + 1}` };
    if (!isInt(p.mistakes[i], 0, 500)) return { ok: false, reason: `bad mistakes for task ${i + 1}` };
    if (!isInt(p.comboPoints[i], 0, COMBO_CAP_PER_TASK)) return { ok: false, reason: `bad combo for task ${i + 1}` };
  }
  const durations = p.taskMs.map((t, i) => (i === 0 ? 0 : t - p.taskMs[i - 1]));
  for (let i = 1; i < n; i++) {
    if (durations[i] < rules.minTimeMs[i]) return { ok: false, reason: `task ${i + 1} finished impossibly fast` };
  }
  const clientMs = p.taskMs[n - 1];
  const realClientMs = clientMs - p.penaltyMs;
  const slack = SLACK_MS + SLACK_FRACTION * serverMs;
  if (realClientMs > serverMs + slack) return { ok: false, reason: 'client clock ran ahead of the server' };
  if (realClientMs < serverMs - slack) return { ok: false, reason: 'client reported less time than the server measured' };
  const score = scoreRun(
    durations.map((ms, i) => ({ ms, mistakes: p.mistakes[i], comboPoints: p.comboPoints[i] })),
    rules.parMs,
  );
  return { ok: true, ms: clientMs, ...score };
}
