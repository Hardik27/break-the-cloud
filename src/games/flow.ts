/**
 * Shared task flow for game views: tutorial → tasks → between-task pause → done.
 * A view supplies startTask (set up state for task t) and render; the flow handles the rest:
 * side card, the tutorial hand-off, task completion, the pause before the next task,
 * and the "why can't I click this?" toasts for the pre-start, between and done phases.
 */
import type { GameApi, GameMeta } from './types';

export type Phase = 'pre' | 'tutorial' | 'play' | 'between' | 'done';

export interface TaskInfo {
  h: string;
  p: string;
}

export interface Flow {
  task: number;
  phase: Phase;
  /** Mark the current task done; moves on after a short pause (or finishes the run). */
  done(): void;
  /** True (and shows a toast) when clicks should be ignored right now. */
  guard(): boolean;
  /** Says the standard between-tasks line on the coach; returns true if it did. */
  coachBetween(): boolean;
  /** Rewrites the progress line in the side card. */
  progress(text: string, win?: boolean): void;
  dispose(): void;
}

export function makeFlow(api: GameApi, meta: GameMeta, info: TaskInfo[], startTask: (t: number) => void, render: () => void): Flow {
  let timer = 0;
  const side = (t: number) => {
    const i = info[t];
    api.side.innerHTML = `<p class="eyebrow">${t === 0 ? 'Tutorial' : `Task ${t + 1} of ${meta.tasks.length}`}</p><h2>${i.h}</h2><p style="margin:0">${i.p}</p><div class="progress" data-flow-progress></div>`;
  };
  const f: Flow = {
    task: 0,
    phase: 'pre',
    done() {
      api.task(f.task);
      if (f.task >= meta.tasks.length - 1) {
        f.phase = 'done';
        render();
        return;
      }
      f.phase = 'between';
      render();
      timer = window.setTimeout(() => start(f.task + 1), 2400);
    },
    guard() {
      if (f.phase === 'pre') api.toast('Press Start first. It is in the brief, and above the game.');
      else if (f.phase === 'done') api.toast('All tasks done. Press Play again to start a new run.');
      else if (f.phase === 'between') api.toast('Task done. The next task starts in a moment.');
      else return false;
      return true;
    },
    coachBetween() {
      if (f.phase !== 'between') return false;
      api.coach.say('Task clear! Read the lesson; the next task starts in a moment.', 'watch');
      return true;
    },
    progress(text, win = false) {
      const p = api.side.querySelector<HTMLElement>('[data-flow-progress]');
      if (!p) return;
      if (p.textContent !== text) p.textContent = text;
      p.classList.toggle('win', win || f.phase === 'between' || f.phase === 'done');
    },
    dispose() {
      clearTimeout(timer);
    },
  };
  function start(t: number) {
    f.task = t;
    f.phase = t === 0 ? 'tutorial' : 'play';
    startTask(t);
    side(t);
    render();
  }
  api.onBegin(() => {
    start(0);
    api.coach.tutorial(meta.walkthrough, () => {
      api.task(0);
      f.phase = 'between';
      render();
      timer = window.setTimeout(() => start(1), 1800);
    });
  });
  return f;
}
