/**
 * Balance report: simulated players of different skill levels play many matches at every
 * difficulty. Run with `npm run balance` (optionally `-- 500` for more matches per cell), or
 * `npm run balance -- 100 random` to play every match on a different random map
 * (`regions` for conquest-map regions, `ffa` for three-army Free-for-All maps). Covers every tier, including the two only the
 * conquest map uses. A fourth argument picks the enemy personality (see personality.ts).
 */
import { DIFFICULTIES, STAR_DIFFICULTY } from '../src/sim/difficulty';
import { LEVELS } from '../src/sim/levels';
import { generateFreeForAll, generateLevel } from '../src/sim/mapgen';
import { PROFILES } from '../src/sim/playtest/bots';
import { regionLevel } from '../src/sim/worldmap';
import { runMatchup, type LevelSource, type PersonalityChoice } from '../src/sim/playtest/harness';

const matches = Number(process.argv[2] ?? 200);
const mode = process.argv[3];
/** Enemy personality: steady (default), rusher, turtle, raider, opportunist, or mixed. */
const personality = (process.argv[4] ?? 'steady') as PersonalityChoice;
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
const secs = (x: number | null) => (x === null ? '   -' : `${Math.round(x)}s`.padStart(5));

// Conquest regions: a different region of a different world each match (never the tutorial).
const region = (seed: number) => regionLevel(seed, `${1 + (seed % 3)},${seed % 2}`);
const sources: { name: string; level: LevelSource; bases: string }[] =
  mode === 'random'
    ? [{ name: 'Random maps', level: generateLevel, bases: '' }]
    : mode === 'regions'
      ? [{ name: 'Conquest regions', level: region, bases: '' }]
      : mode === 'ffa'
        ? [{ name: 'Free-for-All (3 armies)', level: generateFreeForAll, bases: '' }]
        : LEVELS.map((l) => ({ name: l.name, level: l, bases: `/${l.bases.length}` }));

for (const source of sources) {
  console.log(`\n${source.name}: ${matches} matches per cell\n`);
  console.log('difficulty  player           win  loss  t/o   median  1st loss  peak bases');
  for (const d of STAR_DIFFICULTY) {
    for (const profile of Object.values(PROFILES)) {
      const r = runMatchup(source.level, DIFFICULTIES[d], profile, matches, 1, personality);
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
