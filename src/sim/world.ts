import {
  BASE_STATS,
  BONUS_PER_BASE,
  BUNKER_DAMAGE,
  CLASH_RADIUS,
  HOSPITAL_RANGE,
  HOSPITAL_RECOVERY,
  LAUNCH_INTERVAL,
  MAX_MOVE_STEP,
  OUTPOST_SPEED,
  TANK_LAUNCH_INTERVAL,
  TANK_POWER,
  TANK_SPEED,
  UNIT_SPEED,
} from './config';
import { createRng } from './rng';
import type {
  Army,
  ArmyBoosts,
  Base,
  BaseKind,
  Bonuses,
  Faction,
  LevelDef,
  Unit,
  UnitKind,
  World,
} from './types';

export interface WorldOptions {
  seed?: number;
  /** Production multipliers per army (difficulty handicap). */
  handicap?: Partial<Record<Army, number>>;
  /** Seconds from the start during which an army's bases can't be damaged. */
  shield?: Partial<Record<Army, number>>;
  /** Armies that win outright by capturing every enemy HQ (instead of every base). */
  hqVictory?: Army[];
  /** Upgrades each army brings (campaign). Production goes through `handicap`. */
  boosts?: Partial<Record<Army, Partial<ArmyBoosts>>>;
  /** Extra troops in each army's HQ at the start. */
  startTroops?: Partial<Record<Army, number>>;
}

const NO_BOOSTS: ArmyBoosts = { speed: 1, tankPower: 0 };

