/** Encouragement copy. Short, upbeat, a little on-call humour. */
import type { Grade } from '../../supabase/functions/_shared/scoring.ts';

const pickFrom = <T>(xs: T[], seed: number): T => xs[Math.abs(Math.floor(seed)) % xs.length];

export const GRADE_WORDS: Record<Grade, string[]> = {
  S: ['Flawless!', 'Textbook.', 'Chef’s kiss.', 'Zero pages.'],
  A: ['Clean!', 'Nice work.', 'Smooth.'],
  B: ['Cleared.', 'Got there.', 'Shipped it.'],
  C: ['Survived!', 'Phew.', 'It’s up. Mostly.'],
};
export const GRADE_EMOJI: Record<Grade, string> = { S: '🟩', A: '🟨', B: '🟧', C: '🟥' };

export function gradeWord(g: Grade, seed: number): string {
  return pickFrom(GRADE_WORDS[g], seed);
}

export function finishHeadline(stars: number, seed: number): { title: string; sub: string } {
  if (stars >= 3)
    return pickFrom(
      [
        { title: 'Flawless shift.', sub: 'Every task cleared clean. Your users never noticed a thing.' },
        { title: 'The pager stayed silent.', sub: 'Three stars. Somebody give this engineer production access.' },
        { title: 'SRE material.', sub: 'Fast, clean, no drama. That is exactly how it is done.' },
      ],
      seed,
    );
  if (stars === 2)
    return pickFrom(
      [
        { title: 'Solid shift!', sub: 'A couple of pages, nothing the postmortem can’t fix. Replay for three stars.' },
        { title: 'Production survives.', sub: 'Good instincts. Cut the mistakes and the third star is yours.' },
      ],
      seed,
    );
  return pickFrom(
    [
      { title: 'You kept it alive!', sub: 'Every on-call engineer starts somewhere. Your best score counts, so go again.' },
      { title: 'Shipped it.', sub: 'You now know where it breaks. The second run is always faster.' },
    ],
    seed,
  );
}
