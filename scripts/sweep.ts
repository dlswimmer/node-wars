/**
 * Searches AI settings for ones that hit a target win rate against a simulated player.
 * Usage: `npm run sweep -- <profileId> <targetWinRate> [matches]`, e.g. `npm run sweep -- kid 0.7`.
 */
import { DIFFICULTIES, type Difficulty } from '../src/sim/difficulty';
import { LEVELS } from '../src/sim/levels';
import { PROFILES } from '../src/sim/playtest/bots';
import { runMatchup } from '../src/sim/playtest/harness';

const profile = PROFILES[process.argv[2] ?? 'kid'];
const target = Number(process.argv[3] ?? 0.7);
const matches = Number(process.argv[4] ?? 60);
if (!profile) throw new Error(`Unknown profile. Try: ${Object.keys(PROFILES).join(', ')}`);

const rows: { s: Difficulty; win: number; secs: number }[] = [];
for (const aiInterval of [1.5, 2, 2.5, 3]) {
  for (const aiMaxSources of [1, 2]) {
    for (const enemyProduction of [0.8, 0.9, 1]) {
      for (const aiGracePeriod of [20, 40]) {
        const s: Difficulty = {
          ...DIFFICULTIES.soldier,
          aiInterval,
          aiMaxSources,
          enemyProduction,
          aiGracePeriod,
        };
        const r = runMatchup(LEVELS[0]!, s, profile, matches);
        rows.push({ s, win: r.winRate, secs: r.medianSeconds });
      }
    }
  }
}

rows.sort((a, b) => Math.abs(a.win - target) - Math.abs(b.win - target));
console.log(`Closest to ${target * 100}% wins for ${profile.label}:`);
for (const { s, win, secs } of rows.slice(0, 12)) {
  console.log(
    `interval ${s.aiInterval}  sources ${s.aiMaxSources}  production ${s.enemyProduction}  grace ${s.aiGracePeriod}  ->  win ${Math.round(win * 100)}%  median ${Math.round(secs)}s`,
  );
}
