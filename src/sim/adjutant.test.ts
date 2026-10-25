import { describe, expect, it } from 'vitest';
import { OPENING_CHARGE, createAbilities, secondsUntilReady } from './abilities';
import { createAdjutant, notePlayerOrder, updateAdjutant } from './adjutant';
import type { LevelDef } from './types';
import { createWorld, sendTroops } from './world';

const level = (): LevelDef => ({
  id: 'g',
  name: 'G',
  width: 800,
  height: 400,
  bases: [
    { kind: 'hq', x: 100, y: 200, owner: 'player', troops: 60 },
    { kind: 'outpost', x: 250, y: 330, owner: 'player', troops: 4 },
    { kind: 'barracks', x: 500, y: 200, owner: 'neutral', troops: 25 },
    { kind: 'hq', x: 700, y: 200, owner: 'enemy', troops: 40 },
  ],
});

/** A battle past the opening charge, with a Gunner Adjutant and every ability. */
const setup = () => {
  const world = createWorld(level());
  world.time = OPENING_CHARGE;
  const adj = createAdjutant(6);
  notePlayerOrder(world, adj);
  const abilities = createAbilities('player', ['airStrike', 'supplyDrop', 'charge']);
  return { world, adj, abilities };
};

describe('the Gunner', () => {
  it('air strikes the base your troops are heading for, and charges a big wave', () => {
    const { world, adj, abilities } = setup();
    sendTroops(world, 'player', 0, 2, 0.5);
    for (const u of world.units) u.delay = 0;
    updateAdjutant(world, adj, 5, abilities);
    expect(world.bases[2]!.troops).toBe(15);
    expect(secondsUntilReady(world, abilities, 'airStrike')).toBeGreaterThan(0);
    // One ability a turn: the Charge waits for its next turn.
    updateAdjutant(world, adj, 5, abilities);
    expect(world.chargeUntil.player).toBeGreaterThan(world.time);
  });

  it('drops supplies on a base about to fall', () => {
    const { world, adj, abilities } = setup();
    sendTroops(world, 'enemy', 3, 1, 0.5);
    updateAdjutant(world, adj, 5, abilities);
    expect(world.bases[1]!.troops).toBeGreaterThanOrEqual(19);
  });

  it('needs the Gunner duty: lower levels never use abilities', () => {
    const { world, abilities } = setup();
    const adj = createAdjutant(5);
    notePlayerOrder(world, adj);
    sendTroops(world, 'player', 0, 2, 0.5);
    for (const u of world.units) u.delay = 0;
    updateAdjutant(world, adj, 5, abilities);
    expect(secondsUntilReady(world, abilities, 'airStrike')).toBe(0);
  });
});
