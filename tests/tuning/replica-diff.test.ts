/**
 * Difficulty tuning for Replica Diff. There is no clock inside the sim, so this models a student
 * reading the tables: comparing one field of one row pair costs FIELD_MS, plus ROW_MS to move to the
 * next row, plus CLICK_MS per flag. A correct strategy compares every field; the wrong one only
 * compares names and sizes (a "size check"), which should usually fail to find anything.
 * Run: npm run tune
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as rd from '../../src/games/replica-diff/sim';
import { median, report } from './util';

const READ_MS = 3000;
const ROW_MS = 700;
const FIELD_MS = 350;
const CLICK_MS = 700;
const LIMIT = 60_000;

/** Time to find every target by scanning rows top to bottom with the given checks, or null if it never finds them all. */
function scan(r: rd.Round, checks: rd.Check[]): number | null {
  const found = rd.verify(r, checks);
  const targets = [...r.targets.keys()];
  if (!targets.every((t) => found.has(t))) return null;
  const last = Math.max(...targets);
  const t = READ_MS + (last + 1) * (ROW_MS + FIELD_MS * checks.length) + targets.length * CLICK_MS;
  return t <= LIMIT ? t : null;
}

describe('Replica Diff difficulty', () => {
  for (let task = 1; task < rd.ROUNDS.length; task++) {
    it(`task ${task + 1}`, () => {
      const RUNS = 300;
      const times: number[] = [];
      let wrongFails = 0;
      for (let seed = 1; seed <= RUNS; seed++) {
        const r = rd.makeRound(task, mulberry32(seed));
        times.push(scan(r, ['keys', 'size', 'etag', 'tags', 'ret']) ?? LIMIT);
        if (scan(r, ['keys', 'size']) === null) wrongFails++;
      }
      const med = median(times) / 1000;
      const correctRate = times.filter((x) => x < LIMIT).length / RUNS;
      report('replica-diff', `task ${task + 1}`, med, correctRate, wrongFails / RUNS);
      expect(med).toBeGreaterThanOrEqual(10);
      expect(med).toBeLessThanOrEqual(40);
      expect(correctRate).toBeGreaterThan(0.9);
      expect(wrongFails / RUNS).toBeGreaterThan(0.5);
    });
  }
});
