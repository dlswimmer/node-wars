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
  /** Seconds at the start when the enemy only takes neutral bases, never yours. */
  aiGracePeriod: number;
  /** Multiplier on enemy troop production. */
  enemyProduction: number;
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
    aiGracePeriod: 40,
    enemyProduction: 0.9,
  },
  soldier: {
    id: 'soldier',
    label: 'SOLDIER',
    blurb: 'A fair fight',
    aiInterval: 1.25,
    aiCommit: 0.65,
    aiMinTroops: 10,
    aiMargin: 3,
    aiMaxSources: 1,
    aiGracePeriod: 20,
    enemyProduction: 1,
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
    aiGracePeriod: 0,
    enemyProduction: 1,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['recruit', 'soldier', 'general'];
