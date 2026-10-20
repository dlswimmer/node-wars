import {
  BASE_STATS,
  BONUS_PER_BASE,
  LAUNCH_INTERVAL,
  OUTPOST_SPEED,
  TANK_LAUNCH_INTERVAL,
  TANK_POWER,
  TANK_SPEED,
  UNIT_SPEED,
} from './config';
import { createRng } from './rng';
import type { Army, Base, Bonuses, Faction, LevelDef, Unit, World } from './types';

export interface WorldOptions {
  seed?: number;
  /** Production multipliers per army (difficulty handicap). */
  handicap?: Partial<Record<Army, number>>;
  /** Seconds from the start during which an army's bases can't be damaged. */
  shield?: Partial<Record<Army, number>>;
  /** Armies that win outright by capturing every enemy HQ (instead of every base). */
  hqVictory?: Army[];
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
    hqVictory: opts.hqVictory ?? [],
    events: [],
    nextUnitId: 1,
    nextSquadId: 1,
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
  const squad = world.nextSquadId++;

  const speed = UNIT_SPEED * getBonuses(world, army).speed;
  const fromR = BASE_STATS[from.kind].radius * 0.6;
  const toR = BASE_STATS[to.kind].radius * 0.5;
  // Factories roll out tanks (each worth several troops); leftovers go as soldiers.
  const tanks = from.kind === 'factory' ? Math.floor(count / TANK_POWER) : 0;
  const soldiers = count - tanks * TANK_POWER;
  for (let i = 0; i < tanks + soldiers; i++) {
    const tank = i < tanks;
    const [sx, sy] = jitter(world, from.x, from.y, fromR);
    const [tx, ty] = jitter(world, to.x, to.y, toR);
    world.units.push({
      id: world.nextUnitId++,
      kind: tank ? 'tank' : 'soldier',
      power: tank ? TANK_POWER : 1,
      owner: army,
      targetId: toId,
      x: sx,
      y: sy,
      tx,
      ty,
      speed: speed * kindSpeed(from.kind, tank) * (0.9 + world.rng() * 0.2),
      delay: tank
        ? i * TANK_LAUNCH_INTERVAL
        : tanks * TANK_LAUNCH_INTERVAL + (i - tanks) * LAUNCH_INTERVAL,
      squad,
    });
  }
  return count;
}

/** Speed multiplier for a unit leaving a base of this kind. */
function kindSpeed(kind: Base['kind'], tank: boolean): number {
  if (tank) return TANK_SPEED;
  return kind === 'outpost' ? OUTPOST_SPEED : 1;
}

export type AttackOutcome = 'reinforce' | 'win' | 'close' | 'lose' | 'shielded';

export interface AttackPreview {
  /** Troops that would be sent. */
  count: number;
  /** Troops of the same army already on their way to the target. */
  enRoute: number;
  outcome: AttackOutcome;
}

/** Extra attack strength (in troops) below which a win is shown as "close". */
const CLOSE_MARGIN = 3;

/**
 * What would happen if `army` sent troops from `sourceIds` to `targetId` right now,
 * counting the target's production during the trip and reinforcements already on the way.
 */
export function previewAttack(
  world: World,
  army: Army,
  sourceIds: number[],
  targetId: number,
  fraction: number,
): AttackPreview {
  const target = world.bases[targetId];
  const speed = UNIT_SPEED * getBonuses(world, army).speed;
  let count = 0;
  let travel = 0;
  for (const id of sourceIds) {
    const b = world.bases[id];
    if (!b || b.owner !== army || id === targetId) continue;
    count += Math.floor(b.troops * fraction);
    if (!target) continue;
    const s = speed * kindSpeed(b.kind, b.kind === 'factory');
    travel = Math.max(travel, Math.hypot(b.x - target.x, b.y - target.y) / s);
  }
  // Earlier orders still flying at the same target count toward this attack.
  let enRoute = 0;
  for (const u of world.units) if (u.owner === army && u.targetId === targetId) enRoute += u.power;
  if (!target) return { count, enRoute, outcome: 'lose' };
  if (target.owner === army) return { count, enRoute, outcome: 'reinforce' };
  if (isShielded(world, target.owner)) return { count, enRoute, outcome: 'shielded' };

  let defenders = target.troops;
  const owner = target.owner;
  if (owner !== 'neutral') {
    const stats = BASE_STATS[target.kind];
    const rate = stats.rate * getBonuses(world, owner).production * world.handicap[owner];
    defenders = Math.min(stats.capacity, defenders + rate * travel);
    for (const u of world.units)
      if (u.owner === owner && u.targetId === targetId) defenders += u.power;
  }
  const power = (count + enRoute) * getBonuses(world, army).attack;
  const outcome = power < defenders ? 'lose' : power < defenders + CLOSE_MARGIN ? 'close' : 'win';
  return { count, enRoute, outcome };
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
    base.troops += unit.power;
    return;
  }
  if (isShielded(world, base.owner)) {
    world.events.push({ type: 'blocked', baseId: base.id, by: unit.owner });
    return;
  }
  base.lastAttackedBy = unit.owner;
  base.lastAttackedAt = world.time;
  base.troops -= attack * unit.power;
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
  for (const army of world.hqVictory) {
    const rival: Army = army === 'player' ? 'enemy' : 'player';
    const rivalHasHq = world.bases.some((b) => b.kind === 'hq' && b.owner === rival);
    const armyHasHq = world.bases.some((b) => b.kind === 'hq' && b.owner === army);
    if (!rivalHasHq && armyHasHq) return army;
  }
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
