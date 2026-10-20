import { createAi, updateAi } from '../ai';
import { worldOptionsFor, type Difficulty } from '../difficulty';
import type { Army, LevelDef } from '../types';
import { countBases, createWorld, step } from '../world';
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
): MatchResult {
  const world = createWorld(level, worldOptionsFor(difficulty, seed));
  const ai = createAi('enemy', difficulty);
  const bot = createBot(profile, seed * 7919 + 13);
  let peak = 0;
  let firstLoss: number | null = null;
  let prevOwned = countBases(world, 'player');

  while (!world.winner && world.time < maxSeconds) {
    updateBot(world, bot, DT);
    updateAi(world, ai, DT);
    step(world, DT);
    const owned = countBases(world, 'player');
    if (owned < prevOwned && firstLoss === null) firstLoss = world.time;
    prevOwned = owned;
    peak = Math.max(peak, owned);
  }
  return {
    winner: world.winner ?? 'timeout',
    seconds: world.time,
    peakPlayerBases: peak,
    firstLoss,
  };
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

export function runMatchup(
  level: LevelDef,
  difficulty: Difficulty,
  profile: HumanProfile,
  matches: number,
  seedBase = 1,
): MatchupSummary {
  const results = Array.from({ length: matches }, (_, i) =>
    runMatch(level, difficulty, profile, seedBase + i),
  );
  const rate = (w: MatchResult['winner']) => results.filter((r) => r.winner === w).length / matches;
  const losses = results.map((r) => r.firstLoss).filter((t): t is number => t !== null);
  return {
    matches,
    winRate: rate('player'),
    lossRate: rate('enemy'),
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
