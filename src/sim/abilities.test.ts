import { describe, expect, it } from 'vitest';
import {
  ABILITIES,
  AIR_STRIKE_TROOPS,
  OPENING_CHARGE,
  SUPPLY_DROP_TROOPS,
  canTarget,
  createAbilities,
  secondsUntilReady,
  useAbility,
} from './abilities';
import type { LevelDef } from './types';
import { createWorld } from './world';

const level = (): LevelDef => ({
  id: 'a',
  name: 'A',
  width: 800,
  height: 400,
  bases: [
    { kind: 'hq', x: 100, y: 200, owner: 'player', troops: 40 },
    { kind: 'barracks', x: 250, y: 100, owner: 'player', troops: 20 },
    { kind: 'barracks', x: 500, y: 200, owner: 'neutral', troops: 6 },
    { kind: 'hq', x: 700, y: 200, owner: 'enemy', troops: 30 },
  ],
});

/** A world at the given time, with every ability unlocked for the player. */
const ready = (time = OPENING_CHARGE) => {
  const world = createWorld(level());
  world.time = time;
  return { world, state: createAbilities('player', ['airStrike', 'supplyDrop', 'rally']) };
};

describe('abilities', () => {
  it('start each battle recharging', () => {
    const { world, state } = ready(5);
    expect(secondsUntilReady(world, state, 'airStrike')).toBe(OPENING_CHARGE - 5);
    expect(useAbility(world, state, 'airStrike', 3)).toBe(false);
    expect(secondsUntilReady(world, createAbilities('player', []), 'rally')).toBeNull();
  });

  it('Air Strike knocks troops off a base you do not own, but never captures it', () => {
    const { world, state } = ready();
    expect(canTarget(world, state, 'airStrike', 0)).toBe(false);
    expect(useAbility(world, state, 'airStrike', 3)).toBe(true);
    expect(world.bases[3]!.troops).toBe(30 - AIR_STRIKE_TROOPS);
    expect(world.events.some((e) => e.type === 'ability')).toBe(true);
    // Recharging now.
    expect(useAbility(world, state, 'airStrike', 2)).toBe(false);
    world.time += ABILITIES.airStrike.cooldown;
    expect(useAbility(world, state, 'airStrike', 2)).toBe(true);
    expect(world.bases[2]!.troops).toBe(0);
    expect(world.bases[2]!.owner).toBe('neutral');
  });

  it('Air Strike cannot hit a shielded army', () => {
    const { world, state } = ready();
    world.shieldUntil.enemy = 999;
    expect(useAbility(world, state, 'airStrike', 3)).toBe(false);
  });

  it('Supply Drop adds troops to one of your bases', () => {
    const { world, state } = ready();
    expect(canTarget(world, state, 'supplyDrop', 3)).toBe(false);
    expect(useAbility(world, state, 'supplyDrop', 1)).toBe(true);
    expect(world.bases[1]!.troops).toBe(20 + SUPPLY_DROP_TROOPS);
  });

  it('Rally sends troops from every other base to the chosen one', () => {
    const { world, state } = ready();
    expect(useAbility(world, state, 'rally', 1)).toBe(true);
    expect(world.units.length).toBe(10);
    expect(world.units.every((u) => u.targetId === 1 && u.owner === 'player')).toBe(true);
  });
});
