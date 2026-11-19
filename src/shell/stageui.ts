/**
 * Teaching layer around the stage (Learn → Play → Replay → Debrief):
 * - concept cards before a task (click-through frames + an optional check question),
 * - predict-before-you-run prompts,
 * - an animated replay player with scrubber, speeds and "jump to" marks,
 * - the task-clear debrief with the lesson and a Next button the student controls,
 * - the hint ladder in the side panel.
 * Panels sit between the coach bar and the stage; while one is open the stage is inert and the clock is paused.
 */
import type { CheckQuestion, Hint, LearnCard, Playback } from '../games/types';
import { el, esc } from '../lib/dom';

export interface StageUiDeps {
  slot: HTMLElement;
  stage: HTMLElement;
  pause(): void;
  resume(): void;
}

export function createStageUi(d: StageUiDeps) {
  let open = 0;
  const block = () => {
    if (open++ === 0) {
      d.stage.inert = true;
      d.stage.classList.add('dimmed');
    }
    d.pause();
  };
  const unblock = () => {
    if (--open === 0) {
      d.stage.inert = false;
      d.stage.classList.remove('dimmed');
    }
    d.resume();
  };

  function panel(cls: string, id: string): HTMLElement {
    const p = el('section', { class: `card tpanel ${cls}`, id, role: 'dialog', 'aria-live': 'polite' });
    d.slot.appendChild(p);
    p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return p;
  }

  function checkHtml(c: CheckQuestion, prefix: string): string {
    return `<p class="tp-q">${c.q}</p><div class="tp-opts" role="group" aria-label="Answer">${c.options
      .map((o, i) => `<button class="tp-opt" type="button" data-opt="${i}"${i === c.answer ? ' data-ok="1"' : ''} id="${prefix}-opt-${i}">${o}</button>`)
      .join('')}</div><div class="tp-why" hidden></div>`;
  }

  /** Concept card: frames, then the check. Resolves when the student presses Let's play (or Skip). */
  function learn(card: LearnCard | null | undefined, kicker = 'New idea'): Promise<void> {
    if (!card || !card.frames.length) return Promise.resolve();
    block();
    return new Promise((resolve) => {
      const p = panel('learn-card', 'learn-ov');
      let i = 0;
      const n = card.frames.length;
      const done = () => {
        p.remove();
        unblock();
        resolve();
      };
      const draw = () => {
        if (i < n) {
          const f = card.frames[i];
          p.innerHTML = `<div class="tp-head"><p class="eyebrow">${esc(kicker)} · ${i + 1} of ${n + (card.check ? 1 : 0)}</p><button class="linkbtn" type="button" id="learn-skip">Skip</button></div>
            <h2>${card.title}</h2>${f.svg ? `<figure class="tp-fig">${f.svg}</figure>` : ''}<div class="tp-text">${f.html}</div>
            <div class="row tp-nav">${i ? '<button class="btn ghost" type="button" id="learn-back">← Back</button>' : ''}<button class="btn go" type="button" id="learn-next">${i < n - 1 ? 'Next →' : card.check ? 'Quick check →' : 'Let’s play →'}</button><span class="tp-dots">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span></div>`;
          p.querySelector('#learn-next')!.addEventListener('click', () => {
            i++;
            if (i >= n && !card.check) return done();
            draw();
          });
          p.querySelector('#learn-back')?.addEventListener('click', () => {
            i--;
            draw();
          });
        } else {
          const c = card.check!;
          p.innerHTML = `<div class="tp-head"><p class="eyebrow">Quick check · no points lost</p><button class="linkbtn" type="button" id="learn-skip">Skip</button></div><h2>${card.title}</h2>${checkHtml(c, 'learn')}
            <div class="row tp-nav"><button class="btn ghost" type="button" id="learn-back">← Back</button><button class="btn go" type="button" id="learn-go" hidden>Let’s play →</button></div>`;
          p.querySelectorAll<HTMLButtonElement>('.tp-opt').forEach((b) =>
            b.addEventListener('click', () => {
              const ok = Number(b.dataset.opt) === c.answer;
              p.querySelectorAll<HTMLButtonElement>('.tp-opt').forEach((x) => {
                x.disabled = true;
                x.classList.toggle('right', Number(x.dataset.opt) === c.answer);
                x.classList.toggle('wrong', x === b && !ok);
              });
              const why = p.querySelector<HTMLElement>('.tp-why')!;
              why.hidden = false;
              why.innerHTML = `<b>${ok ? 'Right.' : 'Not quite.'}</b> ${c.why}`;
              const go = p.querySelector<HTMLElement>('#learn-go')!;
              go.hidden = false;
              go.focus();
            }),
          );
          p.querySelector('#learn-go')!.addEventListener('click', done);
          p.querySelector('#learn-back')!.addEventListener('click', () => {
            i = n - 1;
            draw();
          });
        }
        p.querySelector('#learn-skip')!.addEventListener('click', done);
        p.querySelector<HTMLElement>('#learn-next, .tp-opt')?.focus({ preventScroll: true });
      };
      draw();
    });
  }

  // ---------- predict ----------
  let lastPrediction: { ok: boolean; why: string; pick: string } | null = null;
  const stats = { predictions: 0, called: 0 };
  function predict(c: CheckQuestion): Promise<boolean> {
    block();
    return new Promise((resolve) => {
      const p = panel('predict-card', 'predict-ov');
      p.innerHTML = `<div class="tp-head"><p class="eyebrow">🔮 Predict first · no points lost</p></div>${checkHtml(c, 'predict')}`;
      p.querySelectorAll<HTMLButtonElement>('.tp-opt').forEach((b) =>
        b.addEventListener('click', () => {
          const ok = Number(b.dataset.opt) === c.answer;
          stats.predictions++;
          if (ok) stats.called++;
          lastPrediction = { ok, why: c.why, pick: c.options[Number(b.dataset.opt)] };
          p.remove();
          unblock();
          resolve(ok);
        }),
      );
      p.querySelector<HTMLElement>('.tp-opt')?.focus({ preventScroll: true });
    });
  }

  // ---------- replay ----------
  let bar: HTMLElement | null = null;
  let raf = 0;
  let holding = false;
  const hold = () => {
    if (!holding) {
      holding = true;
      d.pause();
    }
  };
  const release = () => {
    if (holding) {
      holding = false;
      d.resume();
    }
  };
  function closeReplay() {
    cancelAnimationFrame(raf);
    release();
    bar?.remove();
    bar = null;
  }
  function playback(pb: Playback): Promise<void> {
    closeReplay();
    const real = pb.realMs ?? 5000;
    hold();
    let paused = false;
    let speed = 1;
    let t = 0;
    let finished = false;
    const b = el('section', { class: 'card replay', id: 'replay', 'aria-label': 'Replay' });
    bar = b;
    b.innerHTML = `<div class="rp-row"><span class="eyebrow" style="margin:0">▶ ${esc(pb.title ?? 'Replay')} <span class="rp-paused">· clock paused</span></span>
        <span class="rp-speeds" role="group" aria-label="Speed">${[1, 2, 4].map((s) => `<button class="chip" type="button" data-speed="${s}" aria-pressed="${s === 1}">${s}×</button>`).join('')}</span></div>
      <div class="rp-row"><button class="btn ghost rp-play" type="button" id="replay-play" aria-label="Pause">❚❚</button>
        <input type="range" id="replay-scrub" min="0" max="${pb.durationMs}" step="10" value="0" aria-label="Replay position">
        <span class="rp-time" id="replay-time">0.0 s</span><button class="btn ghost" type="button" id="replay-skip">Skip ▸▸</button></div>
      ${pb.marks?.length ? `<div class="rp-marks">${pb.marks.map((m, k) => `<button class="chip ${m.bad ? 'bad' : ''}" type="button" data-mark="${k}">${m.bad ? '⚠ ' : ''}${(m.t / 1000).toFixed(1)} s · ${esc(m.label)}</button>`).join('')}</div>` : ''}
      <div class="rp-verdict" id="replay-verdict" hidden></div>`;
    d.slot.appendChild(b);
    const scrub = b.querySelector<HTMLInputElement>('#replay-scrub')!;
    const time = b.querySelector<HTMLElement>('#replay-time')!;
    const playBtn = b.querySelector<HTMLButtonElement>('#replay-play')!;
    const show = () => {
      pb.frame(t);
      scrub.value = String(t);
      time.textContent = `${(t / 1000).toFixed(1)} s`;
    };
    return new Promise((resolve) => {
      const end = () => {
        if (finished) return;
        finished = true;
        t = pb.durationMs;
        show();
        playBtn.textContent = '↺';
        playBtn.setAttribute('aria-label', 'Replay again');
        b.classList.add('ended');
        if (lastPrediction) {
          const v = b.querySelector<HTMLElement>('#replay-verdict')!;
          v.hidden = false;
          v.className = `rp-verdict ${lastPrediction.ok ? 'ok' : 'bad'}`;
          v.innerHTML = lastPrediction.ok ? `🔮 <b>You called it.</b> ${lastPrediction.why}` : `🔮 You predicted “${lastPrediction.pick}”. <b>Here is why it went differently:</b> ${lastPrediction.why}`;
          lastPrediction = null;
        }
        release();
        resolve();
      };
      let last = performance.now();
      const tick = (now: number) => {
        const dt = Math.min(100, now - last);
        last = now;
        if (!paused && !finished) {
          t = Math.min(pb.durationMs, t + (dt * speed * pb.durationMs) / real);
          show();
          if (t >= pb.durationMs) end();
        }
        if (bar === b) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      playBtn.addEventListener('click', () => {
        if (finished) {
          // Watch again (the clock keeps running now: the result is already in).
          t = 0;
          paused = false;
          finished = false;
          b.classList.remove('ended');
          playBtn.textContent = '❚❚';
          hold();
          return;
        }
        paused = !paused;
        playBtn.textContent = paused ? '▶' : '❚❚';
        playBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
      });
      scrub.addEventListener('input', () => {
        t = Number(scrub.value);
        show();
      });
      b.querySelector('#replay-skip')!.addEventListener('click', end);
      b.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((s) =>
        s.addEventListener('click', () => {
          speed = Number(s.dataset.speed);
          b.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === s)));
        }),
      );
      b.querySelectorAll<HTMLButtonElement>('[data-mark]').forEach((m) =>
        m.addEventListener('click', () => {
          t = pb.marks![Number(m.dataset.mark)].t;
          paused = true;
          playBtn.textContent = '▶';
          show();
        }),
      );
    });
  }

  // ---------- debrief ----------
  let debriefOpen = false;
  let afterDebrief: (() => void) | null = null;
  function debrief(o: { kicker: string; title: string; pts: string; detail: string; lesson: string; next: string }) {
    closeReplay();
    debriefOpen = true;
    block();
    const p = panel('debrief-card', 'debrief');
    p.innerHTML = `<div class="db-top"><div><p class="eyebrow">${esc(o.kicker)}</p><div class="db-title">${esc(o.title)}</div><p class="small" style="margin:2px 0 0">${o.detail}</p></div><div class="db-pts">${o.pts}</div></div>
      <div class="lesson db-lesson"><p class="eyebrow" style="margin:0 0 4px">What just happened</p>${o.lesson}</div>
      <div class="row"><button class="btn go" type="button" id="debrief-next">${o.next}</button></div>`;
    const btn = p.querySelector<HTMLButtonElement>('#debrief-next')!;
    btn.addEventListener('click', () => {
      p.remove();
      debriefOpen = false;
      unblock();
      const f = afterDebrief;
      afterDebrief = null;
      f?.();
    });
    btn.focus({ preventScroll: true });
  }
  /** Run fn once the debrief (if any) has been dismissed. */
  function whenClear(fn: () => void) {
    if (debriefOpen) afterDebrief = fn;
    else fn();
  }

  return {
    learn,
    predict,
    playback,
    debrief,
    whenClear,
    closeReplay,
    stats,
    get blocking() {
      return open > 0;
    },
  };
}

