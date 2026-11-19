/**
 * Shared helpers for "Run" tasks: predict first, then reveal the result chart left to right
 * as an animated replay (the clock is paused), and only then show the numbers.
 */
import type { CheckQuestion, GameApi } from './types';

let busy = false;
/** True while a prediction or replay is in progress (ignore Run clicks). */
export const replayBusy = (): boolean => busy;

/**
 * Asks the prediction (if given), then animates a veil off the first <svg> inside `holder`
 * over `simMs` of simulated time. Rows with class .mrow stay hidden until the replay ends.
 */
export async function predictAndReveal(api: GameApi, holder: HTMLElement, o: { predict?: CheckQuestion; simMs: number; title: string; marks?: { t: number; label: string; bad?: boolean }[]; realMs?: number }): Promise<void> {
  busy = true;
  try {
    holder.classList.add('playing');
    if (o.predict) await api.predict(o.predict);
    const chart = holder.querySelector('svg');
    let veil: HTMLElement | null = null;
    if (chart) {
      const wrap = document.createElement('div');
      wrap.className = 'reveal-wrap';
      chart.replaceWith(wrap);
      wrap.appendChild(chart);
      veil = document.createElement('div');
      veil.className = 'reveal-veil';
      wrap.appendChild(veil);
    }
    await api.playback({
      title: o.title,
      durationMs: o.simMs,
      realMs: o.realMs ?? 6000,
      marks: o.marks,
      frame: (t) => {
        if (veil) veil.style.left = `${Math.min(100, (100 * t) / o.simMs)}%`;
      },
    });
    veil?.remove();
  } finally {
    holder.classList.remove('playing');
    busy = false;
  }
}
