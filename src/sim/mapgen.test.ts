import { describe, expect, it } from 'vitest';
import {
  MAX_BASES,
  MAX_WIDTH,
  MIN_BASES,
  MIN_SPACING,
  MIN_WIDTH,
  generateLevel,
  mapName,
  randomMapSeed,
} from './mapgen';
import type { BaseDef } from './types';

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 487 + 1);

describe('generateLevel', () => {
  it('gives the same map for the same seed', () => {
    expect(generateLevel(48213)).toEqual(generateLevel(48213));
    expect(generateLevel(48213)).not.toEqual(generateLevel(48214));
  });

  it('names maps by seed and keeps the map number', () => {
    const level = generateLevel(77);
    expect(level.seed).toBe(77);
    expect(level.name).toBe(mapName(77));
    expect(level.name).toMatch(/^Operation /);
  });

  it('mirrors every base onto an identical twin for the other side', () => {
    for (const seed of SEEDS) {
      const { width, height, bases } = generateLevel(seed);
      const twinOwner = (b: BaseDef) =>
        b.owner === 'player' ? 'enemy' : b.owner === 'enemy' ? 'player' : 'neutral';
      for (const b of bases) {
        const twin = bases.find((o) => o.x === width - b.x && o.y === height - b.y);
        expect(twin, `map ${seed}`).toBeDefined();
        expect(twin!.kind).toBe(b.kind);
        expect(twin!.troops).toBe(b.troops);
        expect(twin!.owner).toBe(twinOwner(b));
      }
    }
  });

  it('keeps bases spread out on a phone-shaped map', () => {
    for (const seed of SEEDS) {
      const { width, height, bases } = generateLevel(seed);
      expect(width).toBeGreaterThanOrEqual(MIN_WIDTH);
      expect(width).toBeLessThanOrEqual(MAX_WIDTH);
      expect(bases.length).toBeGreaterThanOrEqual(MIN_BASES);
      expect(bases.length).toBeLessThanOrEqual(MAX_BASES);
      for (const [i, a] of bases.entries()) {
        expect(a.x).toBeGreaterThan(0);
        expect(a.x).toBeLessThan(width);
        expect(a.y).toBeGreaterThan(0);
        expect(a.y).toBeLessThan(height);
        for (const b of bases.slice(i + 1)) {
          expect(Math.hypot(a.x - b.x, a.y - b.y), `map ${seed}`).toBeGreaterThanOrEqual(
            MIN_SPACING - 1,
          );
        }
      }
    }
  });

  it('gives each army one HQ, far apart, with a starter base nearby', () => {
    for (const seed of SEEDS) {
      const { width, bases } = generateLevel(seed);
      const hqs = bases.filter((b) => b.kind === 'hq');
      expect(hqs.map((b) => b.owner).sort()).toEqual(['enemy', 'player']);
      const [a, b] = hqs as [BaseDef, BaseDef];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(width * 0.6);
      expect(bases.filter((b) => b.kind !== 'hq').every((b) => b.owner === 'neutral')).toBe(true);
      const player = hqs.find((b) => b.owner === 'player')!;
      expect(player.x).toBeLessThan(width / 2);
      const starter = bases.some(
        (b) =>
          (b.kind === 'barracks' || b.kind === 'outpost') &&
          Math.hypot(b.x - player.x, b.y - player.y) <= 240,
      );
      expect(starter, `map ${seed}`).toBe(true);
    }
  });

  it('puts special bases in the middle, guarded by more troops than the edges', () => {
    for (const seed of SEEDS) {
      const { width, bases } = generateLevel(seed);
      const specials = bases.filter((b) => ['factory', 'radar', 'armory'].includes(b.kind));
      expect(specials.length).toBeGreaterThan(0);
      for (const s of specials) expect(Math.abs(s.x - width / 2)).toBeLessThan(width * 0.2 + 1);
      const neutral = bases.filter((b) => b.owner === 'neutral');
      expect(Math.min(...neutral.map((b) => b.troops))).toBeGreaterThanOrEqual(4);
      expect(Math.max(...neutral.map((b) => b.troops))).toBeLessThanOrEqual(26);
    }
  });
});

describe('randomMapSeed', () => {
  it('stays within the map numbers shown to players', () => {
    expect(randomMapSeed(() => 0)).toBe(1);
    expect(randomMapSeed(() => 0.999999)).toBe(99999);
  });
});
