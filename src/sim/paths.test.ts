import { describe, expect, it } from 'vitest';
import { GROUND_SPEED, blockedAt, groundSpeed, levelGround, levelRoutes, onBridge } from './paths';
import type { LevelDef, Point, Route } from './types';
import { createWorld, sendTroops, step } from './world';

const level = (extra: Partial<LevelDef> = {}): LevelDef => ({
  id: 'test',
  name: 'Test',
  width: 800,
  height: 400,
  bases: [
    { kind: 'barracks', x: 100, y: 200, owner: 'player', troops: 30 },
    { kind: 'barracks', x: 700, y: 200, owner: 'enemy', troops: 30 },
  ],
  ...extra,
});

const lake = (x: number, y: number, size: number) =>
  ({ kind: 'lake', x, y, size, angle: 0, detail: 1 }) as const;

/** A straight river down the middle with one bridge across it at height `y`. */
const river = (y: number): Partial<LevelDef> => ({
  rivers: [
    {
      points: [
        { x: 400, y: -200 },
        { x: 400, y: 600 },
      ],
      width: 40,
    },
  ],
  bridges: [{ x: 400, y, angle: 0, length: 104, width: 60 }],
});

/** Whether any point along the route is in the water itself. */
function wet(l: LevelDef, route: Route): boolean {
  for (let i = 1; i < route.points.length; i++) {
    const [a, b] = [route.points[i - 1]!, route.points[i]!];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
    for (let s = 0; s <= n; s++) {
      if (blockedAt(l, a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n, 0)) return true;
    }
  }
  return false;
}

describe('routes', () => {
  it('go straight when nothing is in the way', () => {
    const r = levelRoutes(level())[0]![1]!;
    expect(r.points).toHaveLength(2);
    expect(r.length).toBe(600);
  });

  it('walk around a lake, staying out of the water', () => {
    const l = level({ features: [lake(400, 200, 60)] });
    const r = levelRoutes(l)[0]![1]!;
    expect(r.points.length).toBeGreaterThan(2);
    expect(r.length).toBeGreaterThan(600);
    expect(r.length).toBeLessThan(700);
    expect(wet(l, r)).toBe(false);
  });

  it('cross a river only on its bridge, however far away', () => {
    const l = level(river(340));
    const r = levelRoutes(l)[0]![1]!;
    const bridge = l.bridges![0]!;
    const crossing = r.points.some((p: Point, i) => {
      const q = r.points[i + 1];
      return (
        q !== undefined &&
        p.x < 400 &&
        q.x >= 400 &&
        onBridge(bridge, 400, p.y + ((400 - p.x) * (q.y - p.y)) / (q.x - p.x))
      );
    });
    expect(crossing).toBe(true);
    expect(wet(l, r)).toBe(false);
    expect(r.length).toBeGreaterThan(600 + 50);
  });

  it('are the same length both ways', () => {
    const routes = levelRoutes(level(river(80)));
    expect(routes[1]![0]!.length).toBeCloseTo(routes[0]![1]!.length);
    expect(routes[1]![0]!.points).toEqual([...routes[0]![1]!.points].reverse());
  });

  it('lead troops over the bridge to their target', () => {
    const l = level(river(340));
    const world = createWorld(l);
    world.shieldUntil.enemy = 0;
    sendTroops(world, 'player', 0, 1, 1);
    let lowest = 0;
    for (let t = 0; t < 30 && world.units.length > 0; t += 0.05) {
      step(world, 0.05);
      for (const u of world.units) {
        if (Math.abs(u.x - 400) < 20) lowest = Math.max(lowest, u.y);
        expect(blockedAt(l, u.x, u.y, 0)).toBe(false);
      }
    }
    expect(world.units).toHaveLength(0);
    expect(lowest).toBeGreaterThan(300);
    expect(world.bases[1]!.owner).toBe('enemy');
    expect(world.bases[1]!.troops).toBeLessThan(30);
  });
});

describe('forest and mud', () => {
  const patch = (kind: 'forest' | 'mud', x: number, y: number, size: number) =>
    ({ kind, x, y, size, angle: 0, detail: 1 }) as const;

  it('slow troops down, tanks most, and jets not at all', () => {
    const l = level({ features: [patch('mud', 400, 200, 60)] });
    const ground = levelGround(l)!;
    expect(groundSpeed(ground, 400, 200, 'soldier')).toBe(GROUND_SPEED.mud.soldier);
    expect(groundSpeed(ground, 400, 200, 'tank')).toBe(GROUND_SPEED.mud.tank);
    expect(groundSpeed(ground, 400, 200, 'jet')).toBe(1);
    expect(groundSpeed(ground, 150, 200, 'soldier')).toBe(1);
    expect(levelGround(level())).toBeNull();
  });

  it('send troops around a small patch when that is quicker than wading through', () => {
    const l = level({ features: [patch('mud', 400, 200, 50)] });
    const r = levelRoutes(l)[0]![1]!;
    expect(r.points.length).toBeGreaterThan(2);
    expect(r.time).toBeLessThan(600 / GROUND_SPEED.mud.soldier);
  });

  it('count slow ground as longer, and longer still for tanks', () => {
    // A wall of forest from top to bottom of the map: there is no way round it.
    const features = Array.from({ length: 9 }, (_, i) => patch('forest', 400, -40 + i * 60, 60));
    const l = level({ features });
    const soldier = levelRoutes(l)[0]![1]!;
    const tank = levelRoutes(l, 'tank')[0]![1]!;
    expect(soldier.time).toBeGreaterThan(soldier.length);
    expect(tank.time).toBeGreaterThan(soldier.time);
  });

  it('slow a marching unit while it is in the mud', () => {
    const world = createWorld(level({ features: [patch('mud', 400, 200, 60)] }));
    sendTroops(world, 'player', 0, 1, 0.1);
    let inMud = 0;
    let onGrass = 0;
    for (let t = 0; t < 20 && world.units.length > 0; t += 0.05) {
      const u = world.units[0]!;
      const before = { x: u.x, y: u.y };
      step(world, 0.05);
      if (u.delay > 0 || !world.units.includes(u)) continue;
      const moved = Math.hypot(u.x - before.x, u.y - before.y);
      if (groundSpeed(world.ground, before.x, before.y, 'soldier') < 1)
        inMud = Math.max(inMud, moved);
      else onGrass = Math.max(onGrass, moved);
    }
    // It may never step in the mud if it walks round; if it does, it goes slower there.
    if (inMud > 0) expect(inMud).toBeLessThan(onGrass);
  });
});
