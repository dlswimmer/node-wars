import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './config';
import type { LevelDef } from './types';
import {
  baseAt,
  basesAlongSegment,
  createWorld,
  getBonuses,
  previewAttack,
  sendTroops,
  step,
} from './world';

const tinyLevel = (): LevelDef => ({
  id: 'test',
  name: 'Test',
  width: 400,
  height: 200,
  bases: [
    { kind: 'barracks', x: 50, y: 100, owner: 'player', troops: 20 },
    { kind: 'outpost', x: 200, y: 100, owner: 'neutral', troops: 5 },
    { kind: 'barracks', x: 350, y: 100, owner: 'enemy', troops: 20 },
  ],
});

/** Run the simulation until no units are in flight. */
function settle(world: ReturnType<typeof createWorld>, maxSeconds = 30) {
  for (let t = 0; t < maxSeconds && world.units.length > 0; t += 0.05) step(world, 0.05);
}

describe('production', () => {
  it('grows army bases but not neutral ones', () => {
    const world = createWorld(tinyLevel());
    step(world, 1);
    expect(world.bases[0]!.troops).toBeCloseTo(20 + BASE_STATS.barracks.rate);
    expect(world.bases[1]!.troops).toBe(5);
  });

  it('stops at capacity', () => {
    const world = createWorld(tinyLevel());
    for (let i = 0; i < 200; i++) step(world, 1);
    expect(world.bases[0]!.troops).toBe(BASE_STATS.barracks.capacity);
  });

  it('is boosted by owning a factory', () => {
    const level = tinyLevel();
    level.bases[1] = { kind: 'factory', x: 200, y: 100, owner: 'player', troops: 0 };
    const world = createWorld(level);
    expect(getBonuses(world, 'player').production).toBeGreaterThan(1);
    step(world, 1);
    expect(world.bases[0]!.troops).toBeGreaterThan(20 + BASE_STATS.barracks.rate);
  });
});

describe('sendTroops', () => {
  it('sends half the troops as individual units', () => {
    const world = createWorld(tinyLevel());
    const sent = sendTroops(world, 'player', 0, 1, 0.5);
    expect(sent).toBe(10);
    expect(world.units).toHaveLength(10);
    expect(world.bases[0]!.troops).toBe(10);
  });

  it("refuses to send from a base you don't own", () => {
    const world = createWorld(tinyLevel());
    expect(sendTroops(world, 'player', 2, 1, 0.5)).toBe(0);
    expect(sendTroops(world, 'player', 0, 0, 0.5)).toBe(0);
    expect(world.units).toHaveLength(0);
  });
});

describe('combat', () => {
  it('captures a base when attackers outnumber defenders', () => {
    const world = createWorld(tinyLevel());
    sendTroops(world, 'player', 0, 1, 0.5); // 10 attackers vs 5 defenders
    settle(world);
    expect(world.bases[1]!.owner).toBe('player');
    expect(Math.round(world.bases[1]!.troops)).toBe(5);
  });

  it('fails to capture when outnumbered', () => {
    const level = tinyLevel();
    level.bases[1]!.troops = 30;
    const world = createWorld(level);
    sendTroops(world, 'player', 0, 1, 0.5);
    settle(world);
    expect(world.bases[1]!.owner).toBe('neutral');
    expect(world.bases[1]!.troops).toBe(20);
  });

  it('reinforces a friendly base', () => {
    const level = tinyLevel();
    level.bases[1]!.owner = 'player';
    const world = createWorld(level);
    sendTroops(world, 'player', 0, 1, 0.5);
    settle(world);
    expect(Math.floor(world.bases[1]!.troops)).toBeGreaterThanOrEqual(15);
  });
});

describe('victory', () => {
  it('declares the player the winner when the enemy has nothing left', () => {
    const level = tinyLevel();
    level.bases[2]!.troops = 2;
    const world = createWorld(level);
    sendTroops(world, 'player', 0, 2, 0.5);
    settle(world);
    expect(world.winner).toBe('player');
  });
});

describe('baseAt', () => {
  it('finds a base with touch-friendly padding', () => {
    const world = createWorld(tinyLevel());
    expect(baseAt(world, 50 + BASE_STATS.barracks.radius + 10, 100)?.id).toBe(0);
    expect(baseAt(world, 125, 20)).toBeUndefined();
  });
});

describe('ties and shields', () => {
  it('lets the attacker win a tie', () => {
    const level = tinyLevel();
    level.bases[1]!.troops = 10;
    const world = createWorld(level);
    sendTroops(world, 'player', 0, 1, 0.5); // exactly 10 vs 10
    settle(world);
    expect(world.bases[1]!.owner).toBe('player');
  });

  it('protects shielded bases even from troops already in flight', () => {
    const level = tinyLevel();
    level.bases[1]!.owner = 'player';
    level.bases[1]!.troops = 1;
    const world = createWorld(level, { shield: { player: 60 } });
    sendTroops(world, 'enemy', 2, 1, 0.5);
    settle(world);
    expect(world.bases[1]!.owner).toBe('player');
  });

  it('drops the shield when its time is up', () => {
    const level = tinyLevel();
    level.bases[1]!.owner = 'player';
    level.bases[1]!.troops = 1;
    const world = createWorld(level, { shield: { player: 0.5 } });
    for (let i = 0; i < 10; i++) step(world, 0.1);
    sendTroops(world, 'enemy', 2, 1, 0.5);
    settle(world);
    expect(world.bases[1]!.owner).toBe('enemy');
  });

  it('reports captures as events', () => {
    const world = createWorld(tinyLevel());
    sendTroops(world, 'player', 0, 1, 0.5);
    const seen: string[] = [];
    for (let t = 0; t < 30 && world.units.length > 0; t += 0.05) {
      step(world, 0.05);
      seen.push(...world.events.map((e) => e.type));
    }
    expect(seen).toContain('hit');
    expect(seen.filter((t) => t === 'capture')).toHaveLength(1);
  });
});

