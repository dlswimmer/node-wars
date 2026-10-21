import { worldOptionsFor, type Difficulty } from './difficulty';
import { UPGRADE_COSTS, autoBattleMedals, winMedals } from './economy';
import type { WorldOptions } from './world';

export type UpgradeId =
  'headStart' | 'fastBuilders' | 'quickMarch' | 'strongShield' | 'heavyTanks' | 'adjutant';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** What one level does, in kid words. */
  perLevel: string;
  /** Medal cost of each level (index 0 buys level 1); see UPGRADE_COSTS in economy.ts. */
  costs: number[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'headStart',
    name: 'HEAD START',
    perLevel: '+5 troops in your HQ',
    costs: UPGRADE_COSTS.headStart,
  },
  {
    id: 'fastBuilders',
    name: 'FAST BUILDERS',
    perLevel: '+8% troop building',
    costs: UPGRADE_COSTS.fastBuilders,
  },
  {
    id: 'quickMarch',
    name: 'QUICK MARCH',
    perLevel: '+6% troop speed',
    costs: UPGRADE_COSTS.quickMarch,
  },
  {
    id: 'strongShield',
    name: 'STRONG SHIELD',
    perLevel: '+5 s opening shield',
    costs: UPGRADE_COSTS.strongShield,
  },
  {
    id: 'heavyTanks',
    name: 'HEAVY TANKS',
    perLevel: 'Tanks worth +1 troop',
    costs: UPGRADE_COSTS.heavyTanks,
  },
  {
    id: 'adjutant',
    name: 'ADJUTANT',
    perLevel: 'An AI officer that helps you',
    costs: UPGRADE_COSTS.adjutant,
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
  'COMMANDER: auto-battles your regions at stars you have mastered',
];

/** Wins you need yourself at a star level before the Adjutant may auto-battle it. */
export const MASTERY_WINS = 5;
/** Medals for a campaign battle in a region with this many stars (see economy.ts). */
export function medalsFor(stars: number, won: boolean, auto = false): number {
  if (!won) return 0;
  return auto ? autoBattleMedals(stars) : winMedals(stars);
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
