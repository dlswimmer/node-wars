import type { Difficulty, DifficultyId } from './difficulty';
import type { Army, Base, World } from './types';

/**
 * How an enemy army likes to fight. The rank (difficulty) sets how well it plays; its
 * personality sets how it plays, so two battles at the same rank feel different. Every
 * personality uses the same rules as everyone else; it only changes the AI's choices.
 */

export type PersonalityId = 'steady' | 'rusher' | 'turtle' | 'raider' | 'opportunist';

export interface Personality {
  id: PersonalityId;
  /** Shown before the battle ("Red is a TURTLE"). */
  label: string;
  /** One line a kid can plan around. */
  blurb: string;
  /** Multiplier on the seconds between decisions (below 1 attacks more often). */
  interval: number;
  /** Added to the share of troops it sends. */
  commit: number;
  /** Added to the extra troops it wants before attacking (negative: riskier attacks). */
  margin: number;
  /**
   * Gathers troops from every base for each attack on an army (one big wave), and if above 0
   * waits until its bases are this full first.
   */
  wave?: number;
  /**
   * Multiplier on its troop production, set through the world's handicap like a rank's (a
   * Turtle that sits back builds faster, so waiting isn't a free gift to the player).
   */
  production: number;
  /** Extra weight on how far away a target is (positive: sticks close to home). */
  distance: number;
  /** Score bonus for a target (higher means more tempting). */
  likes?: (world: World, army: Army, target: Base) => number;
}

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  steady: {
    id: 'steady',
    label: 'STEADY',
    blurb: 'Plays it by the book',
    interval: 1,
    commit: 0,
    margin: 0,
    production: 1,
    distance: 0,
  },
  rusher: {
    id: 'rusher',
    label: 'RUSHER',
    blurb: 'Attacks early and often, with small groups',
    interval: 0.7,
    commit: -0.1,
    margin: -1,
    production: 1,
    distance: 0.05,
  },
  turtle: {
    id: 'turtle',
    label: 'TURTLE',
    blurb: 'Gathers its whole army into each big attack',
    interval: 1,
    commit: 0.1,
    margin: 0,
    wave: 0,
    production: 1,
    distance: 0,
  },
  raider: {
    id: 'raider',
    label: 'RAIDER',
    blurb: 'Goes after your weakest bases',
    interval: 1,
    commit: 0,
    margin: 0,
    production: 1,
    distance: 0,
    // Bases another army holds, the emptier the better.
    likes: (_world, _army, target) => (target.owner === 'neutral' ? 0 : 8 - target.troops * 0.2),
  },
  opportunist: {
    id: 'opportunist',
    label: 'OPPORTUNIST',
    blurb: 'Waits for a fight, then grabs what is left',
    interval: 1,
    commit: 0,
    margin: 0,
    production: 1,
    distance: 0,
    // A base someone else just hit has been worn down.
    likes: (world, army, target) => {
      const hitBy = target.lastAttackedBy;
      const recent = world.time - (target.lastAttackedAt ?? -Infinity) < 8;
      return hitBy !== undefined && hitBy !== army && recent ? 10 : 0;
    },
  },
};

/**
 * The personalities each rank can roll. Early ranks always face the steady AI, since a new
 * kid's first battles should be dependable. The Turtle gathers every base into each attack,
 * which is a General's trick, so it only turns up from General on.
 */
const RANK_PERSONALITIES: Record<DifficultyId, PersonalityId[]> = {
  recruit: ['steady'],
  corporal: ['steady'],
  soldier: ['rusher', 'raider', 'opportunist'],
  general: ['rusher', 'turtle', 'raider', 'opportunist'],
  marshal: ['rusher', 'turtle', 'raider', 'opportunist'],
};

/** The personality AI army number `k` plays, from a number rolled for the battle. */
export function rollPersonality(rank: DifficultyId, roll: number, k = 0): PersonalityId {
  const options = RANK_PERSONALITIES[rank];
  return options[(roll + k) % options.length]!;
}

/** A rank's settings with a personality's changes applied. */
export function withPersonality(d: Difficulty, p: Personality): Difficulty {
  return {
    ...d,
    aiInterval: d.aiInterval * p.interval,
    aiCommit: Math.min(0.95, Math.max(0.3, d.aiCommit + p.commit)),
    aiMargin: Math.max(0, d.aiMargin + p.margin),
  };
}
