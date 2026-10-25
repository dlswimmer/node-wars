import { PROMOTION_HONOR } from './economy';
import type { ConquestState } from './worldmap';
import { naturalStars, regionThreat } from './worldmap';

/**
 * The War College: permanent upgrades bought with Honor, which only a Tactical Retreat pays.
 * A retreat starts a new war (new world, no medals, no Command Tent upgrades) but keeps
 * Honor, the War College and your insignia, so each war goes further than the last. The War
 * College itself is an upgrade web; see collegeweb.ts.
 */

/** You may only retreat once you have beaten a region with at least this many stars. */
export const RETREAT_MIN_STARS = 3;

/** Whether this war has gone far enough to retreat for Honor. */
export function canRetreat(state: ConquestState): boolean {
  return state.held.some((id) => naturalStars(state.seed, id) >= RETREAT_MIN_STARS);
}

/**
 * Honor a Tactical Retreat pays: every region you hold counts, and harder ones count far
 * more (the square of its stars plus Threat), so pushing deeper always beats retreating
 * early. A handful of easy regions pays almost nothing.
 */
export function honorFor(state: ConquestState): number {
  if (!canRetreat(state)) return 0;
  let points = 0;
  for (const id of state.held) {
    const hard = naturalStars(state.seed, id) + regionThreat(state.seed, id);
    points += (hard * hard) / 9;
  }
  return Math.floor(points);
}

/**
 * Progress toward a Promotion to the next phase: Honor banked in past wars plus what this war
 * would pay right now (so the bar moves while you fight, not only after a retreat).
 */
export function promotionProgress(honorEarned: number, war: ConquestState) {
  const pending = honorFor(war);
  return {
    banked: honorEarned,
    pending,
    goal: PROMOTION_HONOR,
    ready: honorEarned + pending >= PROMOTION_HONOR,
  };
}

/** Insignia by how many Tactical Retreats you have made: a rank that only goes up. */
const INSIGNIA = ['LIEUTENANT', 'CAPTAIN', 'MAJOR', 'COLONEL', 'BRIGADIER', 'FIELD MARSHAL'];

export function insignia(retreats: number): string {
  const top = INSIGNIA.length - 1;
  if (retreats <= top) return INSIGNIA[retreats]!;
  return `${INSIGNIA[top]} ${'★'.repeat(Math.min(5, retreats - top))}`;
}
