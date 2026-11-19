import { describe, expect, it } from 'vitest';
import * as lb from '../../src/games/latency-budget/sim';

describe('physics', () => {
  it('distance becomes round-trip time at about 1 ms per 62 km of straight line', () => {
    const ny = lb.user('newyork'), london = lb.user('london');
    expect(lb.km(ny, london)).toBeGreaterThan(5500);
    expect(lb.km(ny, london)).toBeLessThan(5650);
    expect(lb.rtt(ny, london)).toBeGreaterThan(80);
    expect(lb.rtt(ny, ny)).toBe(2);
  });
  it('a page costs three round trips plus server time', () => {
    const ny = lb.user('newyork');
    expect(lb.loadMs(ny, lb.site('us-east'))).toBe(3 * lb.rtt(ny, lb.site('us-east')) + lb.SERVER_MS);
  });
});

describe('task 2: one server for the world', () => {
  it('only Ireland gets 40M people under 300 ms', () => {
    expect(lb.SITES.filter((s) => lb.oneServerOk(s.id)).map((s) => s.id)).toEqual(['eu-west']);
  });
  it('the starting spot (Virginia) is far from the goal', () => {
    expect(lb.fastPeople('us-east')).toBeLessThan(lb.ONE_SERVER_GOAL_PEOPLE);
  });
});

describe('task 3: CDN edges', () => {
  it('the origin alone only serves New York fast', () => {
    expect(lb.fastCities([])).toEqual(['newyork']);
  });
  it('round 1: three edges reach the goal only by covering the biggest slow cities', () => {
    const r = lb.EDGE_ROUNDS[0];
    expect(lb.bestCoverage(r)).toBe(r.goal);
    expect(lb.edgeRoundOk(['eu-west', 'ap-south', 'ap-northeast'], r)).toBe(true);
    // "One edge per continent" misses the goal.
    expect(lb.edgeRoundOk(['sa-east', 'af-west', 'ap-sydney'], r)).toBe(false);
  });
  it('round 2: São Paulo triples, so one edge has to move there', () => {
    const r = lb.EDGE_ROUNDS[1];
    expect(lb.bestCoverage(r)).toBe(r.goal);
    expect(lb.edgeRoundOk(['eu-west', 'ap-south', 'ap-northeast'], r)).toBe(false);
    expect(lb.edgeRoundOk(['sa-east', 'ap-south', 'ap-northeast'], r)).toBe(true);
  });
  it('an edge reaches about 2,500 km within 150 ms', () => {
    expect(lb.EDGE_REACH_KM).toBeGreaterThan(2000);
    expect(lb.EDGE_REACH_KM).toBeLessThan(3000);
  });
  it('Lagos has no fast cloud region: only an edge in Lagos itself gets it under the goal', () => {
    const others = lb.SITES.filter((s) => s.id !== 'af-west').map((s) => s.id);
    expect(lb.fastCities(others)).not.toContain('lagos');
    expect(lb.edgeGains([], 'af-west')).toEqual(['lagos']);
  });
  it('an edge near nobody gains no city (a wasted edge)', () => {
    expect(lb.edgeGains([], 'us-west')).toEqual([]);
    expect(lb.edgeGains(['ap-south'], 'me-central')).toEqual([]);
  });
});

describe('task 4: what an edge can serve', () => {
  it('shared static files are cacheable; personal, live and write requests are not', () => {
    const edge = lb.REQUESTS.filter((r) => r.edge).map((r) => r.path);
    expect(edge).toEqual(['/logo.png', '/app.js?v=42', '/fonts/plex.woff2', '/index.html']);
    expect(lb.REQUESTS.filter((r) => !r.edge)).toHaveLength(4);
  });
});
