import { createAi, updateAi } from '../ai';
import { PERSONALITIES, rollPersonality, type PersonalityId } from '../personality';
import { worldOptionsFor, type Difficulty } from '../difficulty';
import type { Army, LevelDef } from '../types';
import { countBases, createWorld, isAlive, step } from '../world';
import { createBot, updateBot, type HumanProfile } from './bots';

export interface MatchResult {
  winner: Army | 'timeout';
  seconds: number;
  /** Most bases the player held at once; a proxy for "felt like I was winning". */
  peakPlayerBases: number;
  /** Seconds until the enemy first captured one of the player's bases. */
  firstLoss: number | null;
}

const DT = 0.1;

export function runMatch(
  level: LevelDef,
  difficulty: Difficulty,
  profile: HumanProfile,
  seed: number,
  maxSeconds = 900,
  personality: PersonalityChoice = 'steady',
): MatchResult {
  const world = createWorld(level, worldOptionsFor(difficulty, seed));
  const ais = world.armies
    .filter((a) => a !== 'player')
    .map((a, k) => {
      const p = PERSONALITIES[pickPersonality(personality, difficulty, seed, k)];
      world.handicap[a] *= p.production;
      return createAi(a, difficulty, p);
    });
  const bot = createBot(profile, seed * 7919 + 13);
  let peak = 0;
  let firstLoss: number | null = null;
  let prevOwned = countBases(world, 'player');

  // Knocked out while two other armies fight on counts as a loss, as it does in the game.
  while (!world.winner && isAlive(world, 'player') && world.time < maxSeconds) {
    updateBot(world, bot, DT);
    for (const ai of ais) updateAi(world, ai, DT);
    step(world, DT);
    const owned = countBases(world, 'player');
    if (owned < prevOwned && firstLoss === null) firstLoss = world.time;
    prevOwned = owned;
    peak = Math.max(peak, owned);
  }
  return {
    winner: world.winner ?? (isAlive(world, 'player') ? 'timeout' : 'enemy'),
    seconds: world.time,
    peakPlayerBases: peak,
    firstLoss,
  };
}

/** One personality for every AI, or 'mixed' to roll one per battle as the game does. */
export type PersonalityChoice = PersonalityId | 'mixed';

/** The personality AI army number `k` plays in the battle with this seed. */
function pickPersonality(choice: PersonalityChoice, rank: Difficulty, seed: number, k: number) {
  return choice === 'mixed' ? rollPersonality(rank.id, seed, k) : choice;
}

export interface MatchupSummary {
  matches: number;
  winRate: number;
  lossRate: number;
  timeoutRate: number;
  medianSeconds: number;
  medianFirstLoss: number | null;
  medianPeakBases: number;
}

/** A fixed level, or one picked per match (e.g. a random map from the match's seed). */
export type LevelSource = LevelDef | ((seed: number) => LevelDef);

export function runMatchup(
  level: LevelSource,
  difficulty: Difficulty,
  profile: HumanProfile,
  matches: number,
  seedBase = 1,
  personality: PersonalityChoice = 'steady',
): MatchupSummary {
  const results = Array.from({ length: matches }, (_, i) => {
    const seed = seedBase + i;
    const map = typeof level === 'function' ? level(seed) : level;
    return runMatch(map, difficulty, profile, seed, 900, personality);
  });
  const rate = (w: MatchResult['winner']) => results.filter((r) => r.winner === w).length / matches;
  const losses = results.map((r) => r.firstLoss).filter((t): t is number => t !== null);
  return {
    matches,
    winRate: rate('player'),
    // Any other army winning is a loss (with three armies it may not be the enemy).
    lossRate:
      results.filter((r) => r.winner !== 'player' && r.winner !== 'timeout').length / matches,
    timeoutRate: rate('timeout'),
    medianSeconds: median(results.map((r) => r.seconds)),
    medianFirstLoss: losses.length ? median(losses) : null,
    medianPeakBases: median(results.map((r) => r.peakPlayerBases)),
  };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}
