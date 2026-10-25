import { BASE_STATS, UNIT_SPEED } from './config';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import {
  damageFactor,
  getBonuses,
  grownTroops,
  isShielded,
  sendTroops,
  travelDistance,
} from './world';
import { PERSONALITIES, withPersonality, type Personality } from './personality';
import type { Army, Base, World } from './types';
import { SPECIAL_KINDS, SPECIAL_WORTH, positionValue } from './value';

export interface AiState {
  army: Army;
  /** The rank's settings with the personality's changes applied. */
  settings: Difficulty;
  personality: Personality;
  cooldown: number;
  /** Seconds since the AI last found an attack it liked. */
  idle: number;
}

export function createAi(
  army: Army,
  rank: Difficulty = DIFFICULTIES.soldier,
  personality: Personality = PERSONALITIES.steady,
): AiState {
  const settings = withPersonality(rank, personality);
  return { army, settings, personality, cooldown: settings.aiInterval, idle: 0 };
}

/**
 * After this long without a good attack, the AI pools all its bases into one, so a game
 * where the player turtles behind a full HQ still comes to an end.
 */
const STALEMATE_SECONDS = 12;
/**
 * After this long, the AI pools its bases into every attack, drops its personality's habits
 * and waits for a bigger edge, so a battle that has turned into swapping the same few bases
 * back and forth still comes to an end.
 */
const LONG_BATTLE_SECONDS = 360;
/** Extra troops the AI wants on top of the defenders in a long battle. */
const LONG_MARGIN = 6;

/** Makes at most one attack per decision. Difficulty controls how often and how cleverly. */
export function updateAi(world: World, ai: AiState, dt: number): void {
  if (world.winner) return;
  ai.cooldown -= dt;
  ai.idle += dt;
  if (ai.cooldown > 0) return;
  const s = ai.settings;
  ai.cooldown = s.aiInterval;

  if (s.aiDefends && defend(world, ai)) return;
  const p = ai.personality;
  const long = world.time > LONG_BATTLE_SECONDS;
  const stalled = ai.idle > STALEMATE_SECONDS || long;
  // A turtle still takes neutral bases, but holds off attacking an army until its bases are
  // nearly full, then throws everything at once.
  const wave = p.wave !== undefined;
  const holding = wave && !stalled && fullness(world, ai.army) < p.wave!;
  const attack = getBonuses(world, ai.army).attack;
  // Jets can't capture, so Airfields don't count towards an attack; they raid ahead of it.
  const ready = (b: Base) => b.owner === ai.army && b.troops >= s.aiMinTroops;
  const sources = world.bases.filter((b) => ready(b) && b.kind !== 'airfield');
  const airfields = world.bases.filter((b) => ready(b) && b.kind === 'airfield');
  if (sources.length === 0) return;

  let bestTarget: Base | undefined;
  let bestSources: Base[] = [];
  let bestScore = Infinity;

  for (const target of world.bases) {
    if (target.owner === ai.army) continue;
    if (isShielded(world, target.owner)) continue;
    if (isSnipe(world, ai, target)) continue;
    const atArmy = target.owner !== 'neutral';
    if (holding && atArmy) continue;

    const nearest = [...sources]
      .sort((a, b) => dist(world, a, target) - dist(world, b, target))
      .slice(0, stalled || (wave && atArmy) ? sources.length : s.aiMaxSources);

    let power = 0;
    const used: Base[] = [];
    let needed = 0;
    for (const src of nearest) {
      // Soldiers only do half damage to a Bunker and a Factory's tanks full, but easier
      // enemies don't think of that and learn the hard way.
      const unit = src.kind === 'factory' || !s.aiKnowsBases ? 'tank' : 'soldier';
      const hit = damageFactor(target.kind, unit);
      power += Math.floor(src.troops * s.aiCommit) * attack * hit;
      used.push(src);
      needed =
        estimateDefenders(target, dist(world, src, target)) + s.aiMargin + (long ? LONG_MARGIN : 0);
      if (power >= needed) break;
    }
    if (power < needed) continue;

    const travel = dist(world, used[used.length - 1]!, target);
    let score = needed + travel * (0.05 + p.distance);
    if (!long) score -= p.likes?.(world, ai.army, target) ?? 0;
    if (SPECIAL_KINDS.has(target.kind)) score -= SPECIAL_WORTH;
    if (s.aiKnowsBases) score -= positionValue(world, ai.army, target);
    if (score < bestScore) {
      bestScore = score;
      bestTarget = target;
      bestSources = used;
    }
  }

  if (!bestTarget) return;
  ai.idle = 0;
  for (const src of bestSources) sendTroops(world, ai.army, src.id, bestTarget.id, s.aiCommit);
  for (const a of airfields) sendTroops(world, ai.army, a.id, bestTarget.id, s.aiCommit);
}

/** How full an army's bases are, 0..1. */
function fullness(world: World, army: Army): number {
  let troops = 0;
  let room = 0;
  for (const b of world.bases) {
    if (b.owner !== army) continue;
    troops += Math.min(b.troops, BASE_STATS[b.kind].capacity);
    room += BASE_STATS[b.kind].capacity;
  }
  return room > 0 ? troops / room : 0;
}

/**
 * Reinforce the most important base that troops already on the way would capture (the HQ
 * first). Returns true if it sent help.
 */
function defend(world: World, ai: AiState): boolean {
  const incoming = new Map<number, number>();
  for (const u of world.units) {
    if (u.owner !== ai.army) incoming.set(u.targetId, (incoming.get(u.targetId) ?? 0) + u.power);
  }
  const threatened = world.bases
    .filter((b) => b.owner === ai.army && (incoming.get(b.id) ?? 0) >= b.troops * 0.8)
    .sort((a, b) => Number(b.kind === 'hq') - Number(a.kind === 'hq'));
  for (const base of threatened) {
    const helper = world.bases
      .filter((h) => h.owner === ai.army && h !== base && h.troops >= 8)
      .sort((h1, h2) => dist(world, h1, base) - dist(world, h2, base))[0];
    if (helper) {
      sendTroops(world, ai.army, helper.id, base.id, ai.settings.aiCommit);
      ai.idle = 0;
      return true;
    }
  }
  return false;
}

/** Would attacking this neutral base steal it from another army that is already taking it? */
function isSnipe(world: World, ai: AiState, target: Base): boolean {
  const guard = ai.settings.aiSnipeGuard;
  if (guard <= 0 || target.owner !== 'neutral') return false;
  const recentlyHit =
    target.lastAttackedBy !== undefined &&
    target.lastAttackedBy !== ai.army &&
    world.time - (target.lastAttackedAt ?? -Infinity) < guard;
  return recentlyHit || world.units.some((u) => u.targetId === target.id && u.owner !== ai.army);
}

function dist(world: World, a: Base, b: Base): number {
  return travelDistance(world, a.id, b.id);
}

/** Troops the target will have when the swarm arrives, counting its production on the way. */
function estimateDefenders(target: Base, distance: number): number {
  if (target.owner === 'neutral') return target.troops;
  const stats = BASE_STATS[target.kind];
  return grownTroops(target.kind, target.troops, stats.rate, distance / UNIT_SPEED);
}
