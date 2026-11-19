# Break the Cloud — project rules

An educational website for engineering students: learn cloud and distributed-systems concepts by playing short, timed games that ask you to *break* a system and then explain why it broke. Beginner (load balancing) to advanced (Raft, Byzantine faults, CRDTs).

The source of truth for the look and two working games is `reference/`. The source of truth for what to build is `docs/curriculum.md`.

## Stack (do not change without asking)

- Vite + TypeScript, no UI framework. Each game is a plain TS module that renders into a DOM element.
- Simulations are pure TypeScript with no DOM access (`src/games/<id>/sim.ts`), so they can be unit-tested and fuzzed.
- Supabase for the leaderboard and play counts (Postgres + Row Level Security + anonymous sign-in + one Edge Function).
- Deployed as a static site (GitHub Pages or Cloudflare Pages). Hash routing (`#/play/raft`), so no server routing is needed.
- Tests: Vitest (simulation logic) and Playwright (every game played end to end in a real browser).

## Folder layout

```
src/
  main.ts                 router, boots shell
  shell/                  home page, play page, HUD (timer, moves, tasks), result card, coach, leaderboard UI
  shell/coach.ts          the walkthrough system (see "Walkthrough" below)
  lib/leaderboard.ts      Supabase client: startRun(), finishRun(), top(gameId)
  lib/storage.ts          localStorage wrapper, every call in try/catch
  styles/tokens.css       design tokens, copied from reference/ (light + dark)
  games/<id>/sim.ts       pure simulation: state, step(dt), actions, checks
  games/<id>/view.ts      rendering + input; implements the Game contract
  games/<id>/meta.ts      title, level, concept, tasks[], lessons[], walkthrough steps
  games/registry.ts       list of all games in curriculum order
supabase/
  migrations/             SQL: tables, RLS policies
  functions/finish-run/   Edge Function that validates and records a run
tests/
  unit/                   vitest, one file per sim
  e2e/                    playwright, one solver per game
public/privacy.html is NOT used; privacy is a route (#/privacy)
```

## Design system (keep it exactly like reference/split-brain.html)

