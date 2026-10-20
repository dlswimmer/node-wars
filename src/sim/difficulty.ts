import type { WorldOptions } from './world';

export type DifficultyId = 'recruit' | 'soldier' | 'general';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  blurb: string;
  /** Seconds between enemy decisions; higher is easier. */
  aiInterval: number;
  /** Share of a base's troops the enemy commits to an attack. */
  aiCommit: number;
  /** Enemy bases need at least this many troops before they attack. */
  aiMinTroops: number;
  /** Extra troops the enemy wants on top of the defenders before attacking. */
  aiMargin: number;
  /** How many of its bases the enemy combines into one attack. */
  aiMaxSources: number;
  /** Seconds at the start when your bases are shielded and the enemy can only take neutral ones. */
  shieldSeconds: number;
  /** Multiplier on enemy troop production. */
  enemyProduction: number;
  /**
   * Seconds the enemy leaves a neutral base alone after another army attacks it, so it
   * doesn't snipe bases a kid just wore down. 0 = no manners.
   */
  aiSnipeGuard: number;
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  recruit: {
    id: 'recruit',
    label: 'RECRUIT',
    blurb: 'Learning the ropes',
    aiInterval: 2,
    aiCommit: 0.55,
    aiMinTroops: 12,
    aiMargin: 5,
    aiMaxSources: 1,
    shieldSeconds: 40,
    enemyProduction: 0.9,
    aiSnipeGuard: 12,
  },
  soldier: {
    id: 'soldier',
    label: 'SOLDIER',
    blurb: 'A fair fight',
    aiInterval: 1.25,
    aiCommit: 0.65,
    aiMinTroops: 10,
    aiMargin: 2,
    aiMaxSources: 1,
    shieldSeconds: 20,
    enemyProduction: 1,
    aiSnipeGuard: 8,
  },
  general: {
    id: 'general',
    label: 'GENERAL',
    blurb: 'For experts only',
    aiInterval: 1.2,
    aiCommit: 0.7,
    aiMinTroops: 10,
    aiMargin: 2,
    aiMaxSources: 3,
    shieldSeconds: 0,
    enemyProduction: 1,
    aiSnipeGuard: 0,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['recruit', 'soldier', 'general'];

/** World setup for a battle at this difficulty (shared by the game and the bot harness). */
export function worldOptionsFor(d: Difficulty, seed: number): WorldOptions {
  return { seed, handicap: { enemy: d.enemyProduction }, shield: { player: d.shieldSeconds } };
}
