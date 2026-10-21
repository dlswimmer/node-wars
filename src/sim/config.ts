import type { BaseKind } from './types';

export interface BaseStats {
  label: string;
  /** Troops produced per second while owned by an army. */
  rate: number;
  /** Production stops at this many troops (reinforcements can exceed it). */
  capacity: number;
  radius: number;
  /** Shown to the player so they know why a base is worth taking. */
  perk: string;
}

export const BASE_STATS: Record<BaseKind, BaseStats> = {
  hq: {
    label: 'HQ',
    rate: 1.6,
    capacity: 80,
    radius: 40,
    perk: 'Builds troops fastest. Capture the enemy HQ to win',
  },
  barracks: {
    label: 'Barracks',
    rate: 1.2,
    capacity: 50,
    radius: 32,
    perk: 'Builds troops quickly, second only to an HQ',
  },
  outpost: {
    label: 'Outpost',
    rate: 0.7,
    capacity: 30,
    radius: 26,
    perk: 'Troops sent from here move faster',
  },
  factory: {
    label: 'Factory',
    rate: 0.8,
    capacity: 40,
    radius: 32,
    perk: 'All your bases build faster, and it sends tanks',
  },
  radar: {
    label: 'Radar',
    rate: 0.5,
    capacity: 40,
    radius: 30,
    perk: 'All your troops move faster',
  },
  armory: {
    label: 'Armory',
    rate: 0.5,
    capacity: 40,
    radius: 30,
    perk: 'All your troops hit harder',
  },
  bunker: {
    label: 'Bunker',
    rate: 0.4,
    capacity: 60,
    radius: 32,
    perk: 'Defenders count double (tanks hit it at full power)',
  },
  airfield: {
    label: 'Airfield',
    rate: 0.6,
    capacity: 40,
    radius: 32,
    perk: "Sends jets: they fly over everything and knock troops off, but can't capture",
  },
  hospital: {
    label: 'Hospital',
    rate: 0.4,
    capacity: 40,
    radius: 30,
    perk: 'A quarter of your troops lost nearby come back here',
  },
};

/** Bonus granted per special base owned, stacking additively. */
export const BONUS_PER_BASE = {
  factory: 0.25,
  radar: 0.2,
  armory: 0.25,
} as const;

/**
 * Share of a soldier's hit that lands on a Bunker (its defenders count double). Tanks always
 * hit at full power; jets hit at this rate too.
 */
export const BUNKER_DAMAGE = 0.5;
/** Share of an army's troops lost in a fight near its Field Hospital that come back there. */
export const HOSPITAL_RECOVERY = 0.25;
/** How far (world units) from a Field Hospital a fight still counts as near it. */
export const HOSPITAL_RANGE = 220;

export const UNIT_SPEED = 75;
/** Seconds between each unit leaving when a squad is sent. */
export const LAUNCH_INTERVAL = 0.03;

/** Troops sent from a Factory roll out as tanks: each carries this many troops' worth. */
export const TANK_POWER = 3;
/** Troops sent from an Outpost (a forward launch pad) move this much faster. */
export const OUTPOST_SPEED = 1.4;
/** Seconds between tanks leaving a Factory, so they roll out as a convoy instead of a pile. */
export const TANK_LAUNCH_INTERVAL = 0.35;
/** Jets fly this many times as fast as soldiers. */
export const JET_SPEED = 2.2;
/** Tanks move at this fraction of soldier speed. */
export const TANK_SPEED = 0.6;
export const DEFAULT_SEND_FRACTION = 0.5;
/** Opposing units closer than this mid-field clash and cancel out. */
export const CLASH_RADIUS = 12;
/**
 * Unit movement is split into steps no longer than this, so two swarms flying head-on can't
 * skip past each other between steps (the bot harness steps 0.1s at a time).
 */
export const MAX_MOVE_STEP = 1 / 30;
