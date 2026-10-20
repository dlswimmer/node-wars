import { worldOptionsFor, type Difficulty, type DifficultyId } from './difficulty';
import type { WorldOptions } from './world';

export type UpgradeId =
  'headStart' | 'fastBuilders' | 'quickMarch' | 'strongShield' | 'heavyTanks' | 'adjutant';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** What one level does, in kid words. */
  perLevel: string;
  /** Medal cost of each level (index 0 buys level 1). */
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'headStart', name: 'HEAD START', perLevel: '+5 troops in your HQ', costs: [1, 2, 3, 5, 8] },
  {
    id: 'fastBuilders',
    name: 'FAST BUILDERS',
    perLevel: '+8% troop building',
    costs: [1, 2, 3, 5, 8],
  },
  { id: 'quickMarch', name: 'QUICK MARCH', perLevel: '+6% troop speed', costs: [1, 2, 3, 5, 8] },
  {
    id: 'strongShield',
    name: 'STRONG SHIELD',
    perLevel: '+5 s opening shield',
    costs: [1, 2, 3, 5, 8],
  },
  { id: 'heavyTanks', name: 'HEAVY TANKS', perLevel: 'Tanks worth +1 troop', costs: [3, 6] },
  {
    id: 'adjutant',
    name: 'ADJUTANT',
    perLevel: 'An AI officer that helps you',
    costs: [1, 3, 5, 8, 12],
  },
];

export type UpgradeLevels = Record<UpgradeId, number>;

export const NO_UPGRADES: UpgradeLevels = {
  headStart: 0,
  fastBuilders: 0,
  quickMarch: 0,
  strongShield: 0,
  heavyTanks: 0,
  adjutant: 0,
};

/** What each Adjutant level adds, shown in the Command Tent. */
export const ADJUTANT_LEVELS = [
  'DEFENDER: reinforces bases about to fall',
  'QUARTERMASTER: full bases send extra troops forward',
  'SCOUT: grabs gray bases it is sure to win',
  'FIELD OFFICER: attacks when the odds are good',
  'COMMANDER: can auto-battle ranks you have mastered',
];

/** Wins you need yourself at a rank before the Adjutant may auto-battle it. */
export const MASTERY_WINS = 5;
/** Share of the normal medals an auto-battle pays. */
export const AUTO_BATTLE_REWARD = 0.5;

const MEDAL_RATE: Record<DifficultyId, number> = { recruit: 0.5, soldier: 1, general: 1.5 };

/** Medals for a campaign battle: 1 per win, scaled by rank (and halved for auto-battles). */
export function medalsFor(rank: DifficultyId, won: boolean, auto = false): number {
  if (!won) return 0;
  return MEDAL_RATE[rank] * (auto ? AUTO_BATTLE_REWARD : 1);
}

export function nextCost(levels: UpgradeLevels, id: UpgradeId): number | null {
  const def = UPGRADES.find((u) => u.id === id)!;
  return def.costs[levels[id]] ?? null;
}

/** How the player's upgrades change a campaign battle. */
export function upgradeOptions(levels: UpgradeLevels, baseShield: number): Partial<WorldOptions> {
  return {
    startTroops: { player: 5 * levels.headStart },
    boosts: { player: { speed: 1 + 0.06 * levels.quickMarch, tankPower: levels.heavyTanks } },
    shield: { player: baseShield + 5 * levels.strongShield },
    // Production is applied through the handicap multiplier.
    handicap: { player: 1 + 0.08 * levels.fastBuilders },
  };
}

/** Show medals with fractions kids can read: 7.5 → "7½". */
export function formatMedals(medals: number): string {
  const whole = Math.floor(medals + 1e-9);
  const rest = medals - whole;
  const frac = rest > 0.7 ? '¾' : rest > 0.4 ? '½' : rest > 0.1 ? '¼' : '';
  return whole === 0 && frac ? frac : `${whole}${frac}`;
}

/** World setup for a campaign battle: the rank's settings plus the player's upgrades. */
export function campaignWorldOptions(
  d: Difficulty,
  seed: number,
  levels: UpgradeLevels,
): WorldOptions {
  const base = worldOptionsFor(d, seed);
  const up = upgradeOptions(levels, d.shieldSeconds);
  return {
    ...base,
    ...up,
    handicap: { ...base.handicap, ...up.handicap },
    shield: { ...base.shield, ...up.shield },
  };
}
