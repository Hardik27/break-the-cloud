/** Tiny synthesized sound effects (no audio files). Muted state is remembered in this browser. */
import { storage } from './storage';

let ctx: AudioContext | null = null;
let muted = storage.get('muted', false);

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'triangle', gain = 0.05, delay = 0): void {
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    /* audio is a nicety */
  }
}

export const sfx = {
  /** Call from a click handler so browsers allow audio. */
  unlock(): void {
    audio();
  },
  /** Pitch climbs with the combo. */
  hit(combo: number): void {
    tone(440 * Math.pow(2, Math.min(combo, 12) / 12), 0.09, 'triangle', 0.05);
  },
  miss(): void {
    tone(150, 0.2, 'sawtooth', 0.035);
    tone(110, 0.22, 'sawtooth', 0.03, 0.06);
  },
  task(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.05, i * 0.07));
  },
  finish(stars: number): void {
    const notes = stars >= 3 ? [523, 659, 784, 1047, 1319] : stars === 2 ? [523, 659, 784, 1047] : [523, 659, 784];
    notes.forEach((f, i) => tone(f, 0.22, 'triangle', 0.06, i * 0.11));
  },
  get muted(): boolean {
    return muted;
  },
  toggle(): boolean {
    muted = !muted;
    storage.set('muted', muted);
    if (!muted) sfx.hit(1);
    return muted;
  },
};
