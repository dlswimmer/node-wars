import { BASE_STATS, BONUS_PER_BASE, LAUNCH_INTERVAL, UNIT_SPEED } from './config';
import { createRng } from './rng';
import type { Army, Base, Bonuses, Faction, LevelDef, Unit, World } from './types';

export function createWorld(
  level: LevelDef,
  seed = 1,
  handicap: Partial<Record<Army, number>> = {},
): World {
  return {
    width: level.width,
    height: level.height,
    bases: level.bases.map((b, id) => ({ id, ...b })),
    units: [],
    time: 0,
    winner: null,
    handicap: { player: 1, enemy: 1, ...handicap },
    nextUnitId: 1,
    rng: createRng(seed),
  };
}

export function getBonuses(world: World, army: Army): Bonuses {
  let factories = 0;
  let radars = 0;
  let armories = 0;
  for (const b of world.bases) {
    if (b.owner !== army) continue;
    if (b.kind === 'factory') factories++;
    else if (b.kind === 'radar') radars++;
    else if (b.kind === 'armory') armories++;
  }
  return {
    production: 1 + factories * BONUS_PER_BASE.factory,
    speed: 1 + radars * BONUS_PER_BASE.radar,
    attack: 1 + armories * BONUS_PER_BASE.armory,
  };
}

/**
 * Send a fraction of the troops at `fromId` toward `toId` as a swarm of units.
 * Returns how many units were sent (0 if the order was invalid).
 */
export function sendTroops(
  world: World,
  army: Army,
  fromId: number,
  toId: number,
  fraction: number,
): number {
  const from = world.bases[fromId];
  const to = world.bases[toId];
  if (!from || !to || from === to || from.owner !== army || world.winner) return 0;

  const count = Math.floor(from.troops * fraction);
  if (count < 1) return 0;
  from.troops -= count;

  const speed = UNIT_SPEED * getBonuses(world, army).speed;
  const fromR = BASE_STATS[from.kind].radius * 0.6;
  const toR = BASE_STATS[to.kind].radius * 0.5;
  for (let i = 0; i < count; i++) {
    const [sx, sy] = jitter(world, from.x, from.y, fromR);
    const [tx, ty] = jitter(world, to.x, to.y, toR);
    world.units.push({
      id: world.nextUnitId++,
      owner: army,
      targetId: toId,
      x: sx,
      y: sy,
      tx,
      ty,
      speed: speed * (0.9 + world.rng() * 0.2),
      delay: i * LAUNCH_INTERVAL,
    });
  }
  return count;
}

export function step(world: World, dt: number): void {
  if (world.winner) return;
  world.time += dt;

  const bonuses: Record<Army, Bonuses> = {
    player: getBonuses(world, 'player'),
    enemy: getBonuses(world, 'enemy'),
  };

  for (const b of world.bases) {
    if (b.owner === 'neutral') continue;
    const stats = BASE_STATS[b.kind];
    if (b.troops < stats.capacity) {
      const rate = stats.rate * bonuses[b.owner].production * world.handicap[b.owner];
      b.troops = Math.min(stats.capacity, b.troops + rate * dt);
    }
  }

  const survivors: Unit[] = [];
  for (const u of world.units) {
    if (u.delay > 0) {
      u.delay -= dt;
      survivors.push(u);
      continue;
    }
    const dx = u.tx - u.x;
    const dy = u.ty - u.y;
    const dist = Math.hypot(dx, dy);
    const move = u.speed * dt;
    if (dist <= move) {
      const target = world.bases[u.targetId];
      if (target) resolveArrival(target, u, bonuses[u.owner].attack);
    } else {
      u.x += (dx / dist) * move;
      u.y += (dy / dist) * move;
      survivors.push(u);
    }
  }
  world.units = survivors;

  world.winner = checkWinner(world);
}

function resolveArrival(base: Base, unit: Unit, attack: number): void {
  if (base.owner === unit.owner) {
    base.troops += 1;
    return;
  }
  base.troops -= attack;
  if (base.troops < 0) {
    base.owner = unit.owner;
    base.troops = -base.troops;
  }
}

function isAlive(world: World, army: Army): boolean {
  return world.bases.some((b) => b.owner === army) || world.units.some((u) => u.owner === army);
}

function checkWinner(world: World): Army | null {
  if (!isAlive(world, 'enemy')) return 'player';
  if (!isAlive(world, 'player')) return 'enemy';
  return null;
}

function jitter(world: World, x: number, y: number, r: number): [number, number] {
  const angle = world.rng() * Math.PI * 2;
  const d = Math.sqrt(world.rng()) * r;
  return [x + Math.cos(angle) * d, y + Math.sin(angle) * d];
}

/** Find the base under a point, with generous padding so it is easy to tap on a phone. */
export function baseAt(world: World, x: number, y: number, padding = 24): Base | undefined {
  let best: Base | undefined;
  let bestDist = Infinity;
  for (const b of world.bases) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= BASE_STATS[b.kind].radius + padding && d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

export function countBases(world: World, owner: Faction): number {
  return world.bases.filter((b) => b.owner === owner).length;
}
