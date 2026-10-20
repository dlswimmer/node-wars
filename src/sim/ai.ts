import { BASE_STATS, UNIT_SPEED } from './config';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { getBonuses, isShielded, sendTroops } from './world';
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
      power += Math.floor(src.troops * s.aiCommit) * attack;
      used.push(src);
      needed = estimateDefenders(target, dist(src, target)) + s.aiMargin;
      if (power >= needed) break;
    }
    if (power < needed) continue;

    const travel = dist(used[used.length - 1]!, target);
    let score = needed + travel * 0.05;
    if (SPECIAL_KINDS.has(target.kind)) score -= 5;
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

function dist(a: Base, b: Base): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Troops the target will have when the swarm arrives, counting its production on the way. */
function estimateDefenders(target: Base, distance: number): number {
  if (target.owner === 'neutral') return target.troops;
  const stats = BASE_STATS[target.kind];
  const travel = distance / UNIT_SPEED;
  return Math.min(stats.capacity, target.troops + stats.rate * travel);
}