// ---------- hint ladder (side panel) ----------
export interface HintDeps {
  card: HTMLElement;
  /** Charge n mistakes (0 for the free nudge). */
  charge(n: number): void;
  toast(s: string): void;
}
export function createHints(h: HintDeps) {
  let hint: Hint | null = null;
  let shown = 0;
  let pulsed = false;
  const COST = [0, 1, 2];
  const LABEL = ['Nudge · free', 'The idea · −25', 'Show me · −50'];
  function draw() {
    if (!hint) {
      h.card.hidden = true;
      return;
    }
    h.card.hidden = false;
    const steps = [hint.nudge, hint.concept, hint.show];
    h.card.innerHTML = `<p class="eyebrow">Stuck? Hints</p>${steps
      .slice(0, shown)
      .map((s, i) => `<p class="hint-step"><span class="hint-n">${i + 1}</span>${s}</p>`)
      .join('')}${shown < 3 ? `<button class="btn ghost hint-btn${pulsed ? ' pulse' : ''}" type="button" id="hint-btn">${shown ? 'Next hint' : 'Get a hint'}: ${LABEL[shown]}</button>` : ''}`;
    h.card.querySelector('#hint-btn')?.addEventListener('click', () => {
      h.charge(COST[shown]);
      shown++;
      pulsed = false;
      if (shown === 3 && hint?.target) {
        document.querySelectorAll(hint.target).forEach((e) => {
          e.classList.add('hint-glow');
          setTimeout(() => e.classList.remove('hint-glow'), 5000);
        });
      }
      draw();
    });
  }
  return {
    set(x: Hint | null | undefined) {
      hint = x ?? null;
      shown = 0;
      pulsed = false;
      draw();
    },
    /** The student seems stuck: pulse the button once. */
    nudge() {
      if (!hint || shown >= 3 || pulsed) return;
      pulsed = true;
      draw();
      h.toast('Stuck? The first hint is free.');
    },
    get used() {
      return shown;
    },
  };
}
