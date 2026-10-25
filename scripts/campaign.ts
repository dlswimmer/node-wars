/**
 * Campaign report: bot players fight whole wars on the conquest map, buy Command Tent
 * upgrades as medals come in, push until they hit the wall (or retreat early, by strategy),
 * make a Tactical Retreat, spend Honor in the War College, and go again.
 *
 *   npm run campaign -- [profile] [wars]     e.g. npm run campaign -- newKid 6
 *
 * Shows, war by war, how far each strategy gets and how much Honor it earns per battle
 * (battles stand in for play time), so we can check that pushing deep beats retreating
 * early, and when a new 8-year-old starts beating 5-star regions.
 */
import { canRetreat, honorFor } from '../src/sim/college';
import {
  collegeCost,
  collegeEffects,
  collegeState,
  collegeWeb,
  visibleRings,
} from '../src/sim/collegeweb';
import { difficultyForStars } from '../src/sim/difficulty';
import { PROFILES } from '../src/sim/playtest/bots';
import { runMatch } from '../src/sim/playtest/harness';
import {
  NO_UPGRADES,
  UPGRADES,
  campaignWorldOptions,
  medalsFor,
  nextCost,
  type UpgradeLevels,
} from '../src/sim/upgrades';
import {
  availableRegions,
  isUnlocked,
  naturalStars,
  newConquest,
  recordBattle,
  regionLevel,
  regionThreat,
  type ConquestState,
} from '../src/sim/worldmap';

const profileId = process.argv[2] ?? 'newKid';
const wars = Number(process.argv[3] ?? 6);
const profile = PROFILES[profileId]!;
/** A war ends after this many losses in a row: the bot has hit the wall. */
const WALL_LOSSES = 4;
/** And never runs longer than this. */
const MAX_BATTLES = 80;

interface Player {
  honor: number;
  /** War College web nodes owned. */
  college: string[];
}

/** Spend on the cheapest thing first, like a kid who wants something now. */
function buyCheapest(costOf: () => { cost: number; buy: () => void } | null, wallet: () => number) {
  for (;;) {
    const next = costOf();
    if (!next || next.cost > wallet()) return;
    next.buy();
  }
}

/** Fight one war; returns what it achieved. */
function war(player: Player, seed: number, retreatAfter: number) {
  const conquest: ConquestState = newConquest(seed);
  const edge = collegeEffects(player.college);
  let medals = edge.startMedals;
  let earned = medals;
  const upgrades: UpgradeLevels = { ...NO_UPGRADES };
  let battles = 0;
  let lossesInRow = 0;
  let bestStars = 0;
  let bestThreat = 0;
  /** Hardest region beaten so far (stars plus Threat). */
  let bestHard = 1;
  let seconds = 0;
  while (battles < MAX_BATTLES && lossesInRow < WALL_LOSSES) {
    if (battles >= retreatAfter && canRetreat(conquest)) break;
    // A kid chasing medals picks the hardest region up to one step past the best they beat.
    const open = availableRegions(conquest).filter((id) =>
      isUnlocked(conquest.regions[id]!.stars, earned),
    );
    if (open.length === 0) break;
    const hard = (id: string) => conquest.regions[id]!.stars + regionThreat(seed, id);
    const reach = open.filter((id) => hard(id) <= bestHard + 1);
    const pool = reach.length > 0 ? reach : open;
    const id = pool.sort((a, b) => hard(b) - hard(a) || a.localeCompare(b))[0]!;
    const stars = conquest.regions[id]!.stars;
    const threat = regionThreat(seed, id);
    const d = difficultyForStars(stars);
    const matchSeed = seed * 1000 + battles;
    const options = campaignWorldOptions(d, matchSeed, upgrades, threat, edge);
    const r = runMatch(regionLevel(seed, id), d, profile, matchSeed, 900, 'mixed', options);
    const won = r.winner === 'player';
    battles++;
    seconds += r.seconds;
    if (won) {
      lossesInRow = 0;
      const pay = medalsFor(stars, true, false, threat, edge.medals);
      medals += pay;
      earned += pay;
      bestStars = Math.max(bestStars, naturalStars(seed, id));
      bestThreat = Math.max(bestThreat, threat);
      bestHard = Math.max(bestHard, stars + threat);
    } else {
      lossesInRow++;
    }
    recordBattle(conquest, id, won, false, earned);
    buyCheapest(
      () => {
        const options = UPGRADES.map((u) => ({ u, cost: nextCost(upgrades, u.id) })).filter(
          (o) => o.cost !== null,
        );
        if (options.length === 0) return null;
        const pick = options.sort((a, b) => a.cost! - b.cost!)[0]!;
        return {
          cost: pick.cost!,
          buy: () => {
            medals -= pick.cost!;
            upgrades[pick.u.id] += 1;
          },
        };
      },
      () => medals,
    );
  }
  const honor = honorFor(conquest);
  return {
    battles,
    held: conquest.held.length,
    bestStars,
    bestThreat,
    honor,
    minutes: seconds / 60,
  };
}

for (const [name, retreatAfter] of [
  ['retreat after 8 battles', 8],
  ['retreat after 20 battles', 20],
  ['push to the wall', Infinity],
] as const) {
  console.log(`\n${profile.label}, ${name}:`);
  console.log('war  battles  held  best★  threat  honor  honor/battle  minutes  total honor');
  const player: Player = { honor: 0, college: [] };
  let total = 0;
  for (let w = 0; w < wars; w++) {
    const r = war(player, 1000 + w * 17, retreatAfter);
    total += r.honor;
    player.honor += r.honor;
    buyCheapest(
      () => {
        // The cheapest open node, abilities first among equals (a kid wants the cool ones).
        const options = collegeWeb(visibleRings(player.college))
          .filter((n) => collegeState(n, player.college) === 'open')
          .map((n) => ({ n, cost: collegeCost(n) - (n.ability ? 0.5 : 0) }));
        if (options.length === 0) return null;
        const pick = options.sort((a, b) => a.cost - b.cost || a.n.id.localeCompare(b.n.id))[0]!;
        return {
          cost: collegeCost(pick.n),
          buy: () => {
            player.honor -= collegeCost(pick.n);
            player.college.push(pick.n.id);
          },
        };
      },
      () => player.honor,
    );
    console.log(
      [
        String(w + 1).padStart(3),
        String(r.battles).padStart(8),
        String(r.held).padStart(5),
        String(r.bestStars).padStart(6),
        String(r.bestThreat).padStart(7),
        String(r.honor).padStart(6),
        (r.honor / Math.max(1, r.battles)).toFixed(2).padStart(13),
        r.minutes.toFixed(0).padStart(8),
        String(total).padStart(12),
      ].join(' '),
    );
  }
}
