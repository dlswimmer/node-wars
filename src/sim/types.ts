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

export type UnitKind = 'soldier' | 'tank';

export interface Unit {
  id: number;
  kind: UnitKind;
  /** Troops this unit is worth when it arrives (a tank counts as several soldiers). */
  power: number;
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

/** Lasting edges an army can bring into a battle from its upgrades. */
export interface ArmyBoosts {
  /** Multiplier on how fast its troops move. */
  speed: number;
  /** Extra troops each tank is worth. */
  tankPower: number;
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
  /** Armies that win outright by capturing every enemy HQ. */
  hqVictory: Army[];
  /** Permanent upgrades an army brings into battle (campaign only). */
  boosts: Record<Army, ArmyBoosts>;
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

export interface Point {
  x: number;
  y: number;
}

/** Scenery drawn on the map. Purely visual for now (terrain gameplay comes in Phase 2). */
export type FeatureKind = 'forest' | 'rocks' | 'lake' | 'crater' | 'sandbags' | 'traps';

export interface Feature {
  kind: FeatureKind;
  x: number;
  y: number;
  /** Rough radius of the patch. */
  size: number;
  /** Rotation; a mirrored twin is turned half a circle so it looks the same from the other side. */
  angle: number;
  /** Seeds the details (tree spots, rock shapes) so twins draw identically. */
  detail: number;
}

export interface LevelDef {
  id: string;
  name: string;
  /** Map number of a generated map (see mapgen.ts); hand-made levels have none. */
  seed?: number;
  width: number;
  height: number;
  bases: BaseDef[];
  /** Edge of the battlefield (a closed polygon around the bases); outside is fog of war. */
  outline?: Point[];
  features?: Feature[];
}
