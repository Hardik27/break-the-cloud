/**
 * Nickname rules. The same rules are enforced in Postgres (public.nickname_allowed in the migration),
 * so keep the two in sync.
 */
export const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'dick', 'cock', 'pussy', 'whore', 'slut', 'nigg', 'fag', 'retard',
  'rape', 'nazi', 'hitler', 'porn', 'sex', 'penis', 'vagina', 'asshole', 'bastard', 'admin', 'moderator',
];

export function checkNickname(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const n = raw.trim().replace(/\s+/g, ' ');
  if (n.length < 3) return { ok: false, reason: 'Use at least 3 characters.' };
  if (n.length > 20) return { ok: false, reason: 'Use at most 20 characters.' };
  if (!/^[A-Za-z0-9 _.-]+$/.test(n)) return { ok: false, reason: 'Letters, numbers, spaces, _ . and - only.' };
  if (/(https?|www|\.(com|net|org|io|gg|xyz|app|dev|me|co)\b)/i.test(n)) return { ok: false, reason: 'No links, please.' };
  const squashed = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (BLOCKED.some((w) => squashed.includes(w))) return { ok: false, reason: 'Please pick a different nickname.' };
  return { ok: true, value: n };
}
