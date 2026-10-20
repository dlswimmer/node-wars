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
  it('predicts a win against a weaker target', () => {
    const world = createWorld(tinyLevel());
    expect(previewAttack(world, 'player', [0], 1, 0.5)).toEqual({
      count: 10,
      friendly: false,
      wins: true,
    });
  });

  it('predicts a loss against a stronger target', () => {
    const level = tinyLevel();
    level.bases[1]!.troops = 30;
    const world = createWorld(level);
    expect(previewAttack(world, 'player', [0], 1, 0.5).wins).toBe(false);
  });

  it('marks reinforcements as friendly', () => {
    const level = tinyLevel();
    level.bases[1]!.owner = 'player';
    const world = createWorld(level);
    expect(previewAttack(world, 'player', [0], 1, 0.5).friendly).toBe(true);
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
