/** Tiny DOM helpers. Build nodes once; update attributes and text afterwards. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean> = {},
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v === false) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  if (html) e.innerHTML = html;
  return e;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svgEl(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}

export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** m:ss.s */
export function fmtTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

/** Set an attribute only if it changed (keeps per-frame updates cheap). */
export function setAttr(e: Element, k: string, v: string | number): void {
  const s = String(v);
  if (e.getAttribute(k) !== s) e.setAttribute(k, s);
}
export function setText(e: Element, s: string): void {
  if (e.textContent !== s) e.textContent = s;
}

/** Calls fn on Enter or Space, for keyboard access to custom controls. */
export function onActivateKey(e: Element, fn: () => void): void {
  e.addEventListener('keydown', (ev) => {
    const k = (ev as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      ev.preventDefault();
      fn();
    }
  });
}

/** Fires on primary-button pointerdown (fast, for time-critical clicks) and on Enter/Space. */
export function onPress(e: Element, fn: () => void): void {
  e.addEventListener('pointerdown', (ev) => {
    const pe = ev as PointerEvent;
    if (pe.button !== 0) return;
    pe.preventDefault();
    fn();
  });
  onActivateKey(e, fn);
}

/** Readable colour tokens for SVG/inline drawing, refreshed when the theme changes. */
export function themeColors(onChange?: () => void) {
  const names = ['ink', 'muted', 'line', 'panel', 'bg', 'grid', 'accent', 'vote', 'ok', 'append', 'reply', 'bad'] as const;
  type Name = (typeof names)[number];
  const C = {} as Record<Name, string>;
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    for (const n of names) C[n] = cs.getPropertyValue('--' + n).trim();
    onChange?.();
  };
  read();
  let mq: MediaQueryList | null = null;
  try {
    mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);
  } catch {
    mq = null;
  }
  const mo = new MutationObserver(read);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return {
    C,
    dispose() {
      mo.disconnect();
      try {
        mq?.removeEventListener('change', read);
      } catch {
        /* ignore */
      }
    },
  };
}
