/**
 * Balance report: simulated players of different skill levels play many matches at every
 * difficulty. Run with `npm run balance` (optionally `-- 500` for more matches per cell).
 */
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../src/sim/difficulty';
import { LEVELS } from '../src/sim/levels';
import { PROFILES } from '../src/sim/playtest/bots';
import { runMatchup } from '../src/sim/playtest/harness';

const matches = Number(process.argv[2] ?? 200);
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
const secs = (x: number | null) => (x === null ? '   -' : `${Math.round(x)}s`.padStart(5));

for (const level of LEVELS) {
  console.log(`\n${level.name}: ${matches} matches per cell\n`);
  console.log('difficulty  player           win  loss  t/o   median  1st loss  peak bases');
  for (const d of DIFFICULTY_ORDER) {
    for (const profile of Object.values(PROFILES)) {
      const r = runMatchup(level, DIFFICULTIES[d], profile, matches);
      console.log(
        [
          d.padEnd(10),
          profile.label.padEnd(15),
          pct(r.winRate),
          pct(r.lossRate),
          pct(r.timeoutRate),
          `  ${secs(r.medianSeconds)}`,
          `  ${secs(r.medianFirstLoss)}`,
          `    ${r.medianPeakBases}/${level.bases.length}`,
        ].join(' '),
      );
    }
    console.log('');
  }
}
