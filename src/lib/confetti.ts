/** A short confetti burst on a full-screen canvas. Skipped when the user prefers reduced motion. */
export function confetti(durationMs = 1800): void {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch {
    /* ignore */
  }
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (c.width = innerWidth * dpr);
  const H = (c.height = innerHeight * dpr);
  const g = c.getContext('2d');
  if (!g) return c.remove();
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--ok', '--append', '--vote', '--bad'].map((v) => css.getPropertyValue(v).trim() || '#D9480F');
  const parts = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 18 * dpr,
    vy: (-Math.random() * 16 - 6) * dpr,
    r: (4 + Math.random() * 5) * dpr,
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.4,
    col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = (t - t0) / durationMs;
    if (k >= 1) return c.remove();
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.min(1, 2 * (1 - k));
    for (const p of parts) {
      p.vy += 0.55 * dpr;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a);
      g.fillStyle = p.col;
      g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      g.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
