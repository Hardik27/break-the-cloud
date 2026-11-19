import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as rd from '../../src/games/replica-diff/sim';

const round = (task: number, seed = 1) => rd.makeRound(task, mulberry32(seed));

describe('rounds', () => {
  it('the tutorial plants one missing object on the fixed row', () => {
    for (let seed = 1; seed < 20; seed++) {
      const r = round(0, seed);
      expect(r.src.length).toBe(6);
      expect([...r.targets]).toEqual([[rd.TUTORIAL_ROW, 'miss']]);
      expect(r.dst[rd.TUTORIAL_ROW]).toBeNull();
    }
  });

  it.each([
    [1, 'etag'],
    [2, 'tags'],
    [3, 'ret'],
  ] as const)('task %i plants exactly one %s difference and every other row is identical', (task, kind) => {
    for (let seed = 1; seed < 30; seed++) {
      const r = round(task, seed);
      const diffs = r.src.map((s, i) => rd.diffKind(s, r.dst[i]));
      expect(diffs.filter((d) => d !== null)).toEqual([kind]);
      const [row] = [...r.targets.keys()];
      expect(diffs[row]).toBe(kind);
    }
  });

  it('the speed round plants three differences of three different kinds', () => {
    for (let seed = 1; seed < 30; seed++) {
      const r = round(4, seed);
      expect(r.src.length).toBe(14);
      const kinds = r.src.map((s, i) => rd.diffKind(s, r.dst[i])).filter(Boolean);
      expect(kinds.length).toBe(3);
      expect(new Set(kinds).size).toBe(3);
    }
  });

  it('is reproducible from the seed', () => {
    expect(round(4, 7)).toEqual(round(4, 7));
  });
});

describe('what each check can see (the lessons depend on this)', () => {
  it('a size check passes the corrupted copy; a checksum catches it', () => {
    const r = round(1);
    const [row] = [...r.targets.keys()];
    expect(r.src[row].size).toBe(r.dst[row]!.size);
    expect(rd.verify(r, ['keys', 'size']).size).toBe(0);
    expect([...rd.verify(r, ['etag'])]).toEqual([row]);
  });
  it('checksums pass the copy with changed tags; a tag comparison catches it', () => {
    const r = round(2);
    expect(rd.verify(r, ['keys', 'size', 'etag']).size).toBe(0);
    expect(rd.verify(r, ['tags']).size).toBe(1);
  });
  it('bytes and tags pass the copy that lost its lock; only a retention check catches it', () => {
    const r = round(3);
    const [row] = [...r.targets.keys()];
    expect(r.src[row].ret).not.toBe('none');
    expect(r.dst[row]!.ret).toBe('none');
    expect(rd.verify(r, ['keys', 'size', 'etag', 'tags']).size).toBe(0);
    expect([...rd.verify(r, ['ret'])]).toEqual([row]);
  });
  it('a full verifier finds every planted difference', () => {
    for (let seed = 1; seed < 20; seed++) {
      const r = round(4, seed);
      expect(rd.verify(r, ['keys', 'size', 'etag', 'tags', 'ret'])).toEqual(new Set(r.targets.keys()));
    }
  });
});

describe('flagging', () => {
  it('hits, misses, repeats and solves', () => {
    const r = round(4);
    const targets = [...r.targets.keys()];
    const wrong = [...Array(14).keys()].find((i) => !r.targets.has(i))!;
    expect(rd.flag(r, wrong)).toBe('wrong');
    expect(rd.flag(r, targets[0])).toBe('hit');
    expect(rd.flag(r, targets[0])).toBe('again');
    expect(rd.left(r)).toBe(2);
    rd.flag(r, targets[1]);
    expect(rd.solved(r)).toBe(false);
    rd.flag(r, targets[2]);
    expect(rd.solved(r)).toBe(true);
  });
});
