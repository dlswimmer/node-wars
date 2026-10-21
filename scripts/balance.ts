/**
 * Balance report: simulated players of different skill levels play many matches at every
 * difficulty. Run with `npm run balance` (optionally `-- 500` for more matches per cell), or
 * `npm run balance -- 100 random` to play every match on a different random map.
 */
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../src/sim/difficulty';
import { LEVELS } from '../src/sim/levels';
import { generateLevel } from '../src/sim/mapgen';
import { PROFILES } from '../src/sim/playtest/bots';
import { runMatchup, type LevelSource } from '../src/sim/playtest/harness';

const matches = Number(process.argv[2] ?? 200);
const random = process.argv[3] === 'random';
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
const secs = (x: number | null) => (x === null ? '   -' : `${Math.round(x)}s`.padStart(5));

const sources: { name: string; level: LevelSource; bases: string }[] = random
  ? [{ name: 'Random maps', level: generateLevel, bases: '' }]
  : LEVELS.map((l) => ({ name: l.name, level: l, bases: `/${l.bases.length}` }));

for (const source of sources) {
  console.log(`\n${source.name}: ${matches} matches per cell\n`);
  console.log('difficulty  player           win  loss  t/o   median  1st loss  peak bases');
  for (const d of DIFFICULTY_ORDER) {
    for (const profile of Object.values(PROFILES)) {
      const r = runMatchup(source.level, DIFFICULTIES[d], profile, matches);
      console.log(
        [
          d.padEnd(10),
          profile.label.padEnd(15),
          pct(r.winRate),
          pct(r.lossRate),
          pct(r.timeoutRate),
          `  ${secs(r.medianSeconds)}`,
          `  ${secs(r.medianFirstLoss)}`,
          `    ${r.medianPeakBases}${source.bases}`,
        ].join(' '),
      );
    }
    console.log('');
  }
}
