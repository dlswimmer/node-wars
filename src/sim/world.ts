import { BASE_STATS, BONUS_PER_BASE, LAUNCH_INTERVAL, UNIT_SPEED } from './config';
import { createRng } from './rng';
import type { Army, Base, Bonuses, Faction, LevelDef, Unit, World } from './types';

export interface WorldOptions {
  seed?: number;
  /** Production multipliers per army (difficulty handicap). */
  handicap?: Partial<Record<Army, number>>;
  /** Seconds from the start during which an army's bases can't be damaged. */
  shield?: Partial<Record<Army, number>>;
}

export function createWorld(level: LevelDef, opts: WorldOptions = {}): World {
  return {
    width: level.width,
    height: level.height,
    bases: level.bases.map((b, id) => ({ id, ...b })),
    units: [],
    time: 0,
    winner: null,
    handicap: { player: 1, enemy: 1, ...opts.handicap },
    shieldUntil: { player: 0, enemy: 0, ...opts.shield },
    events: [],
    nextUnitId: 1,
    rng: createRng(opts.seed ?? 1),
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

export function isShielded(world: World, owner: Faction): boolean {
  return owner !== 'neutral' && world.time < world.shieldUntil[owner];
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

export interface AttackPreview {
  /** Troops that would be sent. */
  count: number;
  /** True if the target is friendly (the order is a reinforcement). */
  friendly: boolean;
  /** Whether the attack is expected to capture the target. */
  wins: boolean;
}

/** What would happen if `army` sent troops from `sourceIds` to `targetId` right now. */
export function previewAttack(
  world: World,
  army: Army,
  sourceIds: number[],
  targetId: number,
  fraction: number,
): AttackPreview {
  const target = world.bases[targetId];
  let count = 0;
  let farthest = 0;
  for (const id of sourceIds) {
    const b = world.bases[id];
    if (!b || b.owner !== army || id === targetId) continue;
    count += Math.floor(b.troops * fraction);
    if (target) farthest = Math.max(farthest, Math.hypot(b.x - target.x, b.y - target.y));
  }
  if (!target) return { count, friendly: false, wins: false };
  if (target.owner === army) return { count, friendly: true, wins: true };
  if (isShielded(world, target.owner)) return { count, friendly: false, wins: false };

  let defenders = target.troops;
  if (target.owner !== 'neutral') {
    const stats = BASE_STATS[target.kind];
    const travel = farthest / (UNIT_SPEED * getBonuses(world, army).speed);
    defenders = Math.min(stats.capacity, defenders + stats.rate * travel);
  }
  return { count, friendly: false, wins: count * getBonuses(world, army).attack >= defenders };
}

export function step(world: World, dt: number): void {
  world.events = [];
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
      if (target) resolveArrival(world, target, u, bonuses[u.owner].attack);
    } else {
      u.x += (dx / dist) * move;
      u.y += (dy / dist) * move;
      survivors.push(u);
    }
  }
  world.units = survivors;

  world.winner = checkWinner(world);
}

function resolveArrival(world: World, base: Base, unit: Unit, attack: number): void {
  if (base.owner === unit.owner) {
    base.troops += 1;
    return;
  }
  if (isShielded(world, base.owner)) {
    world.events.push({ type: 'blocked', baseId: base.id, by: unit.owner });
    return;
  }
  base.troops -= attack;
  // Ties go to the attacker so a kid's "6 against 6" works instead of leaving an empty base.
  if (base.troops <= 1e-6) {
    world.events.push({ type: 'capture', baseId: base.id, from: base.owner, to: unit.owner });
    base.owner = unit.owner;
    base.troops = Math.max(0, -base.troops);
  } else {
    world.events.push({ type: 'hit', baseId: base.id, by: unit.owner });
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

/**
 * Bases touched by a line segment, so a fast swipe that skips over a base between two
 * pointer events still picks it up.
 */
export function basesAlongSegment(
  world: World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  padding: number,
): Base[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  return world.bases.filter((b) => {
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((b.x - x1) * dx + (b.y - y1) * dy) / len2));
    const d = Math.hypot(x1 + t * dx - b.x, y1 + t * dy - b.y);
    return d <= BASE_STATS[b.kind].radius + padding;
  });
}

export function countBases(world: World, owner: Faction): number {
  return world.bases.filter((b) => b.owner === owner).length;
}
