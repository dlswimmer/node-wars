import { createAdjutant, updateAdjutant } from './adjutant';
import { createAi, updateAi } from './ai';
import { DIFFICULTIES, worldOptionsFor, type Difficulty } from './difficulty';
import { PERSONALITIES } from './personality';
import type { LevelDef, Point } from './types';
import { createWorld, isAlive, step } from './world';
import { START_ID, getRegion, regionLevel } from './worldmap';

/**
 * Theater (Phase 2 prototype): a small front of zones, played in rounds. Each zone is a
 * Phase 1 battle map holding a garrison of troops. Each round you order attacks from your
 * zones into neighbouring ones, one per general; your generals fight them (auto) or you drop
 * in and fight yourself. Then the enemy attacks, every zone grows its garrison, and the next
 * round starts. Take the enemy's home to win; lose yours and the front is lost.
 */

export type Side = 'player' | 'enemy' | 'neutral';

export interface Zone {
  id: string;
  name: string;
  owner: Side;
  troops: number;
  neighbours: string[];
  home: boolean;
  polygon: Point[];
  centre: Point;
}

export interface TheaterState {
  seed: number;
  zones: Record<string, Zone>;
  round: number;
  /** Attacks you may order each round. */
  generals: number;
  winner: 'player' | 'enemy' | null;
  /** What happened last round, newest last. */
  log: string[];
}

export interface Order {
  from: string;
  to: string;
  /** Troops sent (taken out of the source zone). */
  troops: number;
  /** True: your general fights it. False: you drop in. */
  auto: boolean;
}

/** How many zones a theater has. */
export const THEATER_ZONES = 12;
/** Troops each zone adds per round (homes add more). */
export const ZONE_GROWTH = 4;
export const HOME_GROWTH = 8;
export const START_TROOPS = { home: 40, neutral: 12 };
/** An attack sends this share of a zone's garrison. */
export const ATTACK_SHARE = 0.6;
/** A zone needs this many troops to attack from. */
export const MIN_ATTACK = 10;
/** A battle that runs this long is a draw: the defender holds. */
const MAX_SECONDS = 600;

/** A new theater: twelve zones around the campaign start, your home west, theirs east. */
export function newTheater(seed: number): TheaterState {
  const ids: string[] = [START_ID];
  for (let k = 0; k < ids.length && ids.length < THEATER_ZONES; k++) {
    for (const n of getRegion(seed, ids[k]!).neighbours) {
      if (!ids.includes(n) && ids.length < THEATER_ZONES) ids.push(n);
    }
  }
  const zones: Record<string, Zone> = {};
  for (const id of ids) {
    const r = getRegion(seed, id);
    const centre = average(r.polygon);
    zones[id] = {
      id,
      name: r.name,
      owner: 'neutral',
      troops: START_TROOPS.neutral,
      neighbours: r.neighbours.filter((n) => ids.includes(n)),
      home: false,
      polygon: r.polygon,
      centre,
    };
  }
  const byX = [...ids].sort((a, b) => zones[a]!.centre.x - zones[b]!.centre.x);
  for (const [id, owner] of [
    [byX[0]!, 'player'],
    [byX[byX.length - 1]!, 'enemy'],
  ] as const) {
    Object.assign(zones[id]!, { owner, home: true, troops: START_TROOPS.home });
  }
  return { seed, zones, round: 1, generals: 2, winner: null, log: [] };
}

function average(points: Point[]): Point {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x, y };
}

/** Zones this side could attack from `from`. */
export function targetsFrom(state: TheaterState, from: string): string[] {
  const z = state.zones[from];
  if (!z || z.troops < MIN_ATTACK) return [];
  return z.neighbours.filter((n) => state.zones[n]!.owner !== z.owner);
}

/** Troops an attack from this zone would send. */
export function attackSize(zone: Zone): number {
  return Math.floor(zone.troops * ATTACK_SHARE);
}

/** The enemy's rank by how far the front has gone (later rounds get tougher). */
export function theaterRank(state: TheaterState, defender: Side): Difficulty {
  if (defender === 'neutral') return DIFFICULTIES.corporal;
  return state.round <= 3 ? DIFFICULTIES.soldier : DIFFICULTIES.general;
}

/**
 * The battle map for an attack on a zone: that zone's map, with your HQ holding your troops
 * and the other HQ holding theirs (the attacker's or the defender's, whichever is not you).
 */
export function battleLevel(
  state: TheaterState,
  zone: string,
  playerTroops: number,
  enemyTroops: number,
): LevelDef {
  const level = regionLevel(state.seed, zone);
  return {
    ...level,
    bases: level.bases.map((b) =>
      b.kind !== 'hq'
        ? b
        : {
            ...b,
            troops: Math.max(1, Math.round(b.owner === 'player' ? playerTroops : enemyTroops)),
          },
    ),
  };
}

