import { DEFAULT_SEND_FRACTION } from './config';
import { secondsUntilReady, useAbility, type AbilityId, type AbilityState } from './abilities';
import type { Army, Base, BaseKind, World } from './types';
import {
  capacityOf,
  getBonuses,
  isShielded,
  previewAttack,
  sendTroops,
  travelDistance,
} from './world';

/**
 * The Adjutant: an AI officer that helps run the player's army. Each level adds one duty.
 * It deliberately acts slower than a kid so an attentive player always does better; at
 * level 5 it can run a whole battle (auto-battle), a bit faster but still careful.
 */
export interface AdjutantState {
  army: Army;
  level: number;
  /** True when it runs the whole battle by itself. */
  auto: boolean;
  cooldown: number;
  /** Ids of squads it sent, so the screen can show its orders differently. */
  squads: Set<number>;
  /** World time of the player's last order; a helper waits once the player goes quiet. */
  lastOrderAt: number;
  /** What it has just done, newest last, for the call-out on the battle screen. */
  reports: AdjutantReport[];
}

export interface AdjutantReport {
  /** World time it happened. */
  at: number;
  /** "Reinforcing the barracks!" */
  text: string;
}

/** How many recent reports it keeps. */
export const REPORTS_KEPT = 3;

/** A base in kid words, for the Adjutant's reports. */
const BASE_WORDS: Record<BaseKind, string> = {
  hq: 'HQ',
  barracks: 'barracks',
  outpost: 'outpost',
  factory: 'tank factory',
  radar: 'radar',
  armory: 'armory',
  bunker: 'bunker',
  hospital: 'hospital',
  airfield: 'airfield',
  checkpoint: 'checkpoint',
};

function report(world: World, adj: AdjutantState, text: string): void {
  adj.reports.push({ at: world.time, text });
  if (adj.reports.length > REPORTS_KEPT) adj.reports.shift();
}

/** "the barracks", or "the enemy HQ" for an HQ that isn't yours. */
function called(adj: AdjutantState, base: Base): string {
  const enemy = base.kind === 'hq' && base.owner !== adj.army ? 'enemy ' : '';
  return `the ${enemy}${BASE_WORDS[base.kind]}`;
}

/** A helper (not auto-battling) only works while the player has given an order recently. */
export const HELPER_PATIENCE = 15;

/** Seconds between Adjutant decisions: helping slowly, auto-battling a bit faster. */
const ASSIST_INTERVAL = 5;
const AUTO_INTERVAL = 4;
/**
 * The Quartermaster moves troops forward from bases at least this full. Battles rarely last
 * long enough for bases to fill right up, so waiting for full meant it hardly ever acted.
 */
const PUSH_FULLNESS = 0.7;

export function createAdjutant(level: number, auto = false, army: Army = 'player'): AdjutantState {
  return { army, level, auto, cooldown: 2, squads: new Set(), lastOrderAt: 0, reports: [] };
}

/** Call whenever the player gives an order, so a helping Adjutant keeps working. */
export function notePlayerOrder(world: World, adj: AdjutantState): void {
  adj.lastOrderAt = world.time;
}

/** Whether a helping Adjutant is currently waiting for the player to act. */
export function isWaiting(world: World, adj: AdjutantState): boolean {
  return !adj.auto && world.time - adj.lastOrderAt > HELPER_PATIENCE;
}

export function updateAdjutant(
  world: World,
  adj: AdjutantState,
  dt: number,
  abilities: AbilityState | null = null,
): void {
  if (world.winner || adj.level <= 0 || isWaiting(world, adj)) return;
  adj.cooldown -= dt;
  if (adj.cooldown > 0) return;
  adj.cooldown = adj.auto ? AUTO_INTERVAL : ASSIST_INTERVAL;

  const mine = world.bases.filter((b) => b.owner === adj.army);
  if (mine.length === 0) return;
  // When auto-battling it may use every duty; when helping, only the ones it has learned.
  const level = adj.auto ? Math.max(5, adj.level) : adj.level;

  // The Gunner uses your abilities, alongside whatever else it does this turn.
  if (level >= 6 && abilities) gunner(world, adj, mine, abilities);

  if (level >= 1 && defend(world, adj, mine)) return;
  if (level >= 4 && attack(world, adj, mine, (b) => b.owner !== 'neutral')) return;
  if (level >= 3 && attack(world, adj, mine, (b) => b.owner === 'neutral')) return;
  if (level >= 2) pushForward(world, adj, mine);
}

/** Own troops in flight a Charge is worth waiting for. */
const CHARGE_WAVE = 15;
/** Own troops heading for a base before an Air Strike there is worth it. */
const STRIKE_BEHIND = 5;

/**
 * The Gunner: uses one ready ability a turn, the way a careful player would. A Supply Drop
 * on a base about to fall, an Air Strike on the base your troops are heading for, or a
 * Charge once a big wave is on its way.
 */
