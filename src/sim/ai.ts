import { BASE_STATS, UNIT_SPEED } from './config';
import { getBonuses, sendTroops } from './world';
import type { Army, Base, World } from './types';

export interface AiState {
  army: Army;
  /** Seconds between decisions; higher is easier. */
  interval: number;
  cooldown: number;
  /** Share of a base's troops the AI commits to an attack. */
  commit: number;
}

export function createAi(army: Army, interval = 2.5): AiState {
  return { army, interval, cooldown: interval, commit: 0.6 };
}

/** Make at most one attack per decision so the AI stays beatable for a young player. */
export function updateAi(world: World, ai: AiState, dt: number): void {
  if (world.winner) return;
  ai.cooldown -= dt;
  if (ai.cooldown > 0) return;
  ai.cooldown = ai.interval;

  const attack = getBonuses(world, ai.army).attack;
  const sources = world.bases
    .filter((b) => b.owner === ai.army && b.troops >= 8)
    .sort((a, b) => b.troops - a.troops);

  for (const src of sources) {
    const available = Math.floor(src.troops * ai.commit) * attack;
    let best: Base | undefined;
    let bestScore = Infinity;
    for (const target of world.bases) {
      if (target.owner === ai.army) continue;
      const dist = Math.hypot(target.x - src.x, target.y - src.y);
      const defenders = estimateDefenders(target, dist);
      if (available < defenders + 3) continue;
      const score = defenders + dist * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    }
    if (best) {
      sendTroops(world, ai.army, src.id, best.id, ai.commit);
      return;
    }
  }
}

/** Troops the target will have when the swarm arrives, counting its production on the way. */
function estimateDefenders(target: Base, dist: number): number {
  if (target.owner === 'neutral') return target.troops;
  const stats = BASE_STATS[target.kind];
  const travel = dist / UNIT_SPEED;
  return Math.min(stats.capacity, target.troops + stats.rate * travel);
}
