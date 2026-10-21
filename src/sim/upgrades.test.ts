import { describe, expect, it } from 'vitest';
import { HELPER_PATIENCE, createAdjutant, notePlayerOrder, updateAdjutant } from './adjutant';
import { DIFFICULTIES } from './difficulty';
import { STAR_UNLOCK_MEDALS, UPGRADE_COSTS, medalCount } from './economy';
import { LEVELS } from './levels';
import type { LevelDef } from './types';
import {
  NO_UPGRADES,
  campaignWorldOptions,
  medalsFor,
  nextCost,
  type UpgradeLevels,
} from './upgrades';
import { createWorld, sendTroops, step } from './world';

describe('medals', () => {
  it('pay one whole medal per star, nothing for a loss, and less for auto-battles', () => {
    expect([1, 2, 3, 4, 5].map((stars) => medalsFor(stars, true))).toEqual([1, 2, 3, 4, 5]);
    expect(medalsFor(4, false)).toBe(0);
    expect([1, 2, 3, 4, 5].map((stars) => medalsFor(stars, true, true))).toEqual([1, 1, 1, 2, 2]);
  });

  it('are always whole numbers, and so is every price and unlock', () => {
    const all = [
      ...Object.values(UPGRADE_COSTS).flat(),
      ...STAR_UNLOCK_MEDALS,
      ...[1, 2, 3, 4, 5].flatMap((s) => [medalsFor(s, true), medalsFor(s, true, true)]),
    ];
    for (const n of all) expect(Number.isInteger(n)).toBe(true);
  });

  it('read naturally', () => {
    expect(medalCount(1)).toBe('1 medal');
    expect(medalCount(12)).toBe('12 medals');
  });
});

describe('upgrades', () => {
  const levels = (over: Partial<UpgradeLevels>): UpgradeLevels => ({ ...NO_UPGRADES, ...over });

  it('cost more each level and stop at the max', () => {
    expect(nextCost(levels({}), 'headStart')).toBe(UPGRADE_COSTS.headStart[0]);
    expect(nextCost(levels({ headStart: 1 }), 'headStart')).toBe(UPGRADE_COSTS.headStart[1]);
    for (const costs of Object.values(UPGRADE_COSTS)) {
      for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1]!);
    }
    expect(nextCost(levels({ heavyTanks: 2 }), 'heavyTanks')).toBeNull();
  });

  it('change a campaign battle', () => {
    const d = DIFFICULTIES.soldier;
    const opts = campaignWorldOptions(
      d,
      1,
      levels({ headStart: 2, fastBuilders: 1, strongShield: 1, quickMarch: 1, heavyTanks: 1 }),
    );
    const world = createWorld(LEVELS[0]!, opts);
    expect(world.bases[0]!.troops).toBe(20 + 10);
    expect(world.handicap.player).toBeCloseTo(1.08);
    expect(world.handicap.enemy).toBe(d.enemyProduction);
    expect(world.shieldUntil.player).toBe(d.shieldSeconds + 5);
    expect(world.boosts.player.speed).toBeCloseTo(1.06);
    expect(world.boosts.player.tankPower).toBe(1);
  });
});

describe('Adjutant', () => {
  const level: LevelDef = {
    id: 'adj',
    name: 'Adj',
    width: 400,
    height: 200,
    bases: [
      { kind: 'hq', x: 50, y: 100, owner: 'player', troops: 40 },
      { kind: 'outpost', x: 150, y: 100, owner: 'player', troops: 2 },
      { kind: 'outpost', x: 250, y: 40, owner: 'neutral', troops: 3 },
      { kind: 'hq', x: 350, y: 100, owner: 'enemy', troops: 40 },
    ],
  };
  const tick = (adj: ReturnType<typeof createAdjutant>, world: ReturnType<typeof createWorld>) =>
    updateAdjutant(world, adj, 5);

  it('does nothing at level 0', () => {
    const world = createWorld(level);
    tick(createAdjutant(0), world);
    expect(world.units).toHaveLength(0);
  });

  it('level 1 reinforces a base about to fall, but does not attack', () => {
    const world = createWorld(level);
    sendTroops(world, 'enemy', 3, 1, 0.5); // 20 enemies heading for the weak outpost
    const adj = createAdjutant(1);
    tick(adj, world);
    const help = world.units.filter((u) => u.owner === 'player');
    expect(help.length).toBeGreaterThan(0);
    expect(help.every((u) => u.targetId === 1)).toBe(true);
    expect(adj.squads.size).toBe(1);
  });

  it('level 3 grabs a gray base it is sure to win', () => {
    const world = createWorld(level);
    tick(createAdjutant(2), world);
    expect(world.units.some((u) => u.targetId === 2)).toBe(false);
    tick(createAdjutant(3), world);
    expect(world.units.some((u) => u.owner === 'player' && u.targetId === 2)).toBe(true);
  });

  it('as a helper, waits once the player stops giving orders', () => {
    const world = createWorld(level);
    world.time = HELPER_PATIENCE + 1;
    const adj = createAdjutant(4);
    tick(adj, world);
    expect(world.units).toHaveLength(0);
    notePlayerOrder(world, adj);
    tick(adj, world);
    expect(world.units.length).toBeGreaterThan(0);
  });

  it('can win a Recruit battle on its own when auto-battling', () => {
    const d = DIFFICULTIES.recruit;
    const world = createWorld(LEVELS[0]!, campaignWorldOptions(d, 7, NO_UPGRADES));
    const adj = createAdjutant(5, true);
    for (let t = 0; t < 900 && !world.winner; t += 0.1) {
      updateAdjutant(world, adj, 0.1);
      step(world, 0.1);
    }
    expect(world.winner).not.toBeNull();
  });
});
