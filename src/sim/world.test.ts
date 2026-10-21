import { describe, expect, it } from 'vitest';
import { BASE_STATS } from './config';
import type { Army, LevelDef, Unit, World } from './types';
import {
  baseAt,
  basesAlongSegment,
  createWorld,
  getBonuses,
  isShielded,
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

describe('outposts', () => {
  it('launch troops faster than other bases', () => {
    const level = tinyLevel();
    level.bases[1] = { kind: 'outpost', x: 200, y: 100, owner: 'player', troops: 20 };
    const world = createWorld(level, { seed: 3 });
    sendTroops(world, 'player', 1, 2, 0.5);
    sendTroops(world, 'player', 0, 2, 0.5);
    const avg = (squad: number) => {
      const units = world.units.filter((u) => u.squad === squad);
      return units.reduce((s, u) => s + u.speed, 0) / units.length;
    };
    expect(avg(1)).toBeGreaterThan(avg(2) * 1.25);
  });
});

describe('clashes', () => {
  const duelLevel = (playerTroops: number, enemyTroops: number): LevelDef => ({
    ...tinyLevel(),
    bases: [
      { kind: 'barracks', x: 50, y: 100, owner: 'player', troops: playerTroops },
      { kind: 'barracks', x: 350, y: 100, owner: 'enemy', troops: enemyTroops },
    ],
  });

  /** Total power still flying for an army. */
  const flying = (world: World, army: Army) =>
    world.units.filter((u) => u.owner === army).reduce((sum, u) => sum + u.power, 0);

  /** Step until the swarms have met and only one side (or nobody) is left in the air. */
  function fight(world: World) {
    for (let t = 0; t < 10; t += 0.05) {
      step(world, 0.05);
      if (flying(world, 'player') === 0 || flying(world, 'enemy') === 0) return;
    }
  }

  /** Put a unit in the air by hand, heading for a base. */
  function place(world: World, owner: Army, x: number, power = 1, kind: Unit['kind'] = 'soldier') {
    const targetId = owner === 'player' ? 1 : 0;
    const target = world.bases[targetId]!;
    world.units.push({
      id: world.nextUnitId++,
      kind,
      power,
      owner,
      targetId,
      x,
      y: 100,
      tx: target.x,
      ty: target.y,
      speed: 75,
      delay: 0,
      squad: 0,
    });
  }

  it('lets equal swarms meeting head-on wipe each other out', () => {
    const world = createWorld(duelLevel(30, 30));
    sendTroops(world, 'player', 0, 1, 1);
    sendTroops(world, 'enemy', 1, 0, 1);
    fight(world);
    expect(flying(world, 'player')).toBe(0);
    expect(flying(world, 'enemy')).toBe(0);
  });

  it('lets a bigger swarm punch through with the difference left', () => {
    const world = createWorld(duelLevel(30, 10));
    sendTroops(world, 'player', 0, 1, 1);
    sendTroops(world, 'enemy', 1, 0, 1);
    fight(world);
    expect(flying(world, 'enemy')).toBe(0);
    expect(flying(world, 'player')).toBeCloseTo(20);
  });

  it('reports clashes as events where the units met', () => {
    const world = createWorld(duelLevel(0, 0));
    place(world, 'player', 195);
    place(world, 'enemy', 205);
    step(world, 0.01);
    expect(world.units).toHaveLength(0);
    const clash = world.events.find((e) => e.type === 'clash');
    expect(clash).toMatchObject({ type: 'clash', y: 100 });
  });

  it('lets a tank absorb soldiers, losing one troop of worth per soldier', () => {
    const world = createWorld(duelLevel(0, 0));
    place(world, 'player', 200, 3, 'tank');
    place(world, 'enemy', 204);
    step(world, 0.01);
    expect(world.units).toHaveLength(1);
    expect(world.units[0]).toMatchObject({ kind: 'tank', owner: 'player', power: 2 });
    place(world, 'enemy', world.units[0]!.x + 4);
    place(world, 'enemy', world.units[0]!.x + 6);
    step(world, 0.01);
    expect(world.units).toHaveLength(0);
  });

  it('gives the Armory bonus to the side that hits harder', () => {
    const level = duelLevel(0, 0);
    level.bases.push({ kind: 'armory', x: 50, y: 180, owner: 'player', troops: 0 });
    const world = createWorld(level);
    const attack = getBonuses(world, 'player').attack;
    place(world, 'player', 200);
    place(world, 'enemy', 204);
    step(world, 0.01);
    expect(flying(world, 'enemy')).toBe(0);
    expect(flying(world, 'player')).toBeCloseTo((attack - 1) / attack);
  });

  it('never makes units of the same army clash', () => {
    const world = createWorld(duelLevel(0, 0));
    place(world, 'player', 200);
    place(world, 'player', 202);
    world.units[1]!.targetId = 0; // flying the other way, right through each other
    world.units[1]!.tx = 50;
    step(world, 0.05);
    expect(world.units).toHaveLength(2);
  });

  it("doesn't let units still waiting at their base clash", () => {
    const world = createWorld(duelLevel(0, 0));
    place(world, 'player', 200);
    place(world, 'enemy', 202);
    world.units[1]!.delay = 1;
    step(world, 0.05);
    expect(world.units).toHaveLength(2);
  });

  it('plays out the same way every time with the same seed', () => {
    const run = () => {
      const world = createWorld(duelLevel(40, 25), { seed: 9 });
      sendTroops(world, 'player', 0, 1, 1);
      sendTroops(world, 'enemy', 1, 0, 1);
      for (let i = 0; i < 100; i++) step(world, 0.05);
      return JSON.stringify([world.units, world.bases]);
    };
    expect(run()).toBe(run());
  });

  it('warns in the preview when an enemy swarm is coming straight down the same road', () => {
    const level = duelLevel(30, 30);
    const world = createWorld(level);
    // An attack on the enemy barracks itself looks fine...
    world.bases[1]!.troops = 10;
    expect(previewAttack(world, 'player', [0], 1, 1).outcome).toBe('win');
    // ...until a big enemy swarm heads our way along the same line.
    world.bases[1]!.troops = 40;
    sendTroops(world, 'enemy', 1, 0, 0.75);
    world.bases[1]!.troops = 10;
    for (let i = 0; i < 20; i++) step(world, 0.05);
    expect(previewAttack(world, 'player', [0], 1, 1).outcome).toBe('lose');
  });
});

describe('bunkers', () => {
  const bunkerLevel = (troops: number, from: 'barracks' | 'factory' = 'barracks'): LevelDef => ({
    ...tinyLevel(),
    bases: [
      { kind: from, x: 50, y: 100, owner: 'player', troops: 40 },
      { kind: 'bunker', x: 200, y: 100, owner: 'neutral', troops },
      { kind: 'barracks', x: 350, y: 100, owner: 'enemy', troops: 20 },
    ],
  });

  it('makes each soldier knock off half a defender', () => {
    const world = createWorld(bunkerLevel(15));
    sendTroops(world, 'player', 0, 1, 0.5); // 20 soldiers do 10 damage
    settle(world);
    expect(world.bases[1]!.owner).toBe('neutral');
    expect(world.bases[1]!.troops).toBeCloseTo(5);
  });

  it('falls to twice as many soldiers as defenders', () => {
    const world = createWorld(bunkerLevel(10));
    sendTroops(world, 'player', 0, 1, 0.5);
    settle(world);
    expect(world.bases[1]!.owner).toBe('player');
  });

  it('takes full damage from tanks', () => {
    const world = createWorld(bunkerLevel(15, 'factory'));
    sendTroops(world, 'player', 0, 1, 0.5); // 6 tanks (18) + 2 soldiers (1)
    settle(world);
    expect(world.bases[1]!.owner).toBe('player');
    expect(world.bases[1]!.troops).toBeCloseTo(4, 0); // plus a moment of production
  });

  it('is counted double in the attack preview, except against tanks', () => {
    const soldiers = (troops: number) =>
      previewAttack(createWorld(bunkerLevel(troops)), 'player', [0], 1, 0.5).outcome;
    expect(soldiers(6)).toBe('win'); // 20 soldiers hit for 10
    expect(soldiers(9)).toBe('close');
    expect(soldiers(12)).toBe('lose');
    const tanks = previewAttack(createWorld(bunkerLevel(15, 'factory')), 'player', [0], 1, 0.5);
    expect(tanks.outcome).toBe('win');
  });

  it('agrees with what actually happens', () => {
    for (const troops of [6, 9, 10, 11, 14]) {
      const world = createWorld(bunkerLevel(troops));
      const { outcome } = previewAttack(world, 'player', [0], 1, 0.5);
      sendTroops(world, 'player', 0, 1, 0.5);
      settle(world);
      expect(world.bases[1]!.owner === 'player', `${troops} defenders`).toBe(outcome !== 'lose');
    }
  });
});

describe('field hospitals', () => {
  const hospitalLevel = (hospitalOwner: 'player' | 'enemy', hospitalX = 120): LevelDef => ({
    ...tinyLevel(),
    width: 1200,
    bases: [
      { kind: 'barracks', x: 50, y: 100, owner: 'player', troops: 20 },
      { kind: 'outpost', x: 300, y: 100, owner: 'neutral', troops: 30 },
      { kind: 'hospital', x: hospitalX, y: 100, owner: hospitalOwner, troops: 0 },
      { kind: 'barracks', x: 550, y: 100, owner: 'enemy', troops: 20 },
    ],
  });
  const heals = (world: World) =>
    world.events.filter((e) => e.type === 'heal').reduce((s, e) => s + e.amount, 0);

  it('brings back a quarter of the troops lost attacking a base in range', () => {
    const world = createWorld(hospitalLevel('player'));
    sendTroops(world, 'player', 0, 1, 0.5); // 10 soldiers bounce off 30 defenders
    let healed = 0;
    for (let t = 0; t < 30 && world.units.length > 0; t += 0.05) {
      step(world, 0.05);
      healed += heals(world);
    }
    expect(healed).toBeCloseTo(2.5);
    expect(world.bases[2]!.troops).toBeGreaterThan(2.5); // plus its own production
  });

  it('brings back a quarter of the troops lost in a clash in range', () => {
    const level = hospitalLevel('player', 300);
    level.bases[1] = { kind: 'outpost', x: 300, y: 300, owner: 'neutral', troops: 0 };
    const world = createWorld(level);
    // 10 against 10 head-on: both swarms wipe out around x = 300, next to the hospital.
    sendTroops(world, 'player', 0, 3, 0.5);
    sendTroops(world, 'enemy', 3, 0, 0.5);
    let healed = 0;
    for (let t = 0; t < 30 && world.units.length > 0; t += 0.05) {
      step(world, 0.05);
      healed += heals(world);
    }
    expect(healed).toBeCloseTo(2.5);
    expect(world.events.every((e) => e.type !== 'heal' || e.baseId === 2)).toBe(true);
  });

  it("doesn't help troops that fall out of range or belong to another army", () => {
    for (const level of [hospitalLevel('player', 1000), hospitalLevel('enemy')]) {
      const world = createWorld(level);
      sendTroops(world, 'player', 0, 1, 0.5);
      let healed = 0;
      for (let t = 0; t < 30 && world.units.length > 0; t += 0.05) {
        step(world, 0.05);
        healed += heals(world);
      }
      expect(healed).toBe(0);
    }
  });
});

describe('three armies', () => {
  const threeWay = (): LevelDef => ({
    id: 'three',
    name: 'Three',
    width: 600,
    height: 600,
    bases: [
      { kind: 'hq', x: 100, y: 300, owner: 'player', troops: 20 },
      { kind: 'hq', x: 500, y: 100, owner: 'enemy', troops: 20 },
      { kind: 'hq', x: 500, y: 500, owner: 'rival', troops: 20 },
      { kind: 'outpost', x: 300, y: 300, owner: 'neutral', troops: 5 },
    ],
  });

  it('lists the armies that start with a base', () => {
    expect(createWorld(threeWay()).armies).toEqual(['player', 'enemy', 'rival']);
    expect(createWorld(tinyLevel()).armies).toEqual(['player', 'enemy']);
  });

  it('has no winner while two armies are left, and the last one standing wins', () => {
    const world = createWorld(threeWay());
    world.bases[1]!.owner = 'neutral';
    step(world, 0.1);
    expect(world.winner).toBeNull();
    world.bases[2]!.owner = 'player';
    step(world, 0.1);
    expect(world.winner).toBe('player');
  });

  it('wins by HQs only when every other army has lost its HQ', () => {
    const world = createWorld(
      {
        ...threeWay(),
        bases: [
          ...threeWay().bases,
          { kind: 'barracks', x: 300, y: 100, owner: 'enemy', troops: 5 },
          { kind: 'barracks', x: 300, y: 500, owner: 'rival', troops: 5 },
        ],
      },
      { hqVictory: ['player'] },
    );
    world.bases[1]!.owner = 'player';
    step(world, 0.1);
    expect(world.winner).toBeNull();
    world.bases[2]!.owner = 'player';
    step(world, 0.1);
    expect(world.winner).toBe('player');
  });

  it('lets the two other armies fight each other mid-field', () => {
    const world = createWorld(threeWay());
    sendTroops(world, 'enemy', 1, 2, 1);
    sendTroops(world, 'rival', 2, 1, 1);
    for (let t = 0; t < 6 && !world.events.some((e) => e.type === 'clash'); t += 0.05) {
      step(world, 0.05);
    }
    expect(world.events.some((e) => e.type === 'clash')).toBe(true);
  });

  it('gives every army its own handicap, shield and boosts', () => {
    const world = createWorld(threeWay(), {
      handicap: { rival: 1.5 },
      shield: { rival: 10 },
      boosts: { rival: { speed: 1.2 } },
    });
    expect(world.handicap).toEqual({ player: 1, enemy: 1, rival: 1.5 });
    expect(isShielded(world, 'rival')).toBe(true);
    expect(world.boosts.rival.speed).toBe(1.2);
    expect(world.boosts.enemy.speed).toBe(1);
  });
});

describe('airfields and jets', () => {
  const airLevel = (extra: Partial<LevelDef> = {}): LevelDef => ({
    id: 'air',
    name: 'Air',
    width: 800,
    height: 400,
    bases: [
      { kind: 'airfield', x: 100, y: 200, owner: 'player', troops: 30 },
      { kind: 'barracks', x: 700, y: 200, owner: 'enemy', troops: 10 },
      { kind: 'barracks', x: 100, y: 350, owner: 'player', troops: 5 },
      { kind: 'bunker', x: 700, y: 60, owner: 'enemy', troops: 10 },
    ],
    ...extra,
  });

  it('send fast jets that fly straight over a river', () => {
    const world = createWorld(
      airLevel({
        rivers: [
          {
            points: [
              { x: 400, y: -200 },
              { x: 400, y: 600 },
            ],
            width: 40,
          },
        ],
        bridges: [{ x: 400, y: 380, angle: 0, length: 104, width: 60 }],
      }),
    );
    sendTroops(world, 'player', 0, 1, 0.5);
    expect(world.units.every((u) => u.kind === 'jet' && (u.path ?? []).length === 0)).toBe(true);
    for (let t = 0; t < 2; t += 0.05) step(world, 0.05);
    // Soldiers would still be walking; jets have crossed far from the bridge.
    for (const u of world.units) expect(Math.abs(u.y - 200)).toBeLessThan(20);
  });

  it('knock troops off but never capture', () => {
    const world = createWorld(airLevel());
    sendTroops(world, 'player', 0, 1, 1);
    settle(world);
    expect(world.bases[1]!.owner).toBe('enemy');
    expect(world.bases[1]!.troops).toBe(0);
  });

  // Production is off so only the jets change the numbers.
  const still = { handicap: { player: 0, enemy: 0 } };

  it('land as reinforcements at your own base', () => {
    const world = createWorld(airLevel(), still);
    sendTroops(world, 'player', 0, 2, 0.5);
    settle(world);
    expect(world.bases[2]!.troops).toBeCloseTo(5 + 15, 0);
  });

  it('do half damage to a Bunker', () => {
    const world = createWorld(airLevel(), still);
    world.bases[0]!.troops = 10;
    sendTroops(world, 'player', 0, 3, 1);
    settle(world);
    expect(world.bases[3]!.troops).toBeCloseTo(5, 0);
  });

  it('fly over swarms instead of clashing', () => {
    const world = createWorld(airLevel());
    sendTroops(world, 'player', 0, 1, 1);
    sendTroops(world, 'enemy', 1, 0, 1);
    for (let t = 0; t < 6; t += 0.05) {
      step(world, 0.05);
      expect(world.events.some((e) => e.type === 'clash')).toBe(false);
    }
  });

  it('show as a raid in the attack preview when only jets would arrive', () => {
    const world = createWorld(airLevel());
    expect(previewAttack(world, 'player', [0], 1, 0.5).outcome).toBe('raid');
    expect(previewAttack(world, 'player', [0, 2], 1, 0.5).outcome).not.toBe('raid');
  });
});
