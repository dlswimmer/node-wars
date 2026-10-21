import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../difficulty';
import { START_ID, regionLevel } from '../worldmap';
import { PROFILES } from './bots';
import { runMatchup } from './harness';

/** Matches per case, as in balance.test.ts. */
const MATCHES = 60;

// Split from balance.test.ts so no single test worker runs for over a minute (CI flags that).
describe('conquest region balance', { timeout: 30_000 }, () => {
  // Conquest regions (a different region of a different world each match), including the
  // two tiers only the conquest map uses: Corporal (2 stars) and Marshal (5 stars).
  const region = (seed: number) => regionLevel(seed, `${1 + (seed % 3)},${seed % 2}`);
  const regionCases = [
    { difficulty: 'recruit', profile: 'newKid', min: 0.85, max: 1 },
    { difficulty: 'corporal', profile: 'newKid', min: 0.6, max: 0.92 },
    { difficulty: 'corporal', profile: 'kid', min: 0.85, max: 1 },
    { difficulty: 'soldier', profile: 'kid', min: 0.75, max: 1 },
    { difficulty: 'general', profile: 'adult', min: 0.08, max: 0.45 },
    { difficulty: 'marshal', profile: 'kid', min: 0, max: 0.12 },
    { difficulty: 'marshal', profile: 'adult', min: 0.05, max: 0.3 },
  ] as const;
  for (const c of regionCases) {
    it(`regions, ${c.difficulty} vs ${c.profile}: win rate ${c.min * 100}-${c.max * 100}%`, () => {
      const r = runMatchup(
        region,
        DIFFICULTIES[c.difficulty],
        PROFILES[c.profile]!,
        MATCHES,
        2000,
        'mixed',
      );
      expect(r.timeoutRate).toBe(0);
      expect(r.winRate).toBeGreaterThanOrEqual(c.min);
      expect(r.winRate).toBeLessThanOrEqual(c.max);
    });
  }

  it('the tutorial region is an easy first win', () => {
    const tutorial = (seed: number) => regionLevel(seed, START_ID);
    const r = runMatchup(tutorial, DIFFICULTIES.recruit, PROFILES.newKid!, MATCHES, 3000, 'mixed');
    expect(r.winRate).toBeGreaterThanOrEqual(0.9);
  });
});
