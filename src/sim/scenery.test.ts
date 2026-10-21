import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './config';
import { LEVELS } from './levels';
import { generateLevel } from './mapgen';
import { OUTLINE_POINTS, edgeDistance, insidePolygon } from './scenery';
import type { LevelDef } from './types';

const LEVELS_TO_CHECK: LevelDef[] = [
  LEVELS[0]!,
  ...Array.from({ length: 150 }, (_, i) => generateLevel(i * 613 + 5)),
];

describe('map outline', () => {
  it('is the same for the same map', () => {
    expect(generateLevel(321).outline).toEqual(generateLevel(321).outline);
    expect(generateLevel(321).features).toEqual(generateLevel(321).features);
  });

  it('is mirrored like the bases', () => {
    for (const level of LEVELS_TO_CHECK) {
      const outline = level.outline!;
      expect(outline).toHaveLength(OUTLINE_POINTS);
      const half = OUTLINE_POINTS / 2;
      for (let i = 0; i < half; i++) {
        expect(outline[i + half]).toEqual({
          x: level.width - outline[i]!.x,
          y: level.height - outline[i]!.y,
        });
      }
    }
  });

  it('holds every base and its label with room to spare', () => {
    for (const level of LEVELS_TO_CHECK) {
      for (const b of level.bases) {
        expect(insidePolygon(b, level.outline!), level.id).toBe(true);
        expect(edgeDistance(b, level.outline!), level.id).toBeGreaterThanOrEqual(
          BASE_STATS[b.kind].radius + 20,
        );
        expect(edgeDistance({ x: b.x, y: b.y + 45 }, level.outline!)).toBeGreaterThan(15);
      }
    }
  });
});

describe('scenery', () => {
  it('is mirrored, inside the map, and clear of bases and labels', () => {
    for (const level of LEVELS_TO_CHECK) {
      const features = level.features!;
      expect(features.length).toBeGreaterThanOrEqual(4);
      for (const f of features) {
        const twin = features.find((o) => o.x === level.width - f.x && o.y === level.height - f.y);
        expect(twin?.kind).toBe(f.kind);
        expect(twin?.size).toBe(f.size);
        expect(insidePolygon(f, level.outline!)).toBe(true);
        expect(edgeDistance(f, level.outline!)).toBeGreaterThanOrEqual(f.size);
        for (const b of level.bases) {
          const gap = Math.hypot(f.x - b.x, f.y - b.y) - f.size - BASE_STATS[b.kind].radius;
          expect(gap, level.id).toBeGreaterThanOrEqual(30);
          expect(Math.hypot(f.x - b.x, f.y - b.y - 48) - f.size).toBeGreaterThanOrEqual(40);
        }
      }
    }
  });
});