describe('previewAttack', () => {
  it('predicts a win against a much weaker target', () => {
    const world = createWorld(tinyLevel());
    expect(previewAttack(world, 'player', [0], 1, 0.5)).toEqual({
      count: 10,
      enRoute: 0,
      outcome: 'win',
    });
  });

  it('counts your own troops already flying at the target', () => {
    const level = tinyLevel();
    level.bases[1]!.troops = 15;
    level.bases.push({ kind: 'barracks', x: 50, y: 30, owner: 'player', troops: 20 });
    const world = createWorld(level);
    // Neither base alone has enough: 10 vs 15.
    expect(previewAttack(world, 'player', [3], 1, 0.5).outcome).toBe('lose');
    sendTroops(world, 'player', 0, 1, 0.5); // the first wave of 10 is on its way
    const second = previewAttack(world, 'player', [3], 1, 0.5);
    expect(second.enRoute).toBe(10);
    expect(second.outcome).toBe('win');
  });

  it('flags a narrow win as close', () => {
    const level = tinyLevel();
    level.bases[1]!.troops = 9;
    const world = createWorld(level);
    expect(previewAttack(world, 'player', [0], 1, 0.5).outcome).toBe('close');
  });

  it('predicts a loss against a stronger target', () => {
    const level = tinyLevel();
    level.bases[1]!.troops = 30;
    const world = createWorld(level);
    expect(previewAttack(world, 'player', [0], 1, 0.5).outcome).toBe('lose');
  });

  it('counts enemy reinforcements already on the way', () => {
    const level = tinyLevel();
    level.bases[1] = { kind: 'outpost', x: 200, y: 100, owner: 'enemy', troops: 4 };
    level.bases[2]!.troops = 40;
    const world = createWorld(level);
    expect(previewAttack(world, 'player', [0], 1, 0.5).outcome).not.toBe('lose');
    sendTroops(world, 'enemy', 2, 1, 0.5); // 20 more defenders incoming
    expect(previewAttack(world, 'player', [0], 1, 0.5).outcome).toBe('lose');
  });

  it('marks reinforcements and shielded targets', () => {
    const level = tinyLevel();
    level.bases[1]!.owner = 'player';
    const world = createWorld(level, { shield: { enemy: 30 } });
    expect(previewAttack(world, 'player', [0], 1, 0.5).outcome).toBe('reinforce');
    expect(previewAttack(world, 'player', [0], 2, 0.5).outcome).toBe('shielded');
  });
});

describe('basesAlongSegment', () => {
  it('catches a base that a fast swipe jumps over', () => {
    const world = createWorld(tinyLevel());
    // Pointer events at x=20 and x=380 skip right over the outpost at x=200.
    const ids = basesAlongSegment(world, 20, 100, 380, 100, 8).map((b) => b.id);
    expect(ids).toEqual([0, 1, 2]);
    expect(basesAlongSegment(world, 120, 20, 280, 20, 8)).toHaveLength(0);
  });
});

describe('HQ victory', () => {
  const hqLevel = (): LevelDef => ({
    ...tinyLevel(),
    bases: [
      { kind: 'hq', x: 50, y: 100, owner: 'player', troops: 40 },
      { kind: 'outpost', x: 200, y: 50, owner: 'enemy', troops: 30 },
      { kind: 'hq', x: 350, y: 100, owner: 'enemy', troops: 3 },
    ],
  });

  it('wins as soon as the enemy HQ falls when enabled', () => {
    const world = createWorld(hqLevel(), { hqVictory: ['player'] });
    sendTroops(world, 'player', 0, 2, 0.5);
    settle(world);
    expect(world.winner).toBe('player');
    expect(world.bases[1]!.owner).toBe('enemy'); // the outpost was never taken
  });

  it('keeps playing after taking the HQ when not enabled', () => {
    const world = createWorld(hqLevel());
    sendTroops(world, 'player', 0, 2, 0.5);
    settle(world);
    expect(world.winner).toBeNull();
  });
});

describe('tanks', () => {
  const factoryLevel = (): LevelDef => ({
    ...tinyLevel(),
    bases: [
      { kind: 'factory', x: 50, y: 100, owner: 'player', troops: 20 },
      { kind: 'outpost', x: 200, y: 100, owner: 'neutral', troops: 8 },
      { kind: 'barracks', x: 350, y: 100, owner: 'enemy', troops: 20 },
    ],
  });

  it('roll out of factories, each worth several troops', () => {
    const world = createWorld(factoryLevel());
    sendTroops(world, 'player', 0, 1, 0.5); // 10 troops: 3 tanks + 1 soldier
    expect(world.units.filter((u) => u.kind === 'tank')).toHaveLength(3);
    expect(world.units.filter((u) => u.kind === 'soldier')).toHaveLength(1);
    expect(world.units.reduce((sum, u) => sum + u.power, 0)).toBe(10);
  });

  it('hit as hard as the troops they carry', () => {
    const world = createWorld(factoryLevel());
    sendTroops(world, 'player', 0, 1, 0.5);
    settle(world);
    expect(world.bases[1]!.owner).toBe('player');
    expect(Math.round(world.bases[1]!.troops)).toBe(2);
  });

  it('move slower than soldiers', () => {
    const world = createWorld(factoryLevel());
    sendTroops(world, 'player', 0, 1, 0.5);
    const tank = world.units.find((u) => u.kind === 'tank')!;
    const soldier = world.units.find((u) => u.kind === 'soldier')!;
    expect(tank.speed).toBeLessThan(soldier.speed);
  });
});
