import { describe, expect, it } from 'vitest';
import { HELPER_PATIENCE, createAdjutant, notePlayerOrder, updateAdjutant } from './adjutant';
import { DIFFICULTIES } from './difficulty';
import { STAR_UNLOCK_MEDALS, UPGRADE_COSTS, medalCount } from './economy';
import { LEVELS } from './levels';
import type { LevelDef } from './types';
import {
  NO_UPGRADES,
  UPGRADES,
  adjutantLevel,
  canBuyAdjutant,
  freeAdjutantLevels,
  nextAdjutantMilestone,
  campaignWorldOptions,
  medalsFor,
  nextCost,
  type UpgradeLevels,
} from './upgrades';
import { capacityOf, createWorld, getBonuses, sendTroops, step } from './world';

describe('medals', () => {
  it('pay one whole medal per star, nothing for a loss, and less for auto-battles', () => {
    expect([1, 2, 3, 4, 5].map((stars) => medalsFor(stars, true))).toEqual([1, 2, 3, 4, 5]);
    expect(medalsFor(4, false)).toBe(0);
    expect([1, 2, 3, 4, 5].map((stars) => medalsFor(stars, true, true))).toEqual([
      0.75, 1.5, 2.25, 3, 3.75,
    ]);
  });

  it('cost whole numbers, as does every unlock and a win you fight yourself', () => {
    const all = [
      ...Object.values(UPGRADE_COSTS).flat(),
      ...STAR_UNLOCK_MEDALS,
      ...[1, 2, 3, 4, 5].map((s) => medalsFor(s, true)),
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

describe('new upgrades', () => {
  const field = (): LevelDef => ({
    id: 'u',
    name: 'U',
    width: 600,
    height: 300,
    bases: [
      { kind: 'hq', x: 60, y: 150, owner: 'player', troops: 0 },
      { kind: 'barracks', x: 300, y: 150, owner: 'neutral', troops: 10 },
      { kind: 'hq', x: 540, y: 150, owner: 'enemy', troops: 20 },
      { kind: 'hospital', x: 200, y: 150, owner: 'player', troops: 0 },
    ],
  });
  const withLevels = (levels: Partial<UpgradeLevels>) =>
    createWorld(
      field(),
      campaignWorldOptions(DIFFICULTIES.recruit, 1, { ...NO_UPGRADES, ...levels }),
    );

  it('show what they add up to and what the next level brings', () => {
    const def = (id: string) => UPGRADES.find((u) => u.id === id)!;
    expect(def('fastBuilders').total(2)).toBe('+16% troop building');
    expect(def('sharpshooters').total(3)).toBe('troops hit +15% harder');
    expect(def('heavyTanks').total(1)).toBe('tanks worth +1 troop');
    expect(def('heavyTanks').total(2)).toBe('tanks worth +2 troops');
    for (const u of UPGRADES) expect(u.costs).toEqual(UPGRADE_COSTS[u.id]);
  });

  it('let your bases hold more, and your HQ more still', () => {
    const world = withLevels({ thickWalls: 2, eliteGuard: 1 });
    expect(capacityOf(world, world.bases[0]!)).toBe(80 * 1.2 + 15);
    expect(capacityOf(world, world.bases[3]!)).toBe(40 * 1.2);
    // Neutral and enemy bases don't get your upgrades.
    expect(capacityOf(world, world.bases[2]!)).toBe(80);
  });

  it('make your troops hit harder and fill captured bases', () => {
    const plain = withLevels({});
    const strong = withLevels({ sharpshooters: 2, recruiters: 2 });
    expect(getBonuses(strong, 'player').attack).toBeCloseTo(1.1);
    for (const world of [plain, strong]) {
      world.bases[0]!.troops = 30;
      sendTroops(world, 'player', 0, 1, 1);
      for (let t = 0; t < 10 && world.units.length; t += 0.05) step(world, 0.05);
    }
    expect(strong.bases[1]!.owner).toBe('player');
    // Once taken, the rest of the swarm just adds to it, so the gap is the 4 from Recruiters
    // (plus a little from needing fewer hits to break in).
    expect(strong.bases[1]!.troops - plain.bases[1]!.troops).toBeGreaterThanOrEqual(4);
  });
});

describe('Adjutant levels from Honor', () => {
  it('learns a free duty at each Honor milestone', () => {
    expect(freeAdjutantLevels(0)).toBe(0);
    expect(freeAdjutantLevels(10)).toBe(1);
    expect(freeAdjutantLevels(99)).toBe(4);
    expect(freeAdjutantLevels(1000)).toBe(6);
    expect(nextAdjutantMilestone(30)).toBe(45);
    expect(nextAdjutantMilestone(500)).toBeNull();
  });

  it('stacks bought levels on top of free ones, up to Commander', () => {
    // Two free levels plus one bought (at the cheapest price) is level 3.
    expect(adjutantLevel(1, 25)).toBe(3);
    expect(canBuyAdjutant(3, 25)).toBe(false);
    expect(canBuyAdjutant(2, 25)).toBe(true);
    expect(adjutantLevel(9, 0)).toBe(5);
    // The Gunner comes only from its milestone, on top of Commander.
    expect(adjutantLevel(0, 130)).toBe(6);
    expect(adjutantLevel(5, 129)).toBe(5);
    expect(canBuyAdjutant(0, 100)).toBe(false);
  });
});
