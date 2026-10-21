import { BASE_STATS, HOSPITAL_RANGE, UNIT_SPEED } from './config';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { damageFactor, getBonuses, grownTroops, isShielded, sendTroops } from './world';
import type { Army, Base, World } from './types';

export interface AiState {
  army: Army;
  settings: Difficulty;
  cooldown: number;
  /** Seconds since the AI last found an attack it liked. */
  idle: number;
}

export function createAi(army: Army, settings: Difficulty = DIFFICULTIES.soldier): AiState {
  return { army, settings, cooldown: settings.aiInterval, idle: 0 };
}

/**
 * After this long without a good attack, the AI pools all its bases into one, so a game
 * where the player turtles behind a full HQ still comes to an end.
 */
const STALEMATE_SECONDS = 12;

const SPECIAL_KINDS = new Set(['factory', 'radar', 'armory']);

/** Makes at most one attack per decision. Difficulty controls how often and how cleverly. */
export function updateAi(world: World, ai: AiState, dt: number): void {
  if (world.winner) return;
  ai.cooldown -= dt;
  ai.idle += dt;
  if (ai.cooldown > 0) return;
  const s = ai.settings;
  ai.cooldown = s.aiInterval;

  if (s.aiDefends && defend(world, ai)) return;
  const attack = getBonuses(world, ai.army).attack;
  const sources = world.bases.filter((b) => b.owner === ai.army && b.troops >= s.aiMinTroops);
  if (sources.length === 0) return;

  let bestTarget: Base | undefined;
  let bestSources: Base[] = [];
  let bestScore = Infinity;

  for (const target of world.bases) {
    if (target.owner === ai.army) continue;
    if (isShielded(world, target.owner)) continue;
    if (isSnipe(world, ai, target)) continue;

    const nearest = [...sources]
      .sort((a, b) => dist(a, target) - dist(b, target))
      .slice(0, ai.idle > STALEMATE_SECONDS ? sources.length : s.aiMaxSources);

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
      needed = estimateDefenders(target, dist(src, target)) + s.aiMargin;
      if (power >= needed) break;
    }
    if (power < needed) continue;

    const travel = dist(used[used.length - 1]!, target);
    let score = needed + travel * 0.05;
    if (SPECIAL_KINDS.has(target.kind)) score -= 5;
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
      .sort((h1, h2) => dist(h1, base) - dist(h2, base))[0];
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

/**
 * Extra worth of a Bunker or Field Hospital from where it stands: a Bunker on the road
 * between the two HQs is a chokepoint, and a Hospital is worth most close to the front.
 */
function positionValue(world: World, army: Army, target: Base): number {
  if (target.kind === 'bunker') {
    const home = world.bases.find((b) => b.kind === 'hq' && b.owner === army);
    const rival = world.bases.find(
      (b) => b.kind === 'hq' && b.owner !== army && b.owner !== 'neutral',
    );
    if (!home || !rival) return 2;
    // 1 when it sits right on the line between the HQs, falling off to 0 well to the side.
    const detour = dist(home, target) + dist(target, rival) - dist(home, rival);
    return 2 + 4 * Math.max(0, 1 - detour / 300);
  }
  if (target.kind === 'hospital') {
    const front = world.bases.some(
      (b) => b.owner !== army && b.owner !== 'neutral' && dist(b, target) <= HOSPITAL_RANGE * 1.5,
    );
    return front ? 5 : 2;
  }
  return 0;
}

function dist(a: Base, b: Base): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Troops the target will have when the swarm arrives, counting its production on the way. */
function estimateDefenders(target: Base, distance: number): number {
  if (target.owner === 'neutral') return target.troops;
  const stats = BASE_STATS[target.kind];
  return grownTroops(target.kind, target.troops, stats.rate, distance / UNIT_SPEED);
}
