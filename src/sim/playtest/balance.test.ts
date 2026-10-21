import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../difficulty';
import { LEVELS } from '../levels';
import { generateLevel } from '../mapgen';
import { PROFILES } from './bots';
import { runMatchup } from './harness';

/**
 * Guards the difficulty tuning against simulated players. If a balance change moves one of
 * these out of its band, re-run `npm run balance` and decide whether the new numbers are right.
 */
const MATCHES = 60;
const level = LEVELS[0]!;

const cases = [
  { difficulty: 'recruit', profile: 'newKid', min: 0.85, max: 1 },
  { difficulty: 'soldier', profile: 'kid', min: 0.75, max: 1 },
  { difficulty: 'soldier', profile: 'newKid', min: 0.4, max: 0.85 },
  { difficulty: 'general', profile: 'kid', min: 0, max: 0.25 },
  { difficulty: 'general', profile: 'adult', min: 0.12, max: 0.45 },
] as const;

describe('difficulty balance', () => {
  for (const c of cases) {
    it(`${c.difficulty} vs ${c.profile}: win rate ${c.min * 100}-${c.max * 100}%`, () => {
      const r = runMatchup(level, DIFFICULTIES[c.difficulty], PROFILES[c.profile]!, MATCHES);
      expect(r.timeoutRate).toBe(0);
      expect(r.winRate).toBeGreaterThanOrEqual(c.min);
      expect(r.winRate).toBeLessThanOrEqual(c.max);
    });
  }

  it('Soldier matches last long enough to feel like a battle', () => {
    const r = runMatchup(level, DIFFICULTIES.soldier, PROFILES.kid!, MATCHES);
    expect(r.medianSeconds).toBeGreaterThan(90);
    expect(r.medianSeconds).toBeLessThan(360);
  });

  // Every match on a different random map: the same bands should hold.
  const randomCases = [
    { difficulty: 'recruit', profile: 'newKid', min: 0.8, max: 1 },
    { difficulty: 'soldier', profile: 'kid', min: 0.75, max: 0.95 },
    { difficulty: 'general', profile: 'kid', min: 0, max: 0.3 },
    { difficulty: 'general', profile: 'adult', min: 0.15, max: 0.45 },
  ] as const;
  for (const c of randomCases) {
    it(`random maps, ${c.difficulty} vs ${c.profile}: win rate ${c.min * 100}-${c.max * 100}%`, () => {
      const r = runMatchup(
        generateLevel,
        DIFFICULTIES[c.difficulty],
        PROFILES[c.profile]!,
        MATCHES,
        1000,
      );
      expect(r.timeoutRate).toBe(0);
      expect(r.winRate).toBeGreaterThanOrEqual(c.min);
      expect(r.winRate).toBeLessThanOrEqual(c.max);
    });
  }
});
