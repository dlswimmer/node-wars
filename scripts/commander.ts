/**
 * Commander report: how often a Commander Adjutant wins an auto-battle on its own, at each
 * star level, with no upgrades (the worst case) and with a mid-war Command Tent.
 *
 *   npm run commander -- [battles per star]     e.g. npm run commander -- 20
 */
import { createAdjutant, updateAdjutant } from '../src/sim/adjutant';
import { createAi, updateAi } from '../src/sim/ai';
import { difficultyForStars } from '../src/sim/difficulty';
import { PERSONALITIES, rollPersonality } from '../src/sim/personality';
import { NO_UPGRADES, campaignWorldOptions, type UpgradeLevels } from '../src/sim/upgrades';
import { createWorld, isAlive, step } from '../src/sim/world';
import { naturalStars, regionLevel, regionThreat } from '../src/sim/worldmap';

const battles = Number(process.argv[2] ?? 20);
const DT = 0.1;

const MID_WAR: UpgradeLevels = {
  ...NO_UPGRADES,
  fastBuilders: 2,
  quickMarch: 1,
  sharpshooters: 2,
  thickWalls: 1,
  headStart: 1,
};

/** Regions at exactly this many stars (no Threat), across a few worlds. */
function regionsAt(stars: number, count: number) {
  const out: { seed: number; id: string }[] = [];
  for (let seed = 11; out.length < count && seed < 400; seed += 37) {
    for (let i = -9; i <= 9 && out.length < count; i++) {
      for (let j = -9; j <= 9 && out.length < count; j++) {
        const id = `${i},${j}`;
        if (naturalStars(seed, id) === stars && regionThreat(seed, id) === 0)
          out.push({ seed, id });
      }
    }
  }
  return out;
}

function fight(seed: number, id: string, stars: number, levels: UpgradeLevels) {
  const d = difficultyForStars(stars);
  const matchSeed = seed * 1000 + stars;
  const world = createWorld(regionLevel(seed, id), campaignWorldOptions(d, matchSeed, levels));
  const ais = world.armies
    .filter((a) => a !== 'player')
    .map((a, k) => {
      const p = PERSONALITIES[rollPersonality(d.id, matchSeed, k)];
      world.handicap[a] *= p.production;
      return createAi(a, d, p);
    });
  const adj = createAdjutant(5, true, 'player', d);
  while (!world.winner && isAlive(world, 'player') && world.time < 900) {
    updateAdjutant(world, adj, DT);
    for (const ai of ais) updateAi(world, ai, DT);
    step(world, DT);
  }
  return { won: world.winner === 'player', seconds: world.time };
}

console.log(`Commander auto-battles, ${battles} per star level`);
console.log('stars   no upgrades   mid-war tent   avg minutes');
for (let stars = 1; stars <= 5; stars++) {
  const maps = regionsAt(stars, battles);
  const bare = maps.map((m) => fight(m.seed, m.id, stars, NO_UPGRADES));
  const mid = maps.map((m) => fight(m.seed, m.id, stars, MID_WAR));
  const rate = (r: { won: boolean }[]) =>
    `${Math.round((100 * r.filter((x) => x.won).length) / r.length)}%`;
  const minutes = mid.reduce((a, r) => a + r.seconds, 0) / mid.length / 60;
  console.log(
    `${stars}★`.padEnd(8) +
      rate(bare).padStart(11) +
      rate(mid).padStart(15) +
      minutes.toFixed(1).padStart(14),
  );
}
