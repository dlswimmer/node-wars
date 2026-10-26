import type { UpgradeId } from './upgrades';

/**
 * Every medal number in the game, in one place so the campaign's pace is easy to tune.
 * Prices are whole numbers. What you have can carry a fraction (medal bonuses like +10% on a
 * 2-medal win pay 2.2), kept exactly behind the scenes and shown rounded down.
 */

/** Medals for winning a conquest region yourself: one per star. */
export function winMedals(stars: number): number {
  return stars;
}

/**
 * Share of a win's medals an auto-battle pays at a star level you haven't mastered yet; at a
 * mastered one it pays full (the user's choice: half until mastered, so mastery is worth
 * chasing, and the x2 speed makes up for it).
 */
export const AUTO_PAY = 0.5;

/** An auto-battle by the Adjutant pays AUTO_PAY of a win (fractions are kept). */
export function autoBattleMedals(stars: number): number {
  return stars * AUTO_PAY;
}

/** Bonus medals for completing a region's mission on top of winning it. */
export const MISSION_MEDALS = 1;

/**
 * Lifetime medals earned (not spent) needed before you may attack a region with this many
 * stars (index = stars). Gives a reason to replay and farm held regions for medals.
 */
export const STAR_UNLOCK_MEDALS = [0, 0, 0, 0, 30, 75];

/**
 * Honor needed for a Promotion to the next phase: every Honor earned in past wars plus what
 * the current war would pay if you retreated now. Set low on purpose (a few days of play,
 * about 3 wars for a new 8-year-old in bot runs): like an incremental game, players should
 * cycle back through the early phases often, with more powers each time.
 */
export const PROMOTION_HONOR = 100;

/**
 * Honor earned in total (spending doesn't lower it) at which the Adjutant learns each duty
 * for free, for good: Defender, Quartermaster, Scout, Field Officer, Commander, then Gunner
 * (uses your abilities), which only a milestone teaches.
 */
export const ADJUTANT_MILESTONES = [10, 25, 45, 70, 100, 130];

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
  return `${medalCount(wholeMedals(have))} · ${wholeMedals(earned)} earned`;
}

/** "1 medal", "4 medals", "2.2 medals" (a pay with a bonus shows its tenths). */
export function medalCount(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v} medal${v === 1 ? '' : 's'}`;
}

/** The whole medals in a wallet that may carry a fraction (shown rounded down). */
export function wholeMedals(n: number): number {
  return Math.floor(n + 1e-9);
}

/** Medal amounts kept to the hundredth, so adding up fractions never drifts. */
export function exactMedals(n: number): number {
  return Math.round(n * 100) / 100;
}
