import { describe, expect, it } from 'vitest';
import { OPENING_CHARGE, createAbilities, secondsUntilReady } from './abilities';
import { REPORTS_KEPT, createAdjutant, notePlayerOrder, updateAdjutant } from './adjutant';
import type { LevelDef } from './types';
import { DIFFICULTIES } from './difficulty';
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
    expect(adj.reports.map((r) => r.text)).toContain('Air strike on the barracks!');
    expect(secondsUntilReady(world, abilities, 'airStrike')).toBeGreaterThan(0);
    // One ability a turn: the Charge waits for its next turn.
    updateAdjutant(world, adj, 5, abilities);
    expect(world.chargeUntil.player).toBeGreaterThan(world.time);
    expect(adj.reports.map((r) => r.text)).toContain('CHARGE!');
  });

  it('drops supplies on a base about to fall', () => {
    const { world, adj, abilities } = setup();
    sendTroops(world, 'enemy', 3, 1, 0.5);
    updateAdjutant(world, adj, 5, abilities);
    expect(world.bases[1]!.troops).toBeGreaterThanOrEqual(19);
    expect(adj.reports.map((r) => r.text)).toContain('Supply drop on the outpost!');
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

describe('Adjutant reports', () => {
  it('says what it does in kid words, keeping only the last few', () => {
    const world = createWorld(level());
    const adj = createAdjutant(3);
    notePlayerOrder(world, adj);
    world.bases[0]!.troops = 80;
    updateAdjutant(world, adj, 5);
    expect(adj.reports.at(-1)!.text).toBe('Taking the barracks!');
    for (let i = 0; i < 6; i++) adj.reports.push({ at: 0, text: 'x' });
    updateAdjutant(world, adj, 5);
    expect(adj.reports.length).toBeLessThanOrEqual(REPORTS_KEPT + 6);
  });
});

describe('what the Adjutant attacks', () => {
  it('takes a Barracks over a slightly cheaper Checkpoint that builds nothing', () => {
    const world = createWorld({
      id: 'v',
      name: 'V',
      width: 800,
      height: 400,
      bases: [
        { kind: 'hq', x: 100, y: 200, owner: 'player', troops: 80 },
        { kind: 'checkpoint', x: 300, y: 120, owner: 'neutral', troops: 6 },
        { kind: 'barracks', x: 300, y: 280, owner: 'neutral', troops: 9 },
        { kind: 'hq', x: 700, y: 200, owner: 'enemy', troops: 40 },
      ],
    });
    const adj = createAdjutant(3);
    notePlayerOrder(world, adj);
    updateAdjutant(world, adj, 5);
    expect(adj.reports.at(-1)!.text).toBe('Taking the barracks!');
  });
});

describe('the Commander running a battle', () => {
  it('fights with the enemy-rank brain and reports its orders', () => {
    const world = createWorld(level());
    const adj = createAdjutant(5, true, 'player', DIFFICULTIES.soldier);
    expect(adj.brain?.settings.id).toBe('soldier');
    for (let t = 0; t < 30 && adj.reports.length === 0; t += 0.5) updateAdjutant(world, adj, 0.5);
    expect(adj.reports.length).toBeGreaterThan(0);
    expect(adj.squads.size).toBeGreaterThan(0);
  });
});
