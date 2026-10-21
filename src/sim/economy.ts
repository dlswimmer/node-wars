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

/** Command Tent prices: the cost of each level, in order. */
export const UPGRADE_COSTS: Record<UpgradeId, number[]> = {
  headStart: [3, 6, 10, 15, 25],
  fastBuilders: [3, 6, 10, 15, 25],
  quickMarch: [3, 6, 10, 15, 25],
  strongShield: [3, 6, 10, 15, 25],
  heavyTanks: [10, 20],
  adjutant: [3, 10, 15, 25, 35],
};

/**
 * Before whole medals, wins paid ½ to 2. Older saves have their medals multiplied by this
 * (and rounded) so they keep the same buying power.
 */
export const OLD_MEDAL_SCALE = 3;

/** "1 medal", "4 medals". */
export function medalCount(n: number): string {
  return `${n} medal${n === 1 ? '' : 's'}`;
}
