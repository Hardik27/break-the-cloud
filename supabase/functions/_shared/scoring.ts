/**
 * Scoring, shared by the browser (live points) and the finish-run Edge Function (the score that counts).
 *
 * Per real task (the tutorial is a flat bonus):
 *   base       200 for clearing it
 *   speed      up to 300: full at or under par time, falling to 0 at twice par
 *   flawless   100 if you made no mistakes
 *   combo      +10, +20 … up to +80 for each good move in a row (capped at 400 per task)
 *   mistakes   −25 each
 * Grades per task: S (no mistakes, at or under par), A, B, C. Stars from grades.
 */
export const TUTORIAL_POINTS = 100;
export const BASE_POINTS = 200;
export const SPEED_MAX = 300;
export const FLAWLESS_POINTS = 100;
export const MISTAKE_POINTS = 25;
export const COMBO_STEP = 10;
export const COMBO_MAX_MULT = 8;
export const COMBO_CAP_PER_TASK = 400;

export type Grade = 'S' | 'A' | 'B' | 'C';

export interface TaskInput {
  /** Time spent on this task (ms). */
  ms: number;
  mistakes: number;
  /** Combo points earned during the task (client-reported, capped). */
  comboPoints: number;
}

export interface TaskScore {
  base: number;
  speed: number;
  flawless: number;
  combo: number;
  penalty: number;
  total: number;
  grade: Grade;
}

/** Points for the n-th good move in a row (n starts at 1). */
export const comboPointsFor = (n: number): number => COMBO_STEP * Math.min(Math.max(1, n), COMBO_MAX_MULT);

export function gradeFor(ms: number, mistakes: number, parMs: number): Grade {
  if (mistakes === 0 && ms <= parMs) return 'S';
  if (mistakes <= 1 && ms <= parMs * 1.5) return 'A';
  if (mistakes <= 4 && ms <= parMs * 3) return 'B';
  return 'C';
}

export function scoreTask(t: TaskInput, parMs: number): TaskScore {
  const ratio = parMs > 0 ? (2 * parMs - t.ms) / parMs : 1;
  const speed = Math.round(SPEED_MAX * Math.min(1, Math.max(0, ratio)));
  const flawless = t.mistakes === 0 ? FLAWLESS_POINTS : 0;
  const combo = Math.min(COMBO_CAP_PER_TASK, Math.max(0, Math.round(t.comboPoints)));
  const penalty = MISTAKE_POINTS * t.mistakes;
  const total = Math.max(0, BASE_POINTS + speed + flawless + combo - penalty);
  return { base: BASE_POINTS, speed, flawless, combo, penalty, total, grade: gradeFor(t.ms, t.mistakes, parMs) };
}

/** Stars for a finished run, from the grades of its real tasks. */
export function starsFor(grades: Grade[]): 1 | 2 | 3 {
  const good = grades.filter((g) => g === 'S' || g === 'A').length;
  if (good === grades.length) return 3;
  if (good * 2 >= grades.length) return 2;
  return 1;
}

export interface RunScore {
  tasks: TaskScore[];
  total: number;
  stars: 1 | 2 | 3;
  grades: Grade[];
}

/** tasks[0] is the tutorial (flat bonus); tasks[1..] are scored. */
export function scoreRun(tasks: TaskInput[], parMs: number[]): RunScore {
  const scored = tasks.slice(1).map((t, i) => scoreTask(t, parMs[i + 1]));
  const grades = scored.map((s) => s.grade);
  const total = TUTORIAL_POINTS + scored.reduce((a, s) => a + s.total, 0);
  return { tasks: scored, total, stars: starsFor(grades), grades };
}

/** Career titles by total points (sum of your best score in every game). */
export const RANKS: { min: number; title: string }[] = [
  { min: 0, title: 'Intern' },
  { min: 1000, title: 'Junior SRE' },
  { min: 2500, title: 'SRE' },
  { min: 4500, title: 'Senior SRE' },
  { min: 7000, title: 'Staff Engineer' },
  { min: 10000, title: 'Principal Chaos Engineer' },
];

export function rankFor(points: number): { title: string; next: { title: string; min: number } | null; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && points >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1] ?? null;
  const progress = next ? (points - RANKS[i].min) / (next.min - RANKS[i].min) : 1;
  return { title: RANKS[i].title, next, progress: Math.max(0, Math.min(1, progress)) };
}
