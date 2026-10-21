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

describe('AI defense', () => {
  it('reinforces its HQ when an attack is about to take it, if allowed to defend', () => {
    const level: LevelDef = {
      id: 'defend',
      name: 'Defend',
      width: 400,
      height: 200,
      bases: [
        { kind: 'hq', x: 50, y: 100, owner: 'player', troops: 60 },
        { kind: 'hq', x: 350, y: 100, owner: 'enemy', troops: 10 },
        { kind: 'barracks', x: 350, y: 30, owner: 'enemy', troops: 30 },
      ],
    };
    const world = createWorld(level);
    sendTroops(world, 'player', 0, 1, 0.5); // 30 troops heading for the enemy HQ
    updateAi(world, createAi('enemy', fast({ aiDefends: true })), 1);
    const help = world.units.filter((u) => u.owner === 'enemy');
    expect(help.length).toBeGreaterThan(0);
    expect(help.every((u) => u.targetId === 1)).toBe(true);
  });
});

describe('AI and the new bases', () => {
  const withTarget = (kind: 'bunker' | 'outpost', troops: number): LevelDef => {
    const level = duel(30, troops);
    level.bases[1] = { kind, x: 250, y: 100, owner: 'neutral', troops };
    return level;
  };

  it('knows a Bunker needs twice the troops', () => {
    // The troops it would send take an Outpost with 10, but not a Bunker with 10.
    const outpost = createWorld(withTarget('outpost', 10));
    updateAi(outpost, createAi('enemy', fast({ aiMargin: 2, aiKnowsBases: true })), 1);
    expect(outpost.units.length).toBeGreaterThan(0);
    const bunker = createWorld(withTarget('bunker', 10));
    updateAi(bunker, createAi('enemy', fast({ aiMargin: 2, aiKnowsBases: true })), 1);
    expect(bunker.units).toHaveLength(0);
  });

  it('prefers a Bunker on the road between the HQs over an equal base off to the side', () => {
    const level: LevelDef = {
      ...duel(60, 0),
      height: 600,
      bases: [
        { kind: 'hq', x: 50, y: 100, owner: 'player', troops: 50 },
        { kind: 'outpost', x: 250, y: 500, owner: 'neutral', troops: 3 },
        { kind: 'bunker', x: 250, y: 100, owner: 'neutral', troops: 3 },
        { kind: 'hq', x: 350, y: 100, owner: 'enemy', troops: 60 },
      ],
    };
    const world = createWorld(level);
    updateAi(world, createAi('enemy', fast({ aiKnowsBases: true })), 1);
    expect(world.units.length).toBeGreaterThan(0);
    expect(world.units.every((u) => u.targetId === 2)).toBe(true);
  });

  it('on easier ranks, attacks a Bunker as if it were any other base', () => {
    const world = createWorld(withTarget('bunker', 10));
    updateAi(world, createAi('enemy', fast({ aiMargin: 2, aiKnowsBases: false })), 1);
    expect(world.units.length).toBeGreaterThan(0);
  });
});
