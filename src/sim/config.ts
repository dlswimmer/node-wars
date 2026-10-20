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
  hq: { label: 'HQ', rate: 1.6, capacity: 80, radius: 36, perk: 'Fast troop production' },
  barracks: {
    label: 'Barracks',
    rate: 1.2,
    capacity: 50,
    radius: 28,
    perk: 'Good troop production',
  },
  outpost: { label: 'Outpost', rate: 0.7, capacity: 30, radius: 22, perk: 'Small forward base' },
  factory: {
    label: 'Factory',
    rate: 0.5,
    capacity: 40,
    radius: 28,
    perk: 'All your bases build faster',
  },
  radar: {
    label: 'Radar',
    rate: 0.5,
    capacity: 40,
    radius: 26,
    perk: 'All your troops move faster',
  },
  armory: {
    label: 'Armory',
    rate: 0.5,
    capacity: 40,
    radius: 26,
    perk: 'All your troops hit harder',
  },
};

/** Bonus granted per special base owned, stacking additively. */
export const BONUS_PER_BASE = {
  factory: 0.25,
  radar: 0.2,
  armory: 0.25,
} as const;

export const UNIT_SPEED = 90;
/** Seconds between each unit leaving when a squad is sent. */
export const LAUNCH_INTERVAL = 0.03;
export const DEFAULT_SEND_FRACTION = 0.5;
