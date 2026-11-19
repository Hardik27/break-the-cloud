/** The Game contract (see CLAUDE.md). The shell owns timer, moves, tasks, lessons and results; a game only reports events. */

/** One step of the guided tutorial (task 1 of every game). */
export interface CoachStep {
  /** The game calls coach.did(id) when the student performs this step's action. */
  id: string;
  /** CSS selector for the element to spotlight. */
  target: string;
  /** One imperative sentence, plain text. */
  text: string;
}

export interface LegendItem {
  /** CSS colour, usually a token like var(--ok). */
  color: string;
  shape: 'dot' | 'square' | 'ring' | 'dash' | 'line';
  label: string;
}

export interface LearnMore {
  paragraphs: string[];
  /** Inline SVG markup using CSS variables, so it works in light and dark mode. */
  diagram: string;
  caption: string;
  links: { label: string; url: string }[];
}

export interface GameMeta {
  id: string;
  level: number;
  title: string;
  /** Short concept name, e.g. "Load balancing". */
  concept: string;
  /** The concept in 3–4 sentences, shown before Start. */
  intro: string;
  legend: LegendItem[];
  /** Exactly 3 bullets. */
  howTo: string[];
  /** Task 1 is always the tutorial. */
  tasks: string[];
  /** One lesson per task, shown when the task is done. */
  lessons: string[];
  walkthrough: CoachStep[];
  /** Fastest plausible time per task (anti-cheat). From supabase/functions/_shared/rules.ts. */
  minTimeMs: number[];
  /** "Good" time per task: at or under par earns the full speed bonus. From the shared rules. */
  parMs: number[];
  learnMore: LearnMore;
}

export type CoachMode = 'act' | 'watch';

export interface Coach {
  /** Set the coach bar: one sentence, the next action. 'act' = orange (do something), 'watch' = grey. Ignored during the tutorial. */
  say(html: string, mode?: CoachMode): void;
  /** Start the spotlight tutorial. onDone runs once, after the last step or when the student skips. */
  tutorial(steps: CoachStep[], onDone: (skipped: boolean) => void): void;
  /** Report that the student did action `id`. Advances the tutorial if it matches the current step. */
  did(id: string): void;
  /** Id of the current tutorial step, or null when no tutorial is running. */
  readonly step: string | null;
  readonly inTutorial: boolean;
}

export interface GameApi {
  /** Start the clock (idempotent). The shell also starts it automatically when task 0 (the tutorial) is done. */
  start(): void;
  /** Count a player move. Ignored while the clock is not running. */
  move(n?: number): void;
  /** Mark task i done. The shell shows its lesson and finishes the run after the last task. */
  task(i: number): void;
  /** Add time to the clock (wrong answers). */
  penalty(ms: number): void;
  /** A good move: builds the combo and earns points. `at` is where to float the "+N". */
  hit(label?: string, at?: Element | null): void;
  /** A mistake (a dropped request, a wrong flag): breaks the combo and costs points. */
  mistake(label?: string, at?: Element | null): void;
  coach: Coach;
  toast(msg: string): void;
  /** Game-owned card in the side panel (task details, progress, buttons). */
  side: HTMLElement;
  /** Register a callback for when the student presses Start. */
  onBegin(cb: () => void): void;
  /** Seed for the game's random numbers (set with ?seed=N in the URL for tests). */
  readonly seed: number;
  readonly finished: boolean;
}

export interface Game {
  /** Render into stage, return an unmount function. */
  mount(stage: HTMLElement, api: GameApi): () => void;
}

export interface GameModule {
  meta: GameMeta;
  game: Game;
}
