import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './config';
import { generateLevel } from './mapgen';
import { blockedAt, distToPolyline, levelRoutes } from './paths';
import { MAX_DETOUR } from './rivers';

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
