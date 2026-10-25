import { NO_COLLEGE_EFFECTS, type CollegeEffects } from './collegeweb';
import { worldOptionsFor, type Difficulty } from './difficulty';
import { ADJUTANT_MILESTONES, UPGRADE_COSTS, autoBattleMedals, winMedals } from './economy';
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

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** What this many levels add up to, in kid words ("+16% troop building"). */
  total: (levels: number) => string;
  /** Medal cost of each level (index 0 buys level 1); see UPGRADE_COSTS in economy.ts. */
  costs: number[];
}

const pct = (n: number) => `+${Math.round(n)}%`;

const DEFS: Omit<UpgradeDef, 'costs'>[] = [
  { id: 'headStart', name: 'HEAD START', total: (n) => `+${5 * n} troops in your HQ` },
  {
    id: 'fastBuilders',
    name: 'FAST BUILDERS',
    total: (n) => `${pct(8 * n)} troop building`,
  },
  { id: 'quickMarch', name: 'QUICK MARCH', total: (n) => `${pct(6 * n)} troop speed` },
  {
    id: 'sharpshooters',
    name: 'SHARPSHOOTERS',
    total: (n) => `troops hit ${pct(5 * n)} harder`,
  },
  {
    id: 'recruiters',
    name: 'RECRUITERS',
    total: (n) => `+${2 * n} troops in each base you capture`,
  },
  {
    id: 'eliteGuard',
    name: 'ELITE GUARD',
    total: (n) => `your HQ holds +${15 * n} troops`,
  },
  {
    id: 'strongShield',
    name: 'STRONG SHIELD',
    total: (n) => `+${5 * n} s opening shield`,
  },
  {
    id: 'thickWalls',
    name: 'THICK WALLS',
    total: (n) => `your bases hold ${pct(10 * n)} more`,
  },
  {
    id: 'heavyTanks',
    name: 'HEAVY TANKS',
    total: (n) => `tanks worth +${n} troop${n === 1 ? '' : 's'}`,
  },
  {
    id: 'afterburners',
    name: 'AFTERBURNERS',
    total: (n) => `jets fly ${pct(15 * n)} faster`,
  },
  {
    id: 'fieldMedics',
    name: 'FIELD MEDICS',
    total: (n) => `Hospitals save ${pct(8 * n)} more troops`,
  },
  { id: 'adjutant', name: 'ADJUTANT', total: () => 'An AI officer that helps you' },
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
  'GUNNER: uses your abilities for you',
];

/** Adjutant duties a Command Tent purchase can reach; the Gunner only comes from Honor. */
export const ADJUTANT_BUYABLE = 5;

/** Adjutant levels the War College gives for free: one per Honor milestone reached. */
export function freeAdjutantLevels(honorEarned: number): number {
  return ADJUTANT_MILESTONES.filter((m) => honorEarned >= m).length;
}

/**
 * The Adjutant's level in battle: free levels from Honor plus levels bought this war, which
 * stack on top (the first bought level always costs the cheapest price). Buying stops at
 * Commander; the Gunner duty comes only from its Honor milestone.
 */
export function adjutantLevel(bought: number, honorEarned: number): number {
  const free = freeAdjutantLevels(honorEarned);
  const base = Math.min(ADJUTANT_BUYABLE, Math.min(free, ADJUTANT_BUYABLE) + bought);
  return free > ADJUTANT_BUYABLE ? base + 1 : base;
}

/** Whether another Adjutant level can still be bought (free levels fill the top first). */
export function canBuyAdjutant(bought: number, honorEarned: number): boolean {
  return Math.min(freeAdjutantLevels(honorEarned), ADJUTANT_BUYABLE) + bought < ADJUTANT_BUYABLE;
}

/** The next Honor milestone for a free Adjutant duty, or null once all are earned. */
export function nextAdjutantMilestone(honorEarned: number): number | null {
  return ADJUTANT_MILESTONES.find((m) => honorEarned < m) ?? null;
}

/** Wins you need yourself at a star level before the Adjutant may auto-battle it. */
export const MASTERY_WINS = 5;

/**
 * One line on a held region's panel about auto-battling it: how many more wins of your own
 * at its star level, or what's still missing. Mastery is per star level and never resets.
 */
export function masteryNote(stars: number, wins: number, commander: boolean): string {
  const label = `${'★'.repeat(stars)}`;
  if (wins < MASTERY_WINS) {
    const more = MASTERY_WINS - wins;
    return `AUTO-BATTLE: win ${more} more ${label} fight${more === 1 ? '' : 's'} yourself (${wins}/${MASTERY_WINS})`;
  }
  return commander
    ? `${label} mastered: AUTO-BATTLE is ready`
    : `${label} mastered: a COMMANDER Adjutant can auto-battle it`;
}
/**
 * Medals for a campaign battle: a region pays for its stars plus its Threat, times the War
 * College's medal bonus.
 */
export function medalsFor(
  stars: number,
  won: boolean,
  auto = false,
  threat = 0,
  bonus = 1,
): number {
  if (!won) return 0;
  const hard = stars + Math.max(0, threat);
  return Math.round((auto ? autoBattleMedals(hard) : winMedals(hard)) * bonus);
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

/** What each level of a region's Threat gives every enemy army. */
export const THREAT_STEP = { production: 0.1, attack: 0.06, capacity: 0.06, troops: 6 } as const;

/** How a region's Threat strengthens the enemy armies (same kinds of edge as your upgrades). */
export function threatOptions(threat: number): Partial<WorldOptions> {
  const t = Math.max(0, threat);
  const boost = { attack: 1 + THREAT_STEP.attack * t, capacity: 1 + THREAT_STEP.capacity * t };
  return {
    startTroops: { enemy: THREAT_STEP.troops * t, rival: THREAT_STEP.troops * t },
    boosts: { enemy: boost, rival: boost },
  };
}

/**
 * World setup for a campaign battle: the rank's settings, the player's upgrades, and the
 * region's Threat for the enemy.
 */
export function campaignWorldOptions(
  d: Difficulty,
  seed: number,
  levels: UpgradeLevels,
  threat = 0,
  edge: CollegeEffects = NO_COLLEGE_EFFECTS,
): WorldOptions {
  const base = worldOptionsFor(d, seed);
  const up = upgradeOptions(levels, d.shieldSeconds);
  // The War College's edges stack on top of the Command Tent's.
  const mine = up.boosts!.player!;
  up.boosts = {
    player: {
      ...mine,
      speed: mine.speed! * edge.speed,
      attack: mine.attack! * edge.attack,
      capacity: mine.capacity! * edge.capacity,
    },
  };
  up.handicap = { player: up.handicap!.player! * edge.production };
  up.shield = { player: up.shield!.player! + edge.shield };
  const foe = threatOptions(threat);
  const build = 1 + THREAT_STEP.production * Math.max(0, threat);
  return {
    ...base,
    ...up,
    handicap: {
      ...base.handicap,
      ...up.handicap,
      enemy: (base.handicap?.enemy ?? 1) * build,
      rival: (base.handicap?.rival ?? 1) * build,
    },
    shield: { ...base.shield, ...up.shield },
    startTroops: { ...up.startTroops, ...foe.startTroops },
    boosts: { ...up.boosts, ...foe.boosts },
  };
}