export function createWorld(level: LevelDef, opts: WorldOptions = {}): World {
  const bases = level.bases.map((b, id) => ({ id, ...b }));
  for (const b of bases) {
    if (b.kind === 'hq' && b.owner !== 'neutral') b.troops += opts.startTroops?.[b.owner] ?? 0;
  }
  return {
    width: level.width,
    height: level.height,
    bases,
    units: [],
    time: 0,
    winner: null,
    handicap: { player: 1, enemy: 1, ...opts.handicap },
    shieldUntil: { player: 0, enemy: 0, ...opts.shield },
    hqVictory: opts.hqVictory ?? [],
    boosts: {
      player: { ...NO_BOOSTS, ...opts.boosts?.player },
      enemy: { ...NO_BOOSTS, ...opts.boosts?.enemy },
    },
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

/**
 * Troops a base of this kind will have after building for `seconds` at `rate` per second,
 * stopping at its capacity (troops above it, from reinforcements, stay).
 */
export function grownTroops(kind: BaseKind, troops: number, rate: number, seconds: number): number {
  const capacity = BASE_STATS[kind].capacity;
  return troops >= capacity ? troops : Math.min(capacity, troops + rate * seconds);
}

/** How much of a hit lands on a base: Bunkers halve everything but tanks. */
export function damageFactor(target: BaseKind, unit: UnitKind): number {
  return target === 'bunker' && unit !== 'tank' ? BUNKER_DAMAGE : 1;
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

  const speed = UNIT_SPEED * getBonuses(world, army).speed * world.boosts[army].speed;
  const fromR = BASE_STATS[from.kind].radius * 0.6;
  const toR = BASE_STATS[to.kind].radius * 0.5;
  // Factories roll out tanks (each worth several troops); leftovers go as soldiers.
  const tankPower = TANK_POWER + world.boosts[army].tankPower;
  const tanks = from.kind === 'factory' ? Math.floor(count / tankPower) : 0;
  const soldiers = count - tanks * tankPower;
  for (let i = 0; i < tanks + soldiers; i++) {
    const tank = i < tanks;
    const [sx, sy] = jitter(world, from.x, from.y, fromR);
    const [tx, ty] = jitter(world, to.x, to.y, toR);
    world.units.push({
      id: world.nextUnitId++,
      kind: tank ? 'tank' : 'soldier',
      power: tank ? tankPower : 1,
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
  const speed = UNIT_SPEED * getBonuses(world, army).speed * world.boosts[army].speed;
  const tankPower = TANK_POWER + world.boosts[army].tankPower;
  let count = 0;
  /** Troops riding in tanks, which hit a Bunker at full power. */
  let inTanks = 0;
  let travel = 0;
  const sources: Base[] = [];
  for (const id of sourceIds) {
    const b = world.bases[id];
    if (!b || b.owner !== army || id === targetId) continue;
    const n = Math.floor(b.troops * fraction);
    count += n;
    if (b.kind === 'factory') inTanks += Math.floor(n / tankPower) * tankPower;
    sources.push(b);
    if (!target) continue;
    const s = speed * kindSpeed(b.kind, b.kind === 'factory');
    travel = Math.max(travel, Math.hypot(b.x - target.x, b.y - target.y) / s);
  }
  // Earlier orders still flying at the same target count toward this attack.
  let enRoute = 0;
  for (const u of world.units) {
    if (u.owner !== army || u.targetId !== targetId) continue;
    enRoute += u.power;
    if (u.kind === 'tank') inTanks += u.power;
  }
  if (!target) return { count, enRoute, outcome: 'lose' };
  if (target.owner === army) return { count, enRoute, outcome: 'reinforce' };
  if (isShielded(world, target.owner)) return { count, enRoute, outcome: 'shielded' };

  let defenders = target.troops;
  const owner = target.owner;
  if (owner !== 'neutral') {
    const stats = BASE_STATS[target.kind];
    const rate = stats.rate * getBonuses(world, owner).production * world.handicap[owner];
    defenders = grownTroops(target.kind, defenders, rate, travel);
    for (const u of world.units)
      if (u.owner === owner && u.targetId === targetId) defenders += u.power;
  }
  // Enemy troops flying at one of our sources along the line we'd take will meet our swarm
  // head-on and cancel out troop for troop, so they count against us. Swarms crossing the
  // path at an angle may or may not meet ours depending on timing, so they're left out: this
  // keeps the preview simple and never shows "win" for an attack that a counter-attack
  // coming straight down the same road is sure to eat up.
  let oncoming = 0;
  for (const u of world.units) {
    if (u.owner === army) continue;
    const src = sources.find((b) => b.id === u.targetId);
    if (!src) continue;
    const corridor = BASE_STATS[src.kind].radius + CLASH_RADIUS;
    if (distToSegment(u.x, u.y, src.x, src.y, target.x, target.y) <= corridor)
      oncoming += u.power * getBonuses(world, u.owner).attack;
  }
  const attack = getBonuses(world, army).attack;
  // Oncoming enemies are taken off the tanks first, so a Bunker preview never hopes too much.
  const tankHit = Math.max(0, inTanks * attack - oncoming);
  const soldierHit = Math.max(
    0,
    (count + enRoute - inTanks) * attack - Math.max(0, oncoming - inTanks * attack),
  );
  const power = tankHit + soldierHit * damageFactor(target.kind, 'soldier');
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
    const rate = BASE_STATS[b.kind].rate * bonuses[b.owner].production * world.handicap[b.owner];
    b.troops = grownTroops(b.kind, b.troops, rate, dt);
  }

  // Small sub-steps so swarms flying head-on always come within clash range.
  const moves = Math.max(1, Math.ceil(dt / MAX_MOVE_STEP - 1e-9));
  for (let i = 0; i < moves; i++) {
    moveUnits(world, dt / moves, bonuses);
    resolveClashes(world, bonuses);
  }

  world.winner = checkWinner(world);
}

function moveUnits(world: World, dt: number, bonuses: Record<Army, Bonuses>): void {
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
}

/**
 * Opposing units that meet mid-field fight it out. Each side's strength is its power times its
 * Armory bonus (the same "attack x power" an arrival hits a base with); equal strengths cancel
 * out, and the stronger unit flies on with what's left, so a soldier that runs into a tank
 * leaves it worth 2. Units are bucketed per army into a grid of CLASH_RADIUS cells, so each
 * unit only looks at enemies in the 3x3 cells around it instead of every unit on the map.
 */
function resolveClashes(world: World, bonuses: Record<Army, Bonuses>): void {
  const grids = new Map<Army, Map<number, Unit[]>>();
  for (const u of world.units) {
    // Units still waiting to leave their base are safe inside it.
    if (u.delay > 0) continue;
    // Flying units (jets, once Airfields arrive) will skip clashes here.
    let grid = grids.get(u.owner);
    if (!grid) {
      grid = new Map();
      grids.set(u.owner, grid);
    }
    const key = cellKey(Math.floor(u.x / CLASH_RADIUS), Math.floor(u.y / CLASH_RADIUS));
    const cell = grid.get(key);
    if (cell) cell.push(u);
    else grid.set(key, [u]);
  }
  if (grids.size < 2) return;

  const r2 = CLASH_RADIUS * CLASH_RADIUS;
  let anyDead = false;
  for (const u of world.units) {
    if (u.delay > 0 || u.power <= 0) continue;
    const cx = Math.floor(u.x / CLASH_RADIUS);
    const cy = Math.floor(u.y / CLASH_RADIUS);
    scan: for (const [army, grid] of grids) {
      if (army === u.owner) continue;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get(cellKey(cx + dx, cy + dy));
          if (!cell) continue;
          for (const v of cell) {
            if (v.power <= 0 || (v.x - u.x) ** 2 + (v.y - u.y) ** 2 > r2) continue;
            clash(world, u, v, bonuses);
            anyDead = true;
            if (u.power <= 0) break scan;
          }
        }
      }
    }
  }
  if (anyDead) world.units = world.units.filter((u) => u.power > 0);
}

function cellKey(cx: number, cy: number): number {
  return cx * 65536 + cy;
}

function clash(world: World, a: Unit, b: Unit, bonuses: Record<Army, Bonuses>): void {
  const attackA = bonuses[a.owner].attack;
  const attackB = bonuses[b.owner].attack;
  const strengthA = a.power * attackA;
  const strengthB = b.power * attackB;
  const [beforeA, beforeB] = [a.power, b.power];
  a.power = strengthA - strengthB > 1e-6 ? (strengthA - strengthB) / attackA : 0;
  b.power = strengthB - strengthA > 1e-6 ? (strengthB - strengthA) / attackB : 0;
  const [x, y] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
  world.events.push({ type: 'clash', x, y });
  recover(world, a.owner, beforeA - a.power, x, y);
  recover(world, b.owner, beforeB - b.power, x, y);
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
  base.troops -= attack * unit.power * damageFactor(base.kind, unit.kind);
  // Ties go to the attacker so a kid's "6 against 6" works instead of leaving an empty base.
  if (base.troops <= 1e-6) {
    world.events.push({ type: 'capture', baseId: base.id, from: base.owner, to: unit.owner });
    base.owner = unit.owner;
    base.troops = Math.max(0, -base.troops);
  } else {
    world.events.push({ type: 'hit', baseId: base.id, by: unit.owner });
    // The attacker is lost in a failed hit; a hospital of theirs nearby saves some.
    recover(world, unit.owner, unit.power, base.x, base.y);
  }
}

/**
 * Some of the troops `army` just lost in a fight at (x, y) come back to its nearest Field
 * Hospital in range, if it has one.
 */
function recover(world: World, army: Army, lost: number, x: number, y: number): void {
  if (lost <= 0) return;
  let best: Base | undefined;
  let bestDist = HOSPITAL_RANGE;
  for (const b of world.bases) {
    if (b.kind !== 'hospital' || b.owner !== army) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= bestDist) {
      best = b;
      bestDist = d;
    }
  }
  if (!best) return;
  const amount = lost * HOSPITAL_RECOVERY;
  best.troops += amount;
  world.events.push({ type: 'heal', baseId: best.id, amount });
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

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(x1 + t * dx - px, y1 + t * dy - py);
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
