import { createRng } from './rng';
import type { Point } from './types';
import { START_ID, getRegion } from './worldmap';

/**
 * Theater (Phase 2 prototype): a front of zones fought in real time. Every zone a side owns
 * pushes into its neighbours on its own (splitting its strength between them); a push slowly
 * fills the neighbour with its colour (first wearing away the other side's, if any), with
 * some randomness, and a zone filled all the way is captured. Where two sides meet, the
 * zones between swing back and forth. Your control is supply, earned by owned zones: build
 * barracks (stronger pushes, more supply), enhance (pushes hit harder) or fortify (enemy
 * pushes in are weaker) where it matters. Take the enemy home to win.
 */

export type Side = 'player' | 'enemy';
export type Upgrade = 'build' | 'enhance' | 'fortify';

export interface Zone {
  id: string;
  name: string;
  neighbours: string[];
  home: boolean;
  polygon: Point[];
  centre: Point;
  /** How much of the zone each side holds, 0..1 (the rest is unclaimed). */
  share: Record<Side, number>;
  /** Who captured it last (filled it all the way); kept until its share runs out. */
  owner: Side | null;
  levels: Record<Upgrade, number>;
  /** World time a RALLY here ends (pushes from it are much stronger until then). */
  rallyUntil: number;
}

export interface Push {
  side: Side;
  from: string;
  to: string;
}

export interface TheaterState {
  seed: number;
  rng: () => number;
  time: number;
  zones: Record<string, Zone>;
  /** Every push going on right now (worked out each step, for drawing). */
  pushes: Push[];
  supply: Record<Side, number>;
  winner: Side | null;
  /** What just happened, newest last (a few lines for the screen). */
  log: string[];
  /** Seconds until the enemy next thinks. */
  enemyThink: number;
}

export const THEATER_ZONES = 12;
/** Share of a zone a plain zone's push fills per second, all on one neighbour (24 s). */
export const PUSH_RATE = 1 / 24;
/** Each zone a side owns makes all its pushes this much stronger: the side ahead can finish. */
export const MOMENTUM = 0.05;
/** Supply per second: each zone you own, your home, and each barracks level. */
export const SUPPLY_RATE = { zone: 0.25, home: 0.6, barracks: 0.2 };
export const MAX_LEVEL = 3;
/** Supply for each level (index 0 buys level 1). */
export const UPGRADE_COST: Record<Upgrade, number[]> = {
  build: [12, 22, 34],
  enhance: [15, 26, 40],
  fortify: [10, 18, 28],
};
/** What each level does: barracks and enhancements strengthen pushes, forts weaken pushes in. */
export const LEVEL_EFFECT = { build: 0.35, enhance: 0.3, fortify: 0.5 };
/**
 * RALLY: spend supply to make one zone push much harder for a while. Always buyable, so
 * supply never piles up uselessly, and a well-timed rally breaks a stalemate.
 */
export const RALLY = { cost: 30, seconds: 12, power: 2.5 };
/** Zones behind the front feed this share of their push to the front zones next to them. */
export const SUPPLY_LINE = 0.5;
const ENEMY_THINK = 4;

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
    zones[id] = {
      id,
      name: r.name,
      neighbours: r.neighbours.filter((n) => ids.includes(n)),
      home: false,
      polygon: r.polygon,
      centre: average(r.polygon),
      share: { player: 0, enemy: 0 },
      owner: null,
      levels: { build: 0, enhance: 0, fortify: 0 },
      rallyUntil: 0,
    };
  }
  const byX = [...ids].sort((a, b) => zones[a]!.centre.x - zones[b]!.centre.x);
  for (const [id, side] of [
    [byX[0]!, 'player'],
    [byX[byX.length - 1]!, 'enemy'],
  ] as const) {
    const z = zones[id]!;
    z.home = true;
    z.owner = side;
    z.share[side] = 1;
    z.levels.fortify = 1;
  }
  return {
    seed,
    rng: createRng(seed),
    time: 0,
    zones,
    pushes: [],
    supply: { player: 10, enemy: 10 },
    winner: null,
    log: [],
    // The enemy gives you a few seconds to look around before it starts building.
    enemyThink: 10,
  };
}

function average(points: Point[]): Point {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const y = points.reduce((s, p) => s + p.y, 0) / points.length;
  return { x, y };
}

const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');

/** The neighbours a zone is pushing into: every one its side doesn't fully hold. */
export function pushTargets(state: TheaterState, zone: Zone): string[] {
  if (!zone.owner) return [];
  return zone.neighbours.filter((n) => state.zones[n]!.share[zone.owner!] < 1);
}

/** A zone's own pushing power: its barracks, enhancements and any rally going on. */
export function zonePower(state: TheaterState, zone: Zone): number {
  const rally = state.time < zone.rallyUntil ? RALLY.power : 1;
  return (
    PUSH_RATE *
    (1 + LEVEL_EFFECT.build * zone.levels.build) *
    (1 + LEVEL_EFFECT.enhance * zone.levels.enhance) *
    rally
  );
}

/**
 * A front zone's power plus what the zones behind it send forward: a zone with nothing to
 * push into feeds part of its power, shared between the front zones it touches.
 */
export function frontPower(state: TheaterState, zone: Zone): number {
  let power = zonePower(state, zone);
  for (const id of zone.neighbours) {
    const n = state.zones[id]!;
    if (n.owner !== zone.owner || pushTargets(state, n).length > 0) continue;
    const fronts = n.neighbours.filter((m) => {
      const z = state.zones[m]!;
      return z.owner === n.owner && pushTargets(state, z).length > 0;
    }).length;
    power += (SUPPLY_LINE * zonePower(state, n)) / Math.max(1, fronts);
  }
  return power;
}

