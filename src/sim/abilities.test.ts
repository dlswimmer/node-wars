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
import { CHARGE_ATTACK, CHARGE_SECONDS, CHARGE_SPEED } from './config';
import { createWorld, getBonuses, isCharging, sendTroops, step } from './world';

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
  return { world, state: createAbilities('player', ['airStrike', 'supplyDrop', 'charge']) };
};

describe('abilities', () => {
  it('start each battle recharging', () => {
    const { world, state } = ready(5);
    expect(secondsUntilReady(world, state, 'airStrike')).toBe(OPENING_CHARGE - 5);
    expect(useAbility(world, state, 'airStrike', 3)).toBe(false);
    expect(secondsUntilReady(world, createAbilities('player', []), 'charge')).toBeNull();
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

  it('Charge makes your troops faster and harder-hitting for a while, with no target', () => {
    const { world, state } = ready();
    const before = getBonuses(world, 'player').attack;
    expect(useAbility(world, state, 'charge')).toBe(true);
    expect(isCharging(world, 'player')).toBe(true);
    expect(getBonuses(world, 'player').attack).toBeCloseTo(before * CHARGE_ATTACK);
    expect(isCharging(world, 'enemy')).toBe(false);
    // A marching soldier covers more ground while the Charge lasts.
    const march = (charge: boolean) => {
      const w = createWorld(level());
      if (charge) w.chargeUntil.player = 99;
      sendTroops(w, 'player', 0, 3, 0.1);
      const u = w.units[0]!;
      u.delay = 0;
      const x = u.x;
      step(w, 0.5);
      return u.x - x;
    };
    expect(march(true)).toBeCloseTo(march(false) * CHARGE_SPEED, 0);
    world.time += CHARGE_SECONDS;
    expect(isCharging(world, 'player')).toBe(false);
  });
});
