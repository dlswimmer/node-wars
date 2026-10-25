import { isShielded, sendTroops } from './world';
import type { Army, World } from './types';

/**
 * Active abilities: commander powers a player earns in the War College (prestige only, never
 * free in every battle). Each needs a target base and then recharges. They use the same rules
 * as everything else: an Air Strike can't capture and can't hit a shielded army.
 */

export type AbilityId = 'airStrike' | 'supplyDrop' | 'rally';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** One line a kid can read on the button's hint. */
  blurb: string;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** Which bases it can target: yours, or anyone else's. */
  target: 'mine' | 'theirs';
}

/** Troops an Air Strike knocks off its target. */
export const AIR_STRIKE_TROOPS = 10;
/** Troops a Supply Drop adds to your base. */
export const SUPPLY_DROP_TROOPS = 15;
/** Share of every other base's troops that Rally sends to the chosen base. */
export const RALLY_SHARE = 0.25;
/** Every ability starts a battle recharging for this long, so none can rush the opening. */
export const OPENING_CHARGE = 20;

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  airStrike: {
    id: 'airStrike',
    name: 'AIR STRIKE',
    blurb: `Knocks ${AIR_STRIKE_TROOPS} troops off a base you don't own`,
    cooldown: 45,
    target: 'theirs',
  },
  supplyDrop: {
    id: 'supplyDrop',
    name: 'SUPPLY DROP',
    blurb: `+${SUPPLY_DROP_TROOPS} troops for one of your bases`,
    cooldown: 40,
    target: 'mine',
  },
  rally: {
    id: 'rally',
    name: 'RALLY',
    blurb: 'Every base sends a quarter of its troops to one of yours',
    cooldown: 30,
    target: 'mine',
  },
};

/** When each of an army's abilities is ready again (world time). */
export interface AbilityState {
  army: Army;
  readyAt: Partial<Record<AbilityId, number>>;
}

/** Abilities an army has unlocked, all starting the battle recharging. */
export function createAbilities(army: Army, unlocked: AbilityId[]): AbilityState {
  const readyAt: Partial<Record<AbilityId, number>> = {};
  for (const id of unlocked) readyAt[id] = OPENING_CHARGE;
  return { army, readyAt };
}

/** Seconds until an ability is ready (0 = ready); null if the army doesn't have it. */
export function secondsUntilReady(world: World, state: AbilityState, id: AbilityId): number | null {
  const at = state.readyAt[id];
  if (at === undefined) return null;
  return Math.max(0, at - world.time);
}

/** Whether this ability could be used on this base right now. */
export function canTarget(
  world: World,
  state: AbilityState,
  id: AbilityId,
  targetId: number,
): boolean {
  const base = world.bases[targetId];
  if (!base || world.winner || secondsUntilReady(world, state, id) !== 0) return false;
  const mine = base.owner === state.army;
  if (ABILITIES[id].target === 'mine') return mine;
  return !mine && !isShielded(world, base.owner);
}

/**
 * Use an ability on a base. Returns true if it worked (and starts its recharge). Adds an
 * 'ability' event for the renderer to show.
 */
export function useAbility(
  world: World,
  state: AbilityState,
  id: AbilityId,
  targetId: number,
): boolean {
  if (!canTarget(world, state, id, targetId)) return false;
  const base = world.bases[targetId]!;
  if (id === 'airStrike') {
    base.troops = Math.max(0, base.troops - AIR_STRIKE_TROOPS);
    base.lastAttackedBy = state.army;
    base.lastAttackedAt = world.time;
  } else if (id === 'supplyDrop') {
    base.troops += SUPPLY_DROP_TROOPS;
  } else {
    for (const b of world.bases) {
      if (b.owner === state.army && b !== base) {
        sendTroops(world, state.army, b.id, base.id, RALLY_SHARE);
      }
    }
  }
  state.readyAt[id] = world.time + ABILITIES[id].cooldown;
  world.events.push({ type: 'ability', ability: id, baseId: targetId, by: state.army });
  return true;
}
