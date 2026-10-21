import type { WorldOptions } from './world';

/** Quick Battle offers three ranks; the conquest map's stars use two more tiers in between and above. */
export type DifficultyId = 'recruit' | 'corporal' | 'soldier' | 'general' | 'marshal';

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
  /** Whether the enemy sends reinforcements to its bases that are under attack. */
  aiDefends: boolean;
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
    aiDefends: false,
  },
  corporal: {
    id: 'corporal',
    label: 'CORPORAL',
    blurb: 'Getting the hang of it',
    aiInterval: 1.8,
    aiCommit: 0.6,
    aiMinTroops: 11,
    aiMargin: 3,
    aiMaxSources: 1,
    shieldSeconds: 35,
    enemyProduction: 0.9,
    aiSnipeGuard: 10,
    aiDefends: false,
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
    enemyProduction: 0.9,
    aiSnipeGuard: 8,
    aiDefends: false,
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
    aiDefends: true,
  },
  marshal: {
    id: 'marshal',
    label: 'MARSHAL',
    blurb: 'Tougher than a General',
    aiInterval: 1.1,
    aiCommit: 0.75,
    aiMinTroops: 9,
    aiMargin: 1,
    aiMaxSources: 3,
    shieldSeconds: 0,
    enemyProduction: 1.05,
    aiSnipeGuard: 0,
    aiDefends: true,
  },
};

/** The ranks Quick Battle offers. */
export const DIFFICULTY_ORDER: DifficultyId[] = ['recruit', 'soldier', 'general'];

/** Difficulty for a conquest region by its stars (index 0 = one star). */
export const STAR_DIFFICULTY: DifficultyId[] = [
  'recruit',
  'corporal',
  'soldier',
  'general',
  'marshal',
];

export function difficultyForStars(stars: number): Difficulty {
  return DIFFICULTIES[STAR_DIFFICULTY[Math.max(1, Math.min(5, stars)) - 1]!];
}

/** World setup for a battle at this difficulty (shared by the game and the bot harness). */
export function worldOptionsFor(d: Difficulty, seed: number): WorldOptions {
  return {
    seed,
    handicap: { enemy: d.enemyProduction },
    shield: { player: d.shieldSeconds },
    // Kid-friendly: taking the enemy HQ wins; losing your own HQ doesn't end your game.
    hqVictory: ['player'],
  };
}
