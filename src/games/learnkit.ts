/**
 * Tiny SVG kit for concept cards. Every colour is a CSS variable so diagrams work in light and dark mode.
 * Coordinates are in a 560 × 220 viewBox unless a card passes its own height.
 */
const MONO = 'font-family="IBM Plex Mono, monospace"';
const SANS = 'font-family="IBM Plex Sans, sans-serif"';

export const svg = (body: string, label: string, h = 220): string =>
  `<svg viewBox="0 0 560 ${h}" role="img" aria-label="${label.replace(/"/g, '&quot;')}">
  <defs><marker id="lk-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--muted)"/></marker>
  <marker id="lk-ab" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--append)"/></marker>
  <marker id="lk-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--bad)"/></marker>
  <marker id="lk-ag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" style="fill:var(--ok)"/></marker></defs>${body}</svg>`;

/** A labelled box. */
export function box(x: number, y: number, w: number, h: number, label: string, o: { col?: string; fill?: string; sub?: string; size?: number; dash?: boolean; bold?: boolean } = {}): string {
  const col = o.col ?? 'var(--line)';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" style="fill:${o.fill ?? 'var(--panel)'};stroke:${col};stroke-width:1.6${o.dash ? ';stroke-dasharray:5 4' : ''}"/>` +
    `<text x="${x + w / 2}" y="${y + h / 2 + (o.sub ? -2 : 5)}" text-anchor="middle" ${SANS} font-size="${o.size ?? 16}" font-weight="${o.bold === false ? 400 : 600}" style="fill:var(--ink)">${label}</text>` +
    (o.sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 16}" text-anchor="middle" ${MONO} font-size="12.5" style="fill:var(--muted)">${o.sub}</text>` : '');
}

/** Text. */
export function text(x: number, y: number, s: string, o: { col?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; mono?: boolean; bold?: boolean } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? 'middle'}" ${o.mono === false ? SANS : MONO} font-size="${o.size ?? 14}"${o.bold ? ' font-weight="700"' : ''} style="fill:${o.col ?? 'var(--ink)'}">${s}</text>`;
}

/** An arrow, optionally labelled at its middle. kind picks the colour. */
export function arrow(x1: number, y1: number, x2: number, y2: number, label = '', kind: 'muted' | 'blue' | 'red' | 'green' = 'muted', dash = false): string {
  const col = { muted: 'var(--muted)', blue: 'var(--append)', red: 'var(--bad)', green: 'var(--ok)' }[kind];
  const mk = { muted: 'lk-a', blue: 'lk-ab', red: 'lk-ar', green: 'lk-ag' }[kind];
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${col};stroke-width:1.8${dash ? ';stroke-dasharray:5 4' : ''}" marker-end="url(#${mk})"/>` +
    (label ? text((x1 + x2) / 2, (y1 + y2) / 2 - 7, label, { col, size: 13.5 }) : '');
}

/** A server (rack icon) with a name under it. */
export function server(x: number, y: number, name: string, o: { col?: string; state?: 'ok' | 'bad' | 'off' | 'warn' } = {}): string {
  const col = o.col ?? { ok: 'var(--ok)', bad: 'var(--bad)', off: 'var(--muted)', warn: 'var(--vote)' }[o.state ?? 'ok'];
  return `<rect x="${x - 22}" y="${y - 26}" width="44" height="52" rx="5" style="fill:var(--panel);stroke:${col};stroke-width:1.8"/>` +
    [0, 1, 2].map((k) => `<line x1="${x - 14}" y1="${y - 14 + k * 14}" x2="${x + 8}" y2="${y - 14 + k * 14}" style="stroke:${col};stroke-width:2"/><circle cx="${x + 13}" cy="${y - 14 + k * 14}" r="2.4" style="fill:${col}"/>`).join('') +
    text(x, y + 44, name, { size: 13 });
}

/** A person (user) icon with a label. */
export function person(x: number, y: number, name: string, col = 'var(--ink)'): string {
  return `<circle cx="${x}" cy="${y - 12}" r="8" style="fill:none;stroke:${col};stroke-width:1.8"/><path d="M${x - 13} ${y + 12} q13 -20 26 0" style="fill:none;stroke:${col};stroke-width:1.8"/>` + text(x, y + 30, name, { size: 13 });
}

/** A small filled dot (a request, a token, a packet). */
export const dot = (x: number, y: number, col = 'var(--append)', r = 6): string => `<circle cx="${x}" cy="${y}" r="${r}" style="fill:${col}"/>`;

/** A pill label. */
export function pill(x: number, y: number, s: string, col = 'var(--accent)'): string {
  const w = s.length * 7.2 + 16;
  return `<rect x="${x - w / 2}" y="${y - 11}" width="${w}" height="22" rx="11" style="fill:none;stroke:${col};stroke-width:1.5"/>` + text(x, y + 4, s, { col, size: 11 });
}

/** A clock/stopwatch reading. */
export const stopwatch = (x: number, y: number, s: string, col = 'var(--accent)'): string =>
  `<circle cx="${x}" cy="${y}" r="18" style="fill:none;stroke:${col};stroke-width:2"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 11}" style="stroke:${col};stroke-width:2"/><line x1="${x}" y1="${y}" x2="${x + 8}" y2="${y + 4}" style="stroke:${col};stroke-width:2"/>` +
  text(x, y + 34, s, { col, size: 12, bold: true });
