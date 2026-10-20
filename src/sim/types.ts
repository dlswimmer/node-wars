export type Faction = 'player' | 'enemy' | 'neutral';

/** Factions that actually fight (neutral bases never attack or grow). */
export type Army = Exclude<Faction, 'neutral'>;

export type BaseKind = 'hq' | 'barracks' | 'outpost' | 'factory' | 'radar' | 'armory';

export interface Base {
  id: number;
  kind: BaseKind;
  x: number;
  y: number;
  owner: Faction;
  /** Fractional so production can accumulate smoothly; display with Math.floor. */
  troops: number;
  /** Most recent army to land an attack here, and when (used so AIs can avoid sniping). */
  lastAttackedBy?: Army;
  lastAttackedAt?: number;
}

export interface Unit {
  id: number;
  owner: Army;
  targetId: number;
  x: number;
  y: number;
  /** Aim point near the target base, jittered so the swarm spreads out. */
  tx: number;
  ty: number;
  speed: number;
  /** Seconds before this unit leaves its base (staggers the swarm). */
  delay: number;
  /** Units sent by the same order share a squad id. */
  squad: number;
}

/** Global multipliers an army earns from the special bases it holds. */
export interface Bonuses {
  production: number;
  speed: number;
  attack: number;
}

/** Things that happened during a step, for the renderer to show (flashes, sounds). */
export type SimEvent =
  | { type: 'capture'; baseId: number; from: Faction; to: Army }
  | { type: 'hit'; baseId: number; by: Army }
  | { type: 'blocked'; baseId: number; by: Army };

export interface World {
  width: number;
  height: number;
  bases: Base[];
  units: Unit[];
  time: number;
  winner: Army | null;
  /** Per-army production multiplier, used for difficulty handicaps. */
  handicap: Record<Army, number>;
  /** An army's bases can't be damaged until this time (opening grace period). */
  shieldUntil: Record<Army, number>;
  /** Events from the most recent step. */
  events: SimEvent[];
  nextUnitId: number;
  nextSquadId: number;
  rng: () => number;
}

export interface BaseDef {
  kind: BaseKind;
  x: number;
  y: number;
  owner: Faction;
  troops: number;
}

export interface LevelDef {
  id: string;
  name: string;
  width: number;
  height: number;
  bases: BaseDef[];
}
