import { BASE_STATS, HOSPITAL_RANGE } from './config';
import type { Army, Base, BaseKind, World } from './types';
import { travelDistance } from './world';

/**
 * What a base is worth taking, beyond its garrison: shared by the enemy AI and the Adjutant
 * so both pick targets the same way. Higher is better; it is taken off a target's cost.
 */

/** Bases with a perk for whoever holds them (tanks, fast troops, strong troops, jets). */
export const SPECIAL_KINDS = new Set<BaseKind>(['factory', 'radar', 'armory', 'airfield']);
export const SPECIAL_WORTH = 5;
/** Worth per troop a second a base builds, so a Barracks beats a Checkpoint (which builds none). */
export const PRODUCTION_WORTH = 4;

/**
 * Extra worth of a Bunker or Field Hospital from where it stands: a Bunker on the road
 * between the two HQs is a chokepoint, and a Hospital is worth most close to the front.
 */
export function positionValue(world: World, army: Army, target: Base): number {
  const dist = (a: Base, b: Base) => travelDistance(world, a.id, b.id);
  if (target.kind === 'bunker') {
    const home = world.bases.find((b) => b.kind === 'hq' && b.owner === army);
    const rival = world.bases.find(
      (b) => b.kind === 'hq' && b.owner !== army && b.owner !== 'neutral',
    );
    if (!home || !rival) return 2;
    // 1 when it sits right on the line between the HQs, falling off to 0 well to the side.
    const detour = dist(home, target) + dist(target, rival) - dist(home, rival);
    return 2 + 4 * Math.max(0, 1 - detour / 300);
  }
  if (target.kind === 'hospital') {
    const front = world.bases.some(
      (b) => b.owner !== army && b.owner !== 'neutral' && dist(b, target) <= HOSPITAL_RANGE * 1.5,
    );
    return front ? 5 : 2;
  }
  return 0;
}

/** Everything a base is worth to this army: its perk, where it stands, and what it builds. */
export function baseWorth(world: World, army: Army, target: Base): number {
  const perk = SPECIAL_KINDS.has(target.kind) ? SPECIAL_WORTH : 0;
  const builds = PRODUCTION_WORTH * BASE_STATS[target.kind].rate;
  return perk + positionValue(world, army, target) + builds;
}