export interface BattleResult {
  won: boolean;
  /** The player's troops left (in bases and on the move) when it ended. */
  survivors: number;
  /** The enemy's troops left. */
  enemyLeft: number;
}

/**
 * A battle your general fights: the same Commander brain as an auto-battle, at the enemy's
 * rank, at full speed in the sim.
 */
export function autoBattle(level: LevelDef, rank: Difficulty, seed: number): BattleResult {
  const world = createWorld(level, worldOptionsFor(rank, seed));
  const enemy = createAi('enemy', rank, PERSONALITIES.steady);
  const general = createAdjutant(5, true, 'player', rank);
  const dt = 0.1;
  while (!world.winner && isAlive(world, 'player') && world.time < MAX_SECONDS) {
    updateAdjutant(world, general, dt);
    updateAi(world, enemy, dt);
    step(world, dt);
  }
  return {
    won: world.winner === 'player',
    survivors: troopsOf(world, 'player'),
    enemyLeft: troopsOf(world, 'enemy'),
  };
}

function troopsOf(world: ReturnType<typeof createWorld>, army: 'player' | 'enemy'): number {
  let n = 0;
  for (const b of world.bases) if (b.owner === army) n += b.troops;
  for (const u of world.units) if (u.owner === army) n += u.power;
  return Math.round(n);
}

/** Take an attack's troops out of its source zone. */
export function commit(state: TheaterState, order: Order): void {
  state.zones[order.from]!.troops -= order.troops;
}

/**
 * Apply your attack's result. A win takes the zone with what survived (capped at what you
 * sent, so a long fight doesn't print troops); a loss leaves the defender what it had left.
 */
export function applyAttack(state: TheaterState, order: Order, r: BattleResult): void {
  const target = state.zones[order.to]!;
  if (r.won) {
    target.owner = 'player';
    target.troops = Math.max(5, Math.min(r.survivors, order.troops));
    state.log.push(`You took ${target.name}!`);
  } else {
    target.troops = Math.max(5, Math.min(r.enemyLeft, target.troops + 10));
    state.log.push(`Your attack on ${target.name} failed.`);
  }
  checkWinner(state);
}

/** The enemy's attack this round: its strongest border zone into your weakest neighbour. */
export function enemyOrder(state: TheaterState): Order | null {
  let best: Order | null = null;
  let bestScore = -Infinity;
  for (const z of Object.values(state.zones)) {
    if (z.owner !== 'enemy' || z.troops < MIN_ATTACK) continue;
    for (const n of z.neighbours) {
      const t = state.zones[n]!;
      if (t.owner === 'enemy') continue;
      const send = attackSize(z);
      // Likes winnable fights, your zones over empty ones, and your home most of all.
      const score = send - t.troops + (t.owner === 'player' ? 6 : 0) + (t.home ? 10 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { from: z.id, to: n, troops: send, auto: true };
      }
    }
  }
  return best && bestScore > -5 ? best : null;
}

/** Fight and apply the enemy's attack (your general defends). */
export function resolveEnemyAttack(state: TheaterState, order: Order, seed: number): void {
  const target = state.zones[order.to]!;
  commit(state, order);
  const rank = theaterRank(state, 'enemy');
  if (target.owner === 'neutral') {
    // Neutral zones don't fight back much: the bigger force takes it.
    if (order.troops > target.troops) {
      target.owner = 'enemy';
      target.troops = order.troops - target.troops;
      state.log.push(`The enemy took ${target.name}.`);
    } else {
      target.troops -= Math.floor(order.troops / 2);
    }
    return;
  }
  const level = battleLevel(state, target.id, target.troops, order.troops);
  const r = autoBattle(level, rank, seed);
  if (r.won) {
    target.troops = Math.max(5, Math.min(r.survivors, target.troops + 10));
    state.log.push(`Your general held ${target.name}!`);
  } else {
    target.owner = 'enemy';
    target.troops = Math.max(5, Math.min(r.enemyLeft, order.troops));
    state.log.push(`The enemy took ${target.name}!`);
  }
  checkWinner(state);
}

/** End of round: every zone grows its garrison. */
export function nextRound(state: TheaterState): void {
  for (const z of Object.values(state.zones)) {
    if (z.owner === 'neutral') continue;
    z.troops += z.home ? HOME_GROWTH : ZONE_GROWTH;
  }
  state.round += 1;
}

function checkWinner(state: TheaterState): void {
  const homes = Object.values(state.zones).filter((z) => z.home);
  for (const h of homes) {
    // A home taken by the other side ends the front.
    if (h.owner === 'player' && homes.some((o) => o !== h && o.owner === 'player')) {
      state.winner = 'player';
    }
    if (h.owner === 'enemy' && homes.some((o) => o !== h && o.owner === 'enemy')) {
      state.winner = 'enemy';
    }
  }
}
