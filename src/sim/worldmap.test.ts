import { describe, expect, it } from 'vitest';
import { MIN_BASES } from './mapgen';
import { OUTLINE_MARGIN, edgeDistance, insidePolygon } from './scenery';
import type { Point } from './types';
import {
  MAX_STARS,
  START_ID,
  availableRegions,
  fogRegions,
  getRegion,
  isUnlocked,
  naturalStars,
  newConquest,
  recordBattle,
  regionId,
  regionLevel,
  type ConquestState,
} from './worldmap';

const SEEDS = [1, 42, 9001, 123457];
const key = (p: Point) => `${p.x},${p.y}`;

function ids(radius: number): string[] {
  const out: string[] = [];
  for (let j = -radius; j <= radius; j++) {
    for (let i = -radius; i <= radius; i++) out.push(regionId(i, j));
  }
  return out;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

describe('world map regions', () => {
  it('builds the same world from the same seed', () => {
    expect(getRegion(7, '2,-1')).toEqual(getRegion(7, '2,-1'));
    expect(getRegion(7, '2,-1').polygon).not.toEqual(getRegion(8, '2,-1').polygon);
  });

  it('gives every region a handful of neighbours, and neighbours agree', () => {
    for (const seed of SEEDS) {
      for (const id of ids(3)) {
        const r = getRegion(seed, id);
        expect(r.neighbours.length).toBeGreaterThanOrEqual(4);
        expect(r.neighbours.length).toBeLessThanOrEqual(8);
        for (const n of r.neighbours) expect(getRegion(seed, n).neighbours).toContain(id);
      }
    }
  });

  it('shares borders point for point between neighbours', () => {
    for (const seed of SEEDS) {
      for (const id of ids(2)) {
        const mine = new Set(getRegion(seed, id).polygon.map(key));
        for (const n of getRegion(seed, id).neighbours) {
          const theirs = getRegion(seed, n).polygon.map(key);
          // Both corners plus the noisy points in between.
          expect(theirs.filter((p) => mine.has(p)).length).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });

  it('draws borders that never cross themselves', () => {
    for (const seed of SEEDS) {
      for (const id of ids(2)) {
        const poly = getRegion(seed, id).polygon;
        const n = poly.length;
        for (let a = 0; a < n; a++) {
          for (let b = a + 2; b < n; b++) {
            if (a === 0 && b === n - 1) continue;
            const crosses = segmentsCross(poly[a]!, poly[a + 1]!, poly[b]!, poly[(b + 1) % n]!);
            expect(crosses).toBe(false);
          }
        }
      }
    }
  });

  it('rates regions further from the start with more stars', () => {
    const near: number[] = [];
    const far: number[] = [];
    for (const seed of SEEDS) {
      for (const n of getRegion(seed, START_ID).neighbours) near.push(naturalStars(seed, n));
      for (const id of [regionId(8, 0), regionId(-8, 3), regionId(0, 9), regionId(5, -8)]) {
        far.push(naturalStars(seed, id));
      }
    }
    expect(Math.max(...near)).toBeLessThanOrEqual(2);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean(far)).toBeGreaterThan(4);
    for (const s of [...near, ...far]) {
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(MAX_STARS);
    }
  });
});

/** A player who always picks a region by `choose` and wins three battles in every four. */
function campaign(seed: number, battles: number, choose: (s: ConquestState) => string) {
  const state = newConquest(seed);
  const log: { state: ConquestState; frontier: number[] }[] = [];
  for (let k = 0; k < battles; k++) {
    const won = k % 4 !== 3;
    recordBattle(state, choose(state), won);
    const frontier = availableRegions(state).map((id) => state.regions[id]!.stars);
    log.push({ state, frontier });
  }
  return { state, log };
}

const easiest = (s: ConquestState) =>
  availableRegions(s).sort((a, b) => s.regions[a]!.stars - s.regions[b]!.stars)[0]!;
const hardest = (s: ConquestState) =>
  availableRegions(s).sort((a, b) => s.regions[b]!.stars - s.regions[a]!.stars)[0]!;

describe('conquest progress', () => {
  it('starts with just the tutorial region to fight', () => {
    const s = newConquest(5);
    expect(availableRegions(s)).toEqual([START_ID]);
    expect(s.held).toEqual([]);
    expect(fogRegions(s).length).toBeGreaterThan(3);
  });

  it('winning takes the region and reveals its neighbours', () => {
    const s = newConquest(5);
    const revealed = recordBattle(s, START_ID, true);
    expect(s.held).toEqual([START_ID]);
    expect(revealed.sort()).toEqual([...getRegion(5, START_ID).neighbours].sort());
    for (const id of availableRegions(s)) {
      expect(getRegion(5, id).neighbours).toContain(START_ID);
    }
  });

  it('losing takes nothing and keeps the region available', () => {
    const s = newConquest(5);
    recordBattle(s, START_ID, true);
    const target = availableRegions(s)[0]!;
    expect(recordBattle(s, target, false)).toEqual([]);
    expect(s.held).toEqual([START_ID]);
    expect(availableRegions(s)).toContain(target);
  });

  it('always offers an easier and a harder choice on the frontier', () => {
    for (const seed of SEEDS) {
      for (const choose of [easiest, hardest]) {
        for (const { frontier } of campaign(seed, 60, choose).log) {
          expect(Math.min(...frontier)).toBeLessThan(Math.max(...frontier));
        }
      }
    }
  });

  it('lowers ratings after a loss, with some randomness, and restores them with wins', () => {
    let dropped = 0;
    let kept = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = newConquest(seed);
      recordBattle(s, START_ID, true);
      for (let k = 0; k < 4; k++) recordBattle(s, hardest(s), true);
      const before = Object.fromEntries(
        availableRegions(s).map((id) => [id, s.regions[id]!.stars]),
      );
      recordBattle(s, hardest(s), false);
      for (const [id, stars] of Object.entries(before)) {
        const now = s.regions[id]!.stars;
        expect(now).toBeLessThanOrEqual(stars + 1); // +1 only from the choice nudge
        if (stars > 1) {
          if (now < stars) dropped++;
          else kept++;
        }
      }
      for (let k = 0; k < 12; k++) recordBattle(s, easiest(s), true);
      for (const id of availableRegions(s)) {
        expect(s.regions[id]!.stars).toBeGreaterThanOrEqual(s.regions[id]!.base - 1);
      }
    }
    expect(dropped).toBeGreaterThan(kept);
    expect(kept).toBeGreaterThan(0);
  });

  it('keeps growing: there is always somewhere new to push, and it gets harder', () => {
    const { state } = campaign(77, 160, hardest);
    expect(state.held.length).toBeGreaterThan(100);
    expect(availableRegions(state).length).toBeGreaterThan(10);
    const furthest = Math.max(...state.held.map((id) => Math.hypot(...id.split(',').map(Number))));
    expect(furthest).toBeGreaterThan(5);
    expect(Math.max(...availableRegions(state).map((id) => state.regions[id]!.stars))).toBe(5);
  });

  it('counts the player’s own wins per star level, not auto-battles', () => {
    const s = newConquest(3);
    recordBattle(s, START_ID, true);
    recordBattle(s, START_ID, true, true);
    expect(s.starWins[1]).toBe(1);
    expect(s.regions[START_ID]!.wins).toBe(2);
    expect(s.held).toEqual([START_ID]);
  });
});

describe('region battles', () => {
  const regions = (seed: number) => [START_ID, ...getRegion(seed, START_ID).neighbours];

  it('gives each region its own fixed map', () => {
    expect(regionLevel(4, '1,0')).toEqual(regionLevel(4, '1,0'));
    expect(regionLevel(4, '1,0').bases).not.toEqual(regionLevel(4, '0,1').bases);
    expect(regionLevel(4, '1,0').name).toBe(getRegion(4, '1,0').name);
  });

  it('keeps every base and its mirror twin inside the region-shaped outline', () => {
    for (const seed of SEEDS) {
      for (const id of regions(seed)) {
        const level = regionLevel(seed, id);
        const outline = level.outline!;
        for (const b of level.bases) {
          expect(insidePolygon(b, outline)).toBe(true);
          // The margin is measured from just below the base, where its label hangs.
          expect(edgeDistance(b, outline)).toBeGreaterThanOrEqual(OUTLINE_MARGIN - 13);
        }
        for (const f of level.features ?? []) expect(insidePolygon(f, outline)).toBe(true);
      }
    }
  });

  it('uses the region’s exact shape: only scaled and moved, never stretched or turned', () => {
    for (const seed of SEEDS) {
      for (const id of regions(seed)) {
        const shape = getRegion(seed, id).polygon;
        const outline = regionLevel(seed, id).outline!;
        expect(outline.length).toBe(shape.length);
        // One scale for both axes, one offset, for every corner.
        const scale = (outline[1]!.x - outline[0]!.x) / (shape[1]!.x - shape[0]!.x);
        const dx = outline[0]!.x - shape[0]!.x * scale;
        const dy = outline[0]!.y - shape[0]!.y * scale;
        expect(scale).toBeGreaterThan(1);
        shape.forEach((p, k) => {
          expect(outline[k]!.x).toBeCloseTo(p.x * scale + dx, 6);
          expect(outline[k]!.y).toBeCloseTo(p.y * scale + dy, 6);
        });
      }
    }
  });

  it('mirrors every base through the centre, so both sides get the same map', () => {
    for (const seed of SEEDS) {
      for (const id of regions(seed)) {
        const { width, height, bases } = regionLevel(seed, id);
        for (const b of bases) {
          const twin = bases.find((o) => o.x === width - b.x && o.y === height - b.y);
          expect(twin?.kind).toBe(b.kind);
          expect(twin?.troops).toBe(b.troops);
        }
      }
    }
  });

  it('makes the tutorial region small and the others full-sized', () => {
    for (const seed of SEEDS) {
      expect(regionLevel(seed, START_ID).bases.length).toBeLessThanOrEqual(8);
      for (const id of getRegion(seed, START_ID).neighbours) {
        expect(regionLevel(seed, id).bases.length).toBeGreaterThanOrEqual(MIN_BASES);
      }
    }
  });
});

describe('medal locks', () => {
  it('opens 1-3 stars from the start, 4 stars at 10 medals and 5 at 25', () => {
    expect([1, 2, 3].every((s) => isUnlocked(s, 0))).toBe(true);
    expect(isUnlocked(4, 9.5)).toBe(false);
    expect(isUnlocked(4, 10)).toBe(true);
    expect(isUnlocked(5, 24.5)).toBe(false);
    expect(isUnlocked(5, 25)).toBe(true);
  });

  it('never leaves the frontier without an unlocked region', () => {
    for (let seed = 1; seed <= 20; seed++) {
      // A player who pushes the hardest open region but never earns a medal (worst case).
      const s = newConquest(seed);
      for (let k = 0; k < 40; k++) {
        const open = availableRegions(s).filter((id) => isUnlocked(s.regions[id]!.stars, 0));
        expect(open.length).toBeGreaterThan(0);
        const pick = open.sort((a, b) => s.regions[b]!.stars - s.regions[a]!.stars)[0]!;
        recordBattle(s, pick, k % 5 !== 4, false, 0);
      }
    }
  });
});

describe('region battle orientation', () => {
  it('starts your HQ on the west or south side, along the region’s long way', () => {
    let turned = 0;
    for (const seed of SEEDS) {
      for (const id of ids(2)) {
        const { width, height, bases } = regionLevel(seed, id);
        const mine = bases.find((b) => b.kind === 'hq' && b.owner === 'player')!;
        const theirs = bases.find((b) => b.kind === 'hq' && b.owner === 'enemy')!;
        // West is smaller x; south is larger y on screen.
        expect(mine.x < theirs.x || mine.y > theirs.y).toBe(true);
        expect(theirs.x).toBe(width - mine.x);
        expect(theirs.y).toBe(height - mine.y);
        if (Math.abs(theirs.y - mine.y) > Math.abs(theirs.x - mine.x) * 0.3) turned++;
      }
    }
    // Some regions really are laid out along a slanted or upright axis.
    expect(turned).toBeGreaterThan(5);
  });
});
