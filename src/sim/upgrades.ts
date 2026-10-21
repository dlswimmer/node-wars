import { worldOptionsFor, type Difficulty } from './difficulty';
import { UPGRADE_COSTS, autoBattleMedals, winMedals } from './economy';
import type { WorldOptions } from './world';

export type UpgradeId =
  | 'headStart'
  | 'fastBuilders'
  | 'quickMarch'
  | 'sharpshooters'
  | 'recruiters'
  | 'eliteGuard'
  | 'strongShield'
  | 'thickWalls'
  | 'heavyTanks'
  | 'afterburners'
  | 'fieldMedics'
  | 'adjutant';

/** The Command Tent's two pages. */
export type UpgradeTab = 'army' | 'bases';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  tab: UpgradeTab;
  /** What this many levels add up to, in kid words ("+16% troop building"). */
  total: (levels: number) => string;
  /** Medal cost of each level (index 0 buys level 1); see UPGRADE_COSTS in economy.ts. */
  costs: number[];
}

const pct = (n: number) => `+${Math.round(n)}%`;

const DEFS: Omit<UpgradeDef, 'costs'>[] = [
  { id: 'headStart', name: 'HEAD START', tab: 'army', total: (n) => `+${5 * n} troops in your HQ` },
  {
    id: 'fastBuilders',
    name: 'FAST BUILDERS',
    tab: 'army',
    total: (n) => `${pct(8 * n)} troop building`,
  },
  { id: 'quickMarch', name: 'QUICK MARCH', tab: 'army', total: (n) => `${pct(6 * n)} troop speed` },
  {
    id: 'sharpshooters',
    name: 'SHARPSHOOTERS',
    tab: 'army',
    total: (n) => `troops hit ${pct(5 * n)} harder`,
  },
  {
    id: 'recruiters',
    name: 'RECRUITERS',
    tab: 'army',
    total: (n) => `+${2 * n} troops in each base you capture`,
  },
  {
    id: 'eliteGuard',
    name: 'ELITE GUARD',
    tab: 'army',
    total: (n) => `your HQ holds +${15 * n} troops`,
  },
  {
    id: 'strongShield',
    name: 'STRONG SHIELD',
    tab: 'bases',
    total: (n) => `+${5 * n} s opening shield`,
  },
  {
    id: 'thickWalls',
    name: 'THICK WALLS',
    tab: 'bases',
    total: (n) => `your bases hold ${pct(10 * n)} more`,
  },
  {
    id: 'heavyTanks',
    name: 'HEAVY TANKS',
    tab: 'bases',
    total: (n) => `tanks worth +${n} troop${n === 1 ? '' : 's'}`,
  },
  {
    id: 'afterburners',
    name: 'AFTERBURNERS',
    tab: 'bases',
    total: (n) => `jets fly ${pct(15 * n)} faster`,
  },
  {
    id: 'fieldMedics',
    name: 'FIELD MEDICS',
    tab: 'bases',
    total: (n) => `Hospitals save ${pct(8 * n)} more troops`,
  },
  { id: 'adjutant', name: 'ADJUTANT', tab: 'bases', total: () => 'An AI officer that helps you' },
];

export const UPGRADES: UpgradeDef[] = DEFS.map((u) => ({ ...u, costs: UPGRADE_COSTS[u.id] }));

export type UpgradeLevels = Record<UpgradeId, number>;

export const NO_UPGRADES: UpgradeLevels = {
  headStart: 0,
  fastBuilders: 0,
  quickMarch: 0,
  sharpshooters: 0,
  recruiters: 0,
  eliteGuard: 0,
  strongShield: 0,
  thickWalls: 0,
  heavyTanks: 0,
  afterburners: 0,
  fieldMedics: 0,
  adjutant: 0,
};

/** What each Adjutant level adds, shown in the Command Tent. */
export const ADJUTANT_LEVELS = [
  'DEFENDER: reinforces bases about to fall',
  'QUARTERMASTER: mostly full bases send troops forward',
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
    boosts: {
      player: {
        speed: 1 + 0.06 * levels.quickMarch,
        tankPower: levels.heavyTanks,
        attack: 1 + 0.05 * levels.sharpshooters,
        capacity: 1 + 0.1 * levels.thickWalls,
        hqCapacity: 15 * levels.eliteGuard,
        captureTroops: 2 * levels.recruiters,
        recovery: 0.08 * levels.fieldMedics,
        jetSpeed: 1 + 0.15 * levels.afterburners,
      },
    },
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