/**
 * How hard a push hits per second, before randomness. A zone pushing several ways splits
 * its strength evenly, so a zone's total push is the same whatever the map's shape.
 */
export function pushStrength(state: TheaterState, push: Push): number {
  const from = state.zones[push.from]!;
  const to = state.zones[push.to]!;
  const ways = Math.max(1, pushTargets(state, from).length);
  const owned = Object.values(state.zones).filter((z) => z.owner === push.side).length;
  const attack = (frontPower(state, from) / ways) * (1 + MOMENTUM * owned);
  // Forts only defend a zone the other side owns.
  const fort = to.owner === other(push.side) ? to.levels.fortify : 0;
  return attack / (1 + LEVEL_EFFECT.fortify * fort);
}

export function upgradeCost(zone: Zone, kind: Upgrade): number | null {
  return UPGRADE_COST[kind][zone.levels[kind]] ?? null;
}

/** Start a RALLY in one of your zones. */
export function rally(state: TheaterState, side: Side, zoneId: string): boolean {
  const z = state.zones[zoneId];
  if (!z || z.owner !== side || state.winner || state.time < z.rallyUntil) return false;
  if (state.supply[side] < RALLY.cost) return false;
  state.supply[side] -= RALLY.cost;
  z.rallyUntil = state.time + RALLY.seconds;
  return true;
}

export function buyUpgrade(
  state: TheaterState,
  side: Side,
  zoneId: string,
  kind: Upgrade,
): boolean {
  const z = state.zones[zoneId];
  if (!z || z.owner !== side || state.winner) return false;
  const cost = upgradeCost(z, kind);
  if (cost === null || state.supply[side] < cost) return false;
  state.supply[side] -= cost;
  z.levels[kind] += 1;
  return true;
}

/** Advance the front by `dt` seconds. */
export function updateTheater(state: TheaterState, dt: number): void {
  if (state.winner) return;
  state.time += dt;
  for (const side of ['player', 'enemy'] as const) {
    for (const z of Object.values(state.zones)) {
      if (z.owner !== side) continue;
      state.supply[side] +=
        dt *
        (SUPPLY_RATE.zone +
          (z.home ? SUPPLY_RATE.home : 0) +
          SUPPLY_RATE.barracks * z.levels.build);
    }
  }
  state.pushes = Object.values(state.zones).flatMap((z) =>
    pushTargets(state, z).map((to) => ({ side: z.owner!, from: z.id, to })),
  );
  // Work out every push's strength before any of them changes the map this step.
  const hits = state.pushes.map((p) => ({ p, amount: pushStrength(state, p) * dt }));
  for (const { p, amount } of hits) advancePush(state, p, amount);
  state.enemyThink -= dt;
  if (state.enemyThink <= 0) {
    state.enemyThink = ENEMY_THINK;
    enemyMoves(state);
  }
}

function advancePush(state: TheaterState, push: Push, base: number): void {
  const to = state.zones[push.to]!;
  const foe = other(push.side);
  // A zone lost this step stops pushing.
  if (state.zones[push.from]!.owner !== push.side || state.winner) return;
  // The front lurches: some seconds go well, some badly.
  let amount = base * (0.4 + 1.2 * state.rng());
  // First wear away the other side's hold, then claim the zone.
  const wear = Math.min(to.share[foe], amount);
  to.share[foe] -= wear;
  amount -= wear;
  to.share[push.side] = Math.min(1 - to.share[foe], to.share[push.side] + amount);
  if (to.share[foe] <= 0 && to.owner === foe) {
    to.owner = null;
    note(state, `${sideName(foe)} lost ${to.name}`);
  }
  if (to.share[push.side] >= 1 - 1e-9 && to.owner !== push.side) {
    to.share[push.side] = 1;
    to.owner = push.side;
    note(state, `${sideName(push.side)} captured ${to.name}!`);
    if (to.home) state.winner = push.side;
  }
}

function sideName(side: Side): string {
  return side === 'player' ? 'You' : 'The enemy';
}

function note(state: TheaterState, line: string): void {
  state.log.push(line);
  if (state.log.length > 3) state.log.shift();
}

/**
 * The enemy spends supply like a player would: fortify a zone that's being worn away, else
 * build up the zone on its front with the most borders to push across, else its home.
 */
function enemyMoves(state: TheaterState): void {
  const mine = Object.values(state.zones).filter((z) => z.owner === 'enemy');
  const losing = mine
    .filter((z) => z.share.enemy < 1)
    .sort((x, y) => x.share.enemy - y.share.enemy)[0];
  if (losing && buyUpgrade(state, 'enemy', losing.id, 'fortify')) return;
  const front = mine
    .filter((z) => pushTargets(state, z).length > 0)
    .sort((x, y) => pushTargets(state, y).length - pushTargets(state, x).length)[0];
  const home = mine.find((z) => z.home);
  for (const z of [front, home]) {
    if (!z) continue;
    if (buyUpgrade(state, 'enemy', z.id, 'build') || buyUpgrade(state, 'enemy', z.id, 'enhance'))
      return;
  }
  // Nothing left worth buying: rally the front zone with the most to push into.
  if (front && state.supply.enemy >= RALLY.cost * 2) rally(state, 'enemy', front.id);
}