- Fonts: Archivo (display, `font-stretch:125%`, weight 800–900) for headings and server names; IBM Plex Sans for body; IBM Plex Mono for labels, numbers, HUD, eyebrows. Load from Google Fonts.
- Background: graph paper (28px grid lines on `--bg`). Panels are flat cards with 1px `--line` border, 6px radius, no gradients, no heavy shadows.
- Accent orange `--accent` (#D9480F light / #FF7036 dark) for the one thing to look at. Semantic colours: `--ok` green, `--bad` red, `--vote` amber, `--append` blue. Copy every token from `reference/`, including the dark-mode block.
- Eyebrow labels: mono, 11px, uppercase, letter-spacing .08em, `--muted`.
- Lessons appear in a block with a green left border (`.lesson` in reference).
- Mobile: must work at 390px wide with no horizontal page scroll. Stage stacks above the sidebar under 880px.

## The Game contract

```ts
interface GameMeta { id: string; level: number; title: string; concept: string;
  tasks: string[]; lessons: string[]; walkthrough: CoachStep[]; minTimeMs: number[];
  intro: string; legend: LegendItem[]; howTo: string[]; learnMore: LearnMore }
interface GameApi {                // provided by the shell
  start(): void; move(n?: number): void; task(i: number): void; penalty(ms: number): void;
  coach: Coach; toast(msg: string): void; side: HTMLElement;
  onBegin(cb: () => void): void;   // student pressed Start: the game then calls coach.tutorial(meta.walkthrough, onDone)
  readonly seed: number;           // seed for the sim's RNG; #/play/<id>?seed=N makes runs reproducible in tests
  readonly finished: boolean }
interface Game { mount(stage: HTMLElement, api: GameApi): () => void }   // returns unmount
```

The full types live in `src/games/types.ts`. The shell owns the timer, moves, task list, lessons, result card and leaderboard. A game only reports events. The clock starts automatically when task 0 (the tutorial) is reported done.

## Walkthrough (the most important UX rule)

A student must never be on screen without knowing what to click next. The v1 build failed this: a student pressed Start, clicked a server, nothing happened, and there was no explanation.

- Every game has a **coach bar** directly above the stage. It always shows one sentence: the next action, in the imperative ("Click a server with free space"). It turns orange when the student must act and grey when they should watch.
- The **first task of every game is a guided tutorial**: a spotlight (dim everything except the target element), an arrow or pulse on the target, and the coach text. It advances only when the student performs the action. A "Skip tutorial" link exists. The clock does not run during the tutorial; it starts on the first real task.
- Every interactive element gives feedback on every click. If a click is not allowed right now, show a toast that says why and what to do instead. Silent clicks are bugs.
- Before Start, the side panel shows: the concept in 3–4 sentences, a labelled legend of what is on screen, and "How to play" in 3 bullets.
- After each task, show the lesson (2–3 sentences, the real-world mechanism, one real system that uses it, e.g. "AWS ALB", "etcd", "Cassandra").
- Each game has a "Learn more" panel after completion: the concept in more depth, one diagram, and 2–3 links to primary sources (papers, official docs).

## Rendering rule (prevents the v1 click bug)

Never rebuild interactive DOM nodes inside the animation loop. Create buttons and SVG nodes once; in each frame only update attributes, text and styles. Use `pointerdown` for time-critical game clicks. A Playwright test must click with a real mouse (`mouse.down`, wait 120 ms, `mouse.up`) to prove clicks land while the game is animating.

## Leaderboard and anti-cheat

- Anonymous Supabase sign-in on first visit (no email). The player picks a nickname (3–20 chars, filtered for profanity, no URLs).
- `runs` table: id, user_id, game_id, started_at (server time), finished_at, ms, moves, client_version. `scores` view: best run per user per game.
- `startRun(gameId)` inserts a row with server `started_at` and returns its id. `finishRun(runId, moves, taskTimes[])` calls the Edge Function, which computes `ms` from server timestamps, rejects runs faster than `sum(minTimeMs)` or with impossible task timing, and marks the run finished.
- RLS: anyone can read finished runs and nicknames; a user can insert only their own runs; nobody can update `ms` from the client.
- Per-game leaderboard: top 20 all-time, top 20 this week, and "your rank". Also store play counts (runs started, runs finished per game) for a public stats line on the home page.
- If Supabase is unreachable, the game still works and the best time is saved locally.

## Privacy and cookies

- No ad or tracking cookies. Supabase stores its auth session in localStorage; that is strictly necessary for the leaderboard and is disclosed.
- If analytics are added, use a cookieless tool (Plausible or Cloudflare Web Analytics). No consent banner should be needed for strictly-necessary storage, but show a one-time dismissible notice linking to `#/privacy`.
- `#/privacy` explains: what is stored locally, what is stored on the leaderboard (nickname, times, anonymous id), fonts from Google, how to delete your data (a "Delete my data" button that deletes the user's runs via RLS and clears local storage).

## Definition of done for every game

1. `sim.ts` has unit tests for every task's success condition, and for every failure the lesson relies on (e.g. round robin really does drop heavy requests).
2. A Playwright solver completes every task with real mouse clicks, at desktop (1280×900) and phone (390×844) sizes, with zero console errors.
3. A Playwright test confirms the coach bar text changes for each tutorial step.
4. No horizontal scroll at 390px. Keyboard reachable (Tab + Enter) for every control.
5. Difficulty tuned by simulation: a correct strategy finishes each task in 10–40 s at the median; a wrong strategy usually fails. Put the tuning script in `tests/tuning/`.
6. Light and dark mode both checked with screenshots in `tests/e2e/__screenshots__/`.

## Working style

- Build in milestones (see docs/curriculum.md). Commit after each milestone with all tests passing.
- Run `npm test` and `npm run e2e` before saying anything works. Never claim a game works without the Playwright solver passing.
- Keep copy plain and short. Write for a second-year engineering student. Define each term the first time it appears.
