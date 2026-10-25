import type { CollegeId } from './college';
import type { UpgradeId } from './upgrades';

/**
 * Every medal number in the game, in one place so the campaign's pace is easy to tune.
 * Medals are always whole numbers.
 */

/** Medals for winning a conquest region yourself: one per star. */
export function winMedals(stars: number): number {
  return stars;
}

/** An auto-battle by the Adjutant pays less: half the stars, rounded down, but at least 1. */
export function autoBattleMedals(stars: number): number {
  return Math.max(1, Math.floor(stars / 2));
}

/** Bonus medals for completing a region's mission on top of winning it. */
export const MISSION_MEDALS = 1;

/**
 * Lifetime medals earned (not spent) needed before you may attack a region with this many
 * stars (index = stars). Gives a reason to replay and farm held regions for medals.
 */
export const STAR_UNLOCK_MEDALS = [0, 0, 0, 0, 30, 75];

/**
 * War College prices in Honor (only a Tactical Retreat pays Honor), the cost of each level
 * in order. A first retreat after a decent war pays roughly 10-20 Honor.
 */
export const HONOR_COSTS: Record<CollegeId, number[]> = {
  veteranPay: [3, 6, 10, 15, 22],
  warChest: [2, 4, 7, 11, 16],
  drillSchool: [3, 6, 10, 15, 22],
  logistics: [3, 6, 10, 15, 22],
  gunnery: [3, 6, 10, 15, 22],
  fortifications: [4, 9, 15],
  officerCorps: [4, 9, 15],
  // Abilities are bought once.
  airStrike: [8],
  supplyDrop: [8],
  rally: [12],
};

/** Command Tent prices: the cost of each level, in order. */
export const UPGRADE_COSTS: Record<UpgradeId, number[]> = {
  headStart: [3, 6, 10, 15, 25],
  fastBuilders: [3, 6, 10, 15, 25],
  quickMarch: [3, 6, 10, 15, 25],
  strongShield: [3, 6, 10, 15, 25],
  heavyTanks: [10, 20],
  adjutant: [3, 10, 15, 25, 35],
  sharpshooters: [4, 8, 12, 18, 25],
  recruiters: [5, 10, 16],
  eliteGuard: [5, 12],
  thickWalls: [6, 12, 20],
  afterburners: [6, 14],
  fieldMedics: [6, 14],
};

/**
 * Before whole medals, wins paid ½ to 2. Older saves have their medals multiplied by this
 * (and rounded) so they keep the same buying power.
 */
export const OLD_MEDAL_SCALE = 3;

/**
 * Medals to spend now and every medal ever earned (spending never lowers that; it unlocks
 * higher-star regions), e.g. "12 medals · 48 earned".
 */
export function medalSummary(have: number, earned: number): string {
  return `${medalCount(have)} · ${earned} earned`;
}

/** "1 medal", "4 medals". */
export function medalCount(n: number): string {
  return `${n} medal${n === 1 ? '' : 's'}`;
}
