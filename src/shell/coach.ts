/**
 * The walkthrough system.
 *
 * - Coach bar: one sentence above the stage, always saying what to do next.
 *   Orange ('act') when the student must act, grey ('watch') when they should watch.
 * - Spotlight tutorial: dims everything except the target element, pulses a ring on it,
 *   and advances only when the game reports the matching action via coach.did(id).
 *   Clicks on the dimmed area get a toast instead of being silently swallowed.
 */
import type { Coach, CoachMode, CoachStep } from '../games/types';
import { el } from '../lib/dom';

export interface ShellCoach extends Coach {
  bar: HTMLElement;
  /** Slot in the bar for shell buttons (e.g. Start). */
  actions: HTMLElement;
  /** Force a message even if the game is silent (used by the shell before Start and after the end). */
  shellSay(html: string, mode?: CoachMode): void;
  skip(): void;
  destroy(): void;
}

const PAD = 8;

export function createCoach(container: HTMLElement, toast: (s: string) => void): ShellCoach {
  const bar = el('div', { class: 'coach', 'data-mode': 'watch', id: 'coach' });
  const label = el('span', { class: 'coach-label', id: 'coach-label' }, 'Watch');
  const text = el('span', { class: 'coach-text', id: 'coach-text', role: 'status', 'aria-live': 'polite' });
  const actions = el('span', { class: 'coach-actions' });
  const skipBtn = el('button', { class: 'linkbtn coach-skip', type: 'button', hidden: true }, 'Skip tutorial');
  actions.appendChild(skipBtn);
  bar.append(label, text, actions);
  container.appendChild(bar);

  let lastKey = '';
  function render(html: string, mode: CoachMode) {
    const key = mode + '|' + html;
    if (key === lastKey) return;
    lastKey = key;
    bar.dataset.mode = mode;
    label.textContent = inTutorial() ? 'Tutorial' : mode === 'act' ? 'Do this' : 'Watch';
    text.innerHTML = html;
  }

  // ---------- spotlight ----------
  let steps: CoachStep[] = [];
  let idx = -1;
  let onDone: ((skipped: boolean) => void) | null = null;
  let raf = 0;
  const inTutorial = () => idx >= 0;

  const blocks = [0, 1, 2, 3].map(() => el('div', { class: 'spot-block', 'aria-hidden': 'true' }));
  const ring = el('div', { class: 'spot-ring', 'aria-hidden': 'true' });
  const tip = el('div', { class: 'spot-tip', role: 'dialog', 'aria-label': 'Tutorial step' });
  const tipEyebrow = el('p', { class: 'eyebrow' });
  const tipText = el('p', { class: 'spot-tip-text' });
  const tipSkip = el('button', { class: 'linkbtn', type: 'button' }, 'Skip tutorial');
  tip.append(tipEyebrow, tipText, tipSkip);
  const overlay = [...blocks, ring, tip];

  const blockHandler = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    toast('Tutorial: click the highlighted spot, or press Skip tutorial.');
  };
  blocks.forEach((b) => b.addEventListener('pointerdown', blockHandler));
  skipBtn.addEventListener('click', () => skip());
  tipSkip.addEventListener('click', () => skip());

  function place() {
    if (!inTutorial()) return;
    const step = steps[idx];
    const target = document.querySelector(step.target);
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const r = target?.getBoundingClientRect();
    const box = (e: HTMLElement, x: number, y: number, w: number, h: number) => {
      e.style.left = x + 'px';
      e.style.top = y + 'px';
      e.style.width = Math.max(0, w) + 'px';
      e.style.height = Math.max(0, h) + 'px';
    };
    if (!r || (r.width === 0 && r.height === 0)) {
      // Target not on screen yet: dim everything, keep the tip in the middle.
      box(blocks[0], 0, 0, vw, vh);
      for (let i = 1; i < 4; i++) box(blocks[i], 0, 0, 0, 0);
      ring.style.display = 'none';
      tip.style.left = Math.max(16, (vw - tip.offsetWidth) / 2) + 'px';
      tip.style.top = Math.max(16, (vh - tip.offsetHeight) / 2) + 'px';
      return;
    }
    const x0 = Math.max(0, r.left - PAD), y0 = Math.max(0, r.top - PAD);
    const x1 = Math.min(vw, r.right + PAD), y1 = Math.min(vh, r.bottom + PAD);
    box(blocks[0], 0, 0, vw, y0); // top
    box(blocks[1], 0, y1, vw, vh - y1); // bottom
    box(blocks[2], 0, y0, x0, y1 - y0); // left
    box(blocks[3], x1, y0, vw - x1, y1 - y0); // right
    ring.style.display = '';
    box(ring, x0, y0, x1 - x0, y1 - y0);
    // Tip below the hole if there is room, else above, else pinned to the bottom.
    const th = tip.offsetHeight, tw = tip.offsetWidth;
    let ty = y1 + 10;
    if (ty + th > vh - 8) ty = y0 - th - 10;
    if (ty < 8) ty = vh - th - 8;
    const tx = Math.min(Math.max(16, (x0 + x1) / 2 - tw / 2), vw - tw - 16);
    tip.style.left = tx + 'px';
    tip.style.top = ty + 'px';
  }

  function loop() {
    place();
    raf = requestAnimationFrame(loop);
  }

  function enterStep() {
    const step = steps[idx];
    tipEyebrow.textContent = `Tutorial · step ${idx + 1} of ${steps.length}`;
    tipText.textContent = step.text;
    render(step.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!), 'act');
    // Wait a frame: the game may have just revealed the target.
    requestAnimationFrame(() => {
      if (!inTutorial() || steps[idx] !== step) return;
      const target = document.querySelector<HTMLElement | SVGElement>(step.target);
      if (!target) return;
      if ('focus' in target && target.getAttribute('tabindex') !== null || target instanceof HTMLButtonElement) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
      const r = target.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 150) {
        target.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      }
      place();
    });
  }

  function finish(skipped: boolean) {
    if (!inTutorial()) return;
    idx = -1;
    steps = [];
    cancelAnimationFrame(raf);
    overlay.forEach((e) => e.remove());
    bar.classList.remove('raised');
    skipBtn.hidden = true;
    lastKey = '';
    const cb = onDone;
    onDone = null;
    cb?.(skipped);
  }

  function skip() {
    finish(true);
  }

  const coach: ShellCoach = {
    bar,
    actions,
    say(html, mode = 'act') {
      if (inTutorial()) return;
      render(html, mode);
    },
    shellSay(html, mode = 'act') {
      render(html, mode);
    },
    tutorial(s, cb) {
      if (!s.length) {
        cb(false);
        return;
      }
      steps = s;
      idx = 0;
      onDone = cb;
      document.body.append(...overlay);
      bar.classList.add('raised');
      skipBtn.hidden = false;
      lastKey = '';
      enterStep();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    },
    did(id) {
      if (!inTutorial() || steps[idx].id !== id) return;
      idx++;
      if (idx >= steps.length) finish(false);
      else enterStep();
    },
    get step() {
      return inTutorial() ? steps[idx].id : null;
    },
    get inTutorial() {
      return inTutorial();
    },
    skip,
    destroy() {
      cancelAnimationFrame(raf);
      overlay.forEach((e) => e.remove());
      idx = -1;
      onDone = null;
    },
  };
  return coach;
}
