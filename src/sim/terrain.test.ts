import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './config';
import { generateLevel } from './mapgen';
import { blockedAt, distToPolyline, levelRoutes, routesReachEverywhere } from './paths';
import { MAX_DETOUR } from './terrain';
import { START_ID, naturalStars, regionLevel } from './worldmap';

const SEEDS = Array.from({ length: 80 }, (_, i) => i * 613 + 5);
const withRivers = SEEDS.map(generateLevel).filter((l) => l.rivers?.length);

describe('rivers on random maps', { timeout: 20_000 }, () => {
  it('show up on a good share of maps, each with one to three bridges', () => {
    expect(withRivers.length).toBeGreaterThan(SEEDS.length * 0.25);
    for (const l of withRivers) {
      expect(l.bridges!.length).toBeGreaterThanOrEqual(1);
      expect(l.bridges!.length).toBeLessThanOrEqual(3);
    }
  });

  it('mirror through the centre, bridges and all, so both sides get the same crossing', () => {
    for (const l of withRivers) {
      const twin = (p: { x: number; y: number }) => ({ x: l.width - p.x, y: l.height - p.y });
      for (const b of l.bridges!) {
        const t = twin(b);
        expect(l.bridges!.some((o) => Math.hypot(o.x - t.x, o.y - t.y) < 1e-6)).toBe(true);
      }
      const r = l.rivers![0]!;
      for (const p of r.points) {
        const t = twin(p);
        expect(distToPolyline(t.x, t.y, r.points)).toBeLessThan(1e-6);
      }
    }
  });

  it('keep away from bases and run past the map at both ends', () => {
    for (const l of withRivers) {
      const r = l.rivers![0]!;
      for (const b of l.bases) {
        expect(distToPolyline(b.x, b.y, r.points)).toBeGreaterThan(
          BASE_STATS[b.kind].radius + r.width / 2,
        );
      }
      const ys = r.points.map((p) => p.y);
      expect(Math.min(...ys)).toBeLessThan(Math.min(0, ...l.outline!.map((p) => p.y)));
      expect(Math.max(...ys)).toBeGreaterThan(Math.max(l.height, ...l.outline!.map((p) => p.y)));
    }
  });

  it('leave every base reachable without wading, and never make the HQs too far apart', () => {
    for (const l of withRivers) {
      const routes = levelRoutes(l);
      for (const row of routes) {
        for (const route of row) {
          if (route.length === 0) continue;
          for (let i = 1; i < route.points.length; i++) {
            const [a, b] = [route.points[i - 1]!, route.points[i]!];
            const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6);
            for (let s = 0; s <= n; s++) {
              const [x, y] = [a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n];
              expect(blockedAt(l, x, y, 0), `map ${l.seed}`).toBe(false);
            }
          }
        }
      }
      const p = l.bases.findIndex((b) => b.kind === 'hq' && b.owner === 'player');
      const e = l.bases.findIndex((b) => b.kind === 'hq' && b.owner === 'enemy');
      const [hp, he] = [l.bases[p]!, l.bases[e]!];
      const straight = Math.hypot(hp.x - he.x, hp.y - he.y);
      expect(routes[p]![e]!.length).toBeLessThanOrEqual(MAX_DETOUR * straight);
    }
  });

  it('keep scenery off the water', () => {
    for (const l of withRivers) {
      const r = l.rivers![0]!;
      for (const f of l.features ?? []) {
        expect(distToPolyline(f.x, f.y, r.points)).toBeGreaterThan(f.size + r.width / 2);
      }
    }
  });
});

const withRidges = SEEDS.map(generateLevel).filter((l) => l.ridges?.length);

describe('mountains on random maps', { timeout: 20_000 }, () => {
  it('show up on some maps, in mirrored pairs of ridges', () => {
    expect(withRidges.length).toBeGreaterThan(SEEDS.length * 0.2);
    for (const l of withRidges) {
      expect(l.ridges!.length % 4).toBe(0);
      for (const r of l.ridges!) {
        const twin = r.points.map((p) => ({ x: l.width - p.x, y: l.height - p.y }));
        const match = l.ridges!.some((o) =>
          o.points.every((p, i) => Math.hypot(p.x - twin[i]!.x, p.y - twin[i]!.y) < 1e-6),
        );
        expect(match).toBe(true);
      }
    }
  });

  it('keep away from bases, water and scenery, and leave every base reachable', () => {
    for (const l of withRidges) {
      for (const r of l.ridges!) {
        for (const b of l.bases) {
          expect(distToPolyline(b.x, b.y, r.points)).toBeGreaterThan(
            BASE_STATS[b.kind].radius + r.width / 2,
          );
        }
        for (const river of l.rivers ?? []) {
          for (const p of r.points) {
            expect(distToPolyline(p.x, p.y, river.points)).toBeGreaterThan(
              (r.width + river.width) / 2,
            );
          }
        }
        for (const f of l.features ?? []) {
          expect(distToPolyline(f.x, f.y, r.points)).toBeGreaterThan(f.size + r.width / 2);
        }
      }
      expect(routesReachEverywhere(l)).toBe(true);
    }
  });
});

describe('terrain in conquest regions', { timeout: 20_000 }, () => {
  const ids = ['1,0', '2,1', '3,0', '2,-2', '-3,1', '0,3'];
  const regions = Array.from({ length: 30 }, (_, i) => i + 1).flatMap((seed) =>
    ids.map((id) => ({ stars: naturalStars(seed, id), level: regionLevel(seed, id) })),
  );

  it('grows with the rating: none at one star, gentle rivers at two, mountains from three', () => {
    for (const { stars, level } of regions) {
      if (stars <= 1) expect(level.rivers ?? level.ridges).toBeUndefined();
      if (stars === 2) {
        expect(level.ridges).toBeUndefined();
        if (level.bridges) expect(level.bridges.length).toBe(3);
      }
    }
    const later = regions.filter((r) => r.stars >= 3);
    expect(later.some((r) => r.level.ridges)).toBe(true);
    expect(regions.some((r) => r.stars === 2 && r.level.rivers)).toBe(true);
  });

  it('never touches the tutorial region', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const l = regionLevel(seed, START_ID);
      expect(l.rivers ?? l.ridges).toBeUndefined();
    }
  });

  it('stays fair: every base reachable, HQs not too far apart', () => {
    for (const { level } of regions) {
      if (!level.rivers && !level.ridges) continue;
      expect(routesReachEverywhere(level)).toBe(true);
      const routes = levelRoutes(level);
      const p = level.bases.findIndex((b) => b.kind === 'hq' && b.owner === 'player');
      const e = level.bases.findIndex((b) => b.kind === 'hq' && b.owner === 'enemy');
      const [hp, he] = [level.bases[p]!, level.bases[e]!];
      expect(routes[p]![e]!.length).toBeLessThanOrEqual(
        MAX_DETOUR * Math.hypot(hp.x - he.x, hp.y - he.y),
      );
    }
  });
});