function gunner(world: World, adj: AdjutantState, mine: Base[], abilities: AbilityState): void {
  const ready = (id: AbilityId) => secondsUntilReady(world, abilities, id) === 0;
  const theirs = new Map<number, number>();
  const ours = new Map<number, number>();
  let inFlight = 0;
  for (const u of world.units) {
    if (u.owner === adj.army) {
      ours.set(u.targetId, (ours.get(u.targetId) ?? 0) + u.power);
      if (u.delay <= 0) inFlight += u.power;
    } else {
      const hit = u.power * getBonuses(world, u.owner).attack;
      theirs.set(u.targetId, (theirs.get(u.targetId) ?? 0) + hit);
    }
  }
  if (ready('supplyDrop') && !isShielded(world, adj.army)) {
    const falling = mine.find((b) => (theirs.get(b.id) ?? 0) >= b.troops * 0.8);
    if (falling && useAbility(world, abilities, 'supplyDrop', falling.id)) {
      report(world, adj, `Supply drop on ${called(adj, falling)}!`);
      return;
    }
  }
  if (ready('airStrike')) {
    const target = [...ours]
      .map(([id, power]) => ({ base: world.bases[id]!, power }))
      .filter(
        ({ base, power }) => base.owner !== adj.army && base.troops > 0 && power >= STRIKE_BEHIND,
      )
      .sort((a, b) => b.power - a.power)[0];
    if (target && useAbility(world, abilities, 'airStrike', target.base.id)) {
      report(world, adj, `Air strike on ${called(adj, target.base)}!`);
      return;
    }
  }
  if (ready('charge') && inFlight >= CHARGE_WAVE && useAbility(world, abilities, 'charge')) {
    report(world, adj, 'CHARGE!');
  }
}

function send(world: World, adj: AdjutantState, from: Base, to: Base, text: string): boolean {
  const n = sendTroops(world, adj.army, from.id, to.id, DEFAULT_SEND_FRACTION);
  if (n > 0) {
    adj.squads.add(world.nextSquadId - 1);
    report(world, adj, text);
  }
  return n > 0;
}

/** Reinforce a base that troops already on the way would capture. */
function defend(world: World, adj: AdjutantState, mine: Base[]): boolean {
  // Shielded bases can't be hurt, so there is nothing to defend yet.
  if (isShielded(world, adj.army)) return false;
  // How hard the troops on their way to each base will hit it, whichever army sent them.
  const incoming = new Map<number, number>();
  for (const u of world.units) {
    if (u.owner === adj.army) continue;
    const hit = u.power * getBonuses(world, u.owner).attack;
    incoming.set(u.targetId, (incoming.get(u.targetId) ?? 0) + hit);
  }
  for (const base of mine) {
    const threat = incoming.get(base.id) ?? 0;
    if (threat < base.troops) continue;
    const helper = nearest(
      world,
      mine.filter((h) => h !== base && h.troops >= 10),
      base,
    );
    if (helper && send(world, adj, helper, base, `Reinforcing ${called(adj, base)}!`)) return true;
  }
  return false;
}

/** Attack the cheapest target matching `pick` that a single base would clearly win. */
function attack(
  world: World,
  adj: AdjutantState,
  mine: Base[],
  pick: (b: Base) => boolean,
): boolean {
  let best: { from: Base; to: Base; score: number } | undefined;
  for (const to of world.bases) {
    if (to.owner === adj.army || !pick(to)) continue;
    for (const from of mine) {
      if (from.troops < 8) continue;
      const p = previewAttack(world, adj.army, [from.id], to.id, DEFAULT_SEND_FRACTION);
      if (p.outcome !== 'win') continue;
      const score = to.troops + travelDistance(world, from.id, to.id) * 0.05;
      if (!best || score < best.score) best = { from, to, score };
    }
  }
  if (!best) return false;
  const verb = best.to.owner === 'neutral' ? 'Taking' : 'Attacking';
  return send(world, adj, best.from, best.to, `${verb} ${called(adj, best.to)}!`);
}

/** A mostly full base sends troops to the friendly base closest to the enemy. */
function pushForward(world: World, adj: AdjutantState, mine: Base[]): boolean {
  const enemyHqs = world.bases.filter(
    (b) => b.kind === 'hq' && b.owner !== adj.army && b.owner !== 'neutral',
  );
  if (enemyHqs.length === 0) return false;
  const enemyHq = nearestTo(world, enemyHqs, mine);
  const front = nearest(world, mine, enemyHq);
  for (const b of mine) {
    if (b === front || b.troops < capacityOf(world, b) * PUSH_FULLNESS) continue;
    if (front && send(world, adj, b, front, `Troops advance to ${called(adj, front)}`)) return true;
  }
  return false;
}

function nearest(world: World, bases: Base[], to: Base): Base | undefined {
  return [...bases].sort(
    (a, b) => travelDistance(world, a.id, to.id) - travelDistance(world, b.id, to.id),
  )[0];
}

/** The one of `targets` closest to any of `bases`. */
function nearestTo(world: World, targets: Base[], bases: Base[]): Base {
  const reach = (t: Base) => Math.min(...bases.map((b) => travelDistance(world, b.id, t.id)));
  return [...targets].sort((a, b) => reach(a) - reach(b))[0]!;
}
