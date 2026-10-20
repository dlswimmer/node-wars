import { describe, expect, it } from 'vitest';
import { createAi, updateAi } from './ai';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { LEVELS } from './levels';
import type { LevelDef } from './types';
import { createWorld, sendTroops, step } from './world';

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

const fast = (overrides: Partial<Difficulty> = {}): Difficulty => ({
  ...DIFFICULTIES.soldier,
  aiInterval: 1,
  shieldSeconds: 0,
  ...overrides,
});

describe('AI', () => {
  it('attacks a weak neutral base when it can win', () => {
    const world = createWorld(duel(30, 4));
    const ai = createAi('enemy', fast());
    updateAi(world, ai, 1);
    expect(world.units.length).toBeGreaterThan(0);
    expect(world.units.every((u) => u.targetId === 1)).toBe(true);
  });

  it('waits when it cannot win any fight', () => {
    const world = createWorld(duel(10, 40));
    const ai = createAi('enemy', fast());
    updateAi(world, ai, 1);
    expect(world.units).toHaveLength(0);
  });

  it('does nothing until its cooldown expires', () => {
    const world = createWorld(duel(30, 4));
    const ai = createAi('enemy', fast({ aiInterval: 2 }));
    updateAi(world, ai, 1);
    expect(world.units).toHaveLength(0);
  });

  it('leaves shielded bases alone', () => {
    const level = duel(60, 99);
    level.bases[0]!.troops = 1; // an easy target it would otherwise take
    const world = createWorld(level, { shield: { player: 30 } });
    const ai = createAi('enemy', fast());
    updateAi(world, ai, 1);
    expect(world.units).toHaveLength(0);
  });

  it('does not snipe a neutral base the player is attacking, unless it is a General', () => {
    const level = duel(40, 5);
    const polite = createWorld(level);
    sendTroops(polite, 'player', 0, 1, 0.1); // a few player troops already on the way
    updateAi(polite, createAi('enemy', fast({ aiSnipeGuard: 8 })), 1);
    expect(polite.units.filter((u) => u.owner === 'enemy')).toHaveLength(0);

    const rude = createWorld(level);
    sendTroops(rude, 'player', 0, 1, 0.1);
    updateAi(rude, createAi('enemy', fast({ aiSnipeGuard: 0 })), 1);
    expect(rude.units.filter((u) => u.owner === 'enemy').length).toBeGreaterThan(0);
  });

  it('combines several bases into one attack when allowed', () => {
    const level: LevelDef = {
      ...duel(0, 0),
      bases: [
        { kind: 'hq', x: 200, y: 100, owner: 'player', troops: 15 },
        { kind: 'barracks', x: 350, y: 50, owner: 'enemy', troops: 20 },
        { kind: 'barracks', x: 350, y: 150, owner: 'enemy', troops: 20 },
      ],
    };
    const solo = createWorld(level);
    updateAi(solo, createAi('enemy', fast({ aiMaxSources: 1 })), 1);
    expect(solo.units).toHaveLength(0);

    const team = createWorld(level);
    updateAi(team, createAi('enemy', fast({ aiMaxSources: 2 })), 1);
    expect(new Set(team.units.map((u) => u.targetId))).toEqual(new Set([0]));
    expect(team.units.length).toBeGreaterThan(20);
  });

  it('pools all its bases to break a stalemate', () => {
    const level: LevelDef = {
      ...duel(0, 0),
      bases: [
        { kind: 'hq', x: 50, y: 100, owner: 'player', troops: 80 },
        { kind: 'barracks', x: 300, y: 50, owner: 'enemy', troops: 50 },
        { kind: 'barracks', x: 300, y: 150, owner: 'enemy', troops: 50 },
        { kind: 'hq', x: 350, y: 100, owner: 'enemy', troops: 80 },
      ],
    };
    const world = createWorld(level);
    const ai = createAi('enemy', fast({ aiMaxSources: 1 }));
    for (let t = 0; t < 11; t++) updateAi(world, ai, 1);
    expect(world.units).toHaveLength(0); // no single base can beat a full HQ
    for (let t = 0; t < 3; t++) updateAi(world, ai, 1);
    expect(new Set(world.units.map((u) => u.targetId))).toEqual(new Set([0]));
  });

  it('plays a full Boot Camp match against itself without crashing', () => {
    const world = createWorld(LEVELS[0]!, { seed: 42 });
    const red = createAi('enemy', DIFFICULTIES.general);
    const blue = createAi('player', DIFFICULTIES.general);
    for (let t = 0; t < 600 && !world.winner; t += 0.1) {
      updateAi(world, red, 0.1);
      updateAi(world, blue, 0.1);
      step(world, 0.1);
    }
    expect(world.bases.some((b) => b.owner !== 'neutral')).toBe(true);
  });
});
