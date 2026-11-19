import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/lib/rng';
import * as hs from '../../src/games/handshake/sim';

describe('tasks 1–2: the three-way handshake', () => {
  it('the tutorial is SYN, (server SYN-ACK), ACK, DATA', () => {
    const s = hs.createHandshake(0, mulberry32(1));
    expect(hs.expectedPkt(s, 0)).toBe('SYN');
    expect(hs.send(s, 0, 'SYN').ok).toBe(true);
    expect(s.ladder.map((p) => p.pkt)).toEqual(['SYN', 'SYN-ACK']);
    expect(hs.send(s, 0, 'ACK').ok).toBe(true);
    expect(hs.send(s, 0, 'DATA').ok).toBe(true);
    expect(hs.hsDone(s)).toBe(true);
  });
  it('data before the handshake is reset, and explained', () => {
    const s = hs.createHandshake(0, mulberry32(1));
    expect(hs.send(s, 0, 'DATA')).toMatchObject({ ok: false, msg: expect.stringContaining('No data before the handshake') });
    expect(s.ladder.at(-1)!.bad).toBe(true);
    expect(s.mistakes).toBe(1);
  });
  it('task 2 has two client and two server connections; servers answer SYN with SYN-ACK', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = hs.createHandshake(1, mulberry32(seed));
      expect([...s.roles].sort()).toEqual(['client', 'client', 'server', 'server']);
      let sent = 0;
      while (!hs.hsDone(s)) {
        if (hs.role(s) === 'server') expect(hs.expectedPkt(s, 1)).toBe('SYN-ACK');
        expect(hs.send(s, 1, hs.expectedPkt(s, 1)!).ok).toBe(true);
        sent++;
      }
      expect(sent).toBe(6);
      expect(s.opened).toBe(4);
    }
  });
  it('playing every connection like a client fails as the server', () => {
    const s = hs.createHandshake(1, mulberry32(3));
    while (!hs.hsDone(s)) {
      const guess: hs.Pkt = hs.role(s) === 'server' ? 'SYN' : hs.expectedPkt(s, 1)!;
      if (!hs.send(s, 1, guess).ok) hs.send(s, 1, hs.expectedPkt(s, 1)!);
    }
    expect(s.mistakes).toBe(2);
  });
});

describe('task 3: a lost segment', () => {
  it('after the gap every ACK asks for the missing byte (duplicate ACKs)', () => {
    for (let seed = 1; seed < 20; seed++) {
      const r = hs.makeLoss(mulberry32(seed));
      const after = r.acks.slice(r.dropped);
      expect(new Set(after)).toEqual(new Set([hs.seqOf(r.dropped)]));
      expect(after.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('only the missing segment is the right one to resend', () => {
    const r = hs.makeLoss(mulberry32(2));
    expect(hs.resend(r, r.dropped).ok).toBe(true);
    expect(hs.resend(r, r.n - 1)).toMatchObject({ ok: false, msg: expect.stringContaining('arrived') });
    expect(hs.resend(r, 0)).toMatchObject({ ok: false, msg: expect.stringContaining('already acknowledged') });
  });
});

describe('task 4: out of order', () => {
  it('segments arrive shuffled and must be delivered by sequence number', () => {
    const r = hs.makeOrder(mulberry32(5));
    expect(r.arrived).not.toEqual([0, 1, 2, 3, 4]);
    expect(hs.deliver(r, 1).ok).toBe(false);
    for (let i = 0; i < 5; i++) expect(hs.deliver(r, i).ok).toBe(true);
    expect(hs.orderDone(r)).toBe(true);
  });
});

describe('task 5: the RTT tax', () => {
  const ms = (o: hs.LoadOpts) => hs.loadPage(o).ms;
  it('handshakes dominate without keep-alive', () => {
    expect(ms({ keepAlive: false, parallel: 1, http2: false })).toBe(20 * 300);
    expect(ms({ keepAlive: false, parallel: 6, http2: false })).toBe(4 * 300);
  });
  it('keep-alive plus 6 connections gets under 800 ms; only HTTP/2 gets under 400 ms', () => {
    expect(ms({ keepAlive: true, parallel: 2, http2: false })).toBe(200 + 10 * 100);
    expect(ms({ keepAlive: true, parallel: 6, http2: false })).toBe(600);
    expect(ms({ keepAlive: true, parallel: 6, http2: true })).toBe(300);
    const under400 = [1, 2, 6].flatMap((p) => [true, false].flatMap((k) => [true, false].map((h) => ({ keepAlive: k, parallel: p as 1 | 2 | 6, http2: h })))).filter((o) => ms(o) < 400);
    expect(under400.every((o) => o.http2)).toBe(true);
  });
  it('lanes add up to the load time', () => {
    const r = hs.loadPage({ keepAlive: true, parallel: 6, http2: false });
    expect(r.lanes).toHaveLength(6);
    expect(Math.max(...r.lanes.map((l) => l.blocks.at(-1)!.start + l.blocks.at(-1)!.len))).toBe(r.ms);
    expect(r.lanes.reduce((a, l) => a + l.blocks.filter((b) => b.kind === 'req').length, 0)).toBe(20);
  });
});
