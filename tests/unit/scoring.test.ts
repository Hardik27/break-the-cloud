import { describe, expect, it } from 'vitest';
import { RULES } from '../../supabase/functions/_shared/rules.ts';
import { COMBO_CAP_PER_TASK, comboPointsFor, gradeFor, rankFor, scoreRun, scoreTask, starsFor } from '../../supabase/functions/_shared/scoring.ts';
import { validateRun, type FinishPayload } from '../../supabase/functions/_shared/validate.ts';

describe('scoring', () => {
  it('a fast, flawless task earns base + full speed + flawless + combo', () => {
    expect(scoreTask({ ms: 9000, mistakes: 0, comboPoints: 120 }, 10000)).toEqual({ base: 200, speed: 300, flawless: 100, combo: 120, penalty: 0, total: 720, grade: 'S' });
  });
  it('speed bonus falls linearly to zero at twice par', () => {
    expect(scoreTask({ ms: 15000, mistakes: 0, comboPoints: 0 }, 10000).speed).toBe(150);
    expect(scoreTask({ ms: 25000, mistakes: 0, comboPoints: 0 }, 10000).speed).toBe(0);
  });
  it('mistakes cost 25 each and remove the flawless bonus, never below zero', () => {
    const s = scoreTask({ ms: 10000, mistakes: 2, comboPoints: 0 }, 10000);
    expect([s.flawless, s.penalty, s.total]).toEqual([0, 50, 450]);
    expect(scoreTask({ ms: 99999, mistakes: 100, comboPoints: 0 }, 10000).total).toBe(0);
  });
  it('combo points grow with the streak and are capped per task', () => {
    expect([1, 2, 5, 8, 20].map(comboPointsFor)).toEqual([10, 20, 50, 80, 80]);
    expect(scoreTask({ ms: 1, mistakes: 0, comboPoints: 9999 }, 10000).combo).toBe(COMBO_CAP_PER_TASK);
  });
  it('grades and stars', () => {
    expect(gradeFor(9000, 0, 10000)).toBe('S');
    expect(gradeFor(14000, 1, 10000)).toBe('A');
    expect(gradeFor(25000, 3, 10000)).toBe('B');
    expect(gradeFor(40000, 9, 10000)).toBe('C');
    expect(starsFor(['S', 'A', 'S', 'A'])).toBe(3);
    expect(starsFor(['S', 'B', 'A', 'C'])).toBe(2);
    expect(starsFor(['B', 'B', 'C', 'A'])).toBe(1);
  });
  it('a run adds the tutorial bonus to the task scores', () => {
    const r = scoreRun(
      [{ ms: 0, mistakes: 0, comboPoints: 0 }, { ms: 5000, mistakes: 0, comboPoints: 0 }],
      [0, 10000],
    );
    expect(r.total).toBe(100 + 600);
    expect(r.stars).toBe(3);
  });
  it('career ranks', () => {
    expect(rankFor(0).title).toBe('Intern');
    expect(rankFor(1200).title).toBe('Junior SRE');
    expect(rankFor(1750).progress).toBeCloseTo(0.5);
    expect(rankFor(50000).next).toBeNull();
  });
});

describe('server-side validation (finish-run Edge Function)', () => {
  const good = (): FinishPayload => ({ taskMs: [0, 12000, 32000, 46000, 66000], mistakes: [0, 0, 1, 0, 2], comboPoints: [0, 80, 40, 120, 30], penaltyMs: 0, moves: 40 });
  it('accepts a plausible run and scores it', () => {
    const v = validateRun('traffic-cop', 66500, good());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.total).toBeGreaterThan(1000);
  });
  it('rejects unknown games and malformed payloads', () => {
    expect(validateRun('nope', 1000, good()).ok).toBe(false);
    expect(validateRun('traffic-cop', 66000, { ...good(), taskMs: [0, 1] }).ok).toBe(false);
    expect(validateRun('traffic-cop', 66000, { ...good(), mistakes: [0, -1, 0, 0, 0] }).ok).toBe(false);
    expect(validateRun('traffic-cop', 66000, { ...good(), comboPoints: [0, 99999, 0, 0, 0] }).ok).toBe(false);
  });
  it('rejects a task finished faster than humanly possible', () => {
    const p = { ...good(), taskMs: [0, 1000, 32000, 46000, 66000] };
    const v = validateRun('traffic-cop', 66000, p);
    expect(v).toMatchObject({ ok: false, reason: 'task 2 finished impossibly fast' });
  });
  it('rejects a client clock that disagrees with the server clock', () => {
    expect(validateRun('traffic-cop', 20000, good()).ok).toBe(false); // client claims 66 s, server saw 20 s
    expect(validateRun('traffic-cop', 200000, good()).ok).toBe(false); // client claims 66 s, server saw 200 s
  });
  it('penalty time counts on the client clock but not the server clock', () => {
    expect(validateRun('traffic-cop', 56000, { ...good(), penaltyMs: 10000 }).ok).toBe(true);
  });
  it('rules exist for every built game with matching array lengths', () => {
    for (const r of Object.values(RULES)) {
      expect(r.minTimeMs).toHaveLength(r.tasks);
      expect(r.parMs).toHaveLength(r.tasks);
      r.parMs.slice(1).forEach((p, i) => expect(p).toBeGreaterThan(r.minTimeMs[i + 1]));
    }
  });
});
