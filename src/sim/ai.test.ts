import { describe, expect, it } from 'vitest';
import { createAi, updateAi } from './ai';
import { LEVELS } from './levels';
import type { LevelDef } from './types';
import { createWorld, step } from './world';

const duel = (enemyTroops: number, neutralTroops: number): LevelDef => ({
  id: 'ai-test',
  name: 'AI Test',
  width: 400,
  height: 200,
  bases: [
    { kind: 'hq', x: 50, y: 100, owner: 'player', troops: 50 },
    { kind: 'outpost', x: 250, y: 100, owner: 'neutral', troops: neutralTroops },
    { kind: 'hq', x: 350, y: 100, owner: 'enemy', troops: enemyTroops },
  ],
});

describe('AI', () => {
  it('attacks a weak neutral base when it can win', () => {
    const world = createWorld(duel(30, 4));
    const ai = createAi('enemy', 1);
    updateAi(world, ai, 1);
    expect(world.units.length).toBeGreaterThan(0);
    expect(world.units.every((u) => u.targetId === 1)).toBe(true);
  });

  it('waits when it cannot win any fight', () => {
    const world = createWorld(duel(10, 40));
    const ai = createAi('enemy', 1);
    updateAi(world, ai, 1);
    expect(world.units).toHaveLength(0);
  });

  it('does nothing until its cooldown expires', () => {
    const world = createWorld(duel(30, 4));
    const ai = createAi('enemy', 2);
    updateAi(world, ai, 1);
    expect(world.units).toHaveLength(0);
  });

  it('plays a full Boot Camp match against itself without crashing', () => {
    const world = createWorld(LEVELS[0]!, 42);
    const red = createAi('enemy', 1.5);
    const blue = createAi('player', 1.5);
    for (let t = 0; t < 600 && !world.winner; t += 0.1) {
      updateAi(world, red, 0.1);
      updateAi(world, blue, 0.1);
      step(world, 0.1);
    }
    expect(world.bases.some((b) => b.owner !== 'neutral')).toBe(true);
  });
});
