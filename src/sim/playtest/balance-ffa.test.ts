import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../difficulty';
import { generateFreeForAll } from '../mapgen';
import { PROFILES } from './bots';
import { runMatchup } from './harness';

/** Matches per case, as in balance.test.ts. */
const MATCHES = 60;

// Split from balance.test.ts so no single test worker runs for over a minute (CI flags that).
// Three-army Free-for-All (Quick Battle): the two AIs fight each other too, so it plays a bit
// easier at the top ranks than one against one.
describe('free-for-all balance', { timeout: 30_000 }, () => {
  const ffaCases = [
    { difficulty: 'recruit', profile: 'newKid', min: 0.85, max: 1 },
    { difficulty: 'soldier', profile: 'kid', min: 0.7, max: 1 },
    { difficulty: 'general', profile: 'adult', min: 0.1, max: 0.55 },
  ] as const;
  for (const c of ffaCases) {
    it(`${c.difficulty} vs ${c.profile}: win rate ${Math.round(c.min * 100)}-${Math.round(c.max * 100)}%`, () => {
      const r = runMatchup(
        generateFreeForAll,
        DIFFICULTIES[c.difficulty],
        PROFILES[c.profile]!,
        MATCHES,
        4000,
      );
      expect(r.timeoutRate).toBeLessThanOrEqual(0.05);
      expect(r.winRate).toBeGreaterThanOrEqual(c.min);
      expect(r.winRate).toBeLessThanOrEqual(c.max);
    });
  }
});
