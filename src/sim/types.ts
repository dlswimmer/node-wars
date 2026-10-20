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
}

/** Global multipliers an army earns from the special bases it holds. */
export interface Bonuses {
  production: number;
  speed: number;
  attack: number;
}

export interface World {
  width: number;
  height: number;
  bases: Base[];
  units: Unit[];
  time: number;
  winner: Army | null;
  nextUnitId: number;
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
