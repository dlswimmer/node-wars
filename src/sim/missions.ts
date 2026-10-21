import { BASE_STATS } from './config';
import { MISSION_MEDALS } from './economy';
import { createRng } from './rng';
import type { BaseKind, LevelDef, World } from './types';

/**
 * A bonus goal for a conquest-map region, on top of winning the battle. Each region has its
 * own mission, fixed by the world's seed, shown on the map before you attack and announced
 * when the battle starts. Completing it pays a bonus medal. Winning is still what counts; a
 * missed mission only means no bonus.
 */

/**
 * An "Outnumbered" mission (the enemy starts with extra bases) was tried and dropped: even one
 * extra base took the adult bot from 40% to 5% at General, so it stopped being a bonus.
 */
export type MissionKind = 'capture' | 'blitz' | 'untouchable' | 'expand';

export interface Mission {
  kind: MissionKind;
  /** One line a kid can read at a glance ("Capture both Radars"). */
  text: string;
  /** Blitz: win within this many seconds. */
  seconds?: number;
  /** Capture: hold every base of this kind at the same time. */
  baseKind?: BaseKind;
  /** Expand: hold this many bases at the same time. */
  hold?: number;
  medals: number;
}

/** Kinds worth a "capture them all" mission when a map has two or more of them. */
const CAPTURE_KINDS: BaseKind[] = ['factory', 'radar', 'armory', 'bunker', 'hospital', 'airfield'];
const PLURAL: Partial<Record<BaseKind, string>> = {
  factory: 'Factories',
  armory: 'Armories',
};
/** Expand: hold this share of the map's bases at once. */
const EXPAND_SHARE = 0.6;

/** The mission for a region, or null (the tutorial region has none). */
export function regionMission(
  seed: number,
  id: string,
  level: LevelDef,
  stars: number,
  tutorial: boolean,
): Mission | null {
  if (tutorial) return null;
  let hash = seed >>> 0;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 2654435761) >>> 0;
  const rng = createRng(hash + 17);

  const options: Mission[] = [];
  const counts = new Map<BaseKind, number>();
  for (const b of level.bases) counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
  const kinds = CAPTURE_KINDS.filter((k) => (counts.get(k) ?? 0) >= 2);
  if (kinds.length > 0) {
    const baseKind = kinds[Math.floor(rng() * kinds.length)]!;
    const n = counts.get(baseKind)!;
    const name = PLURAL[baseKind] ?? `${BASE_STATS[baseKind].label}s`;
    const text = `Capture ${n === 2 ? 'both' : `all ${n}`} ${name}`;
    options.push({ kind: 'capture', text, baseKind, medals: MISSION_MEDALS });
  }
  const minutes = stars >= 3 ? 5 : 4;
  options.push({
    kind: 'blitz',
    text: `Win in under ${minutes} minutes`,
    seconds: minutes * 60,
    medals: MISSION_MEDALS,
  });
  options.push({ kind: 'untouchable', text: 'Win without losing a base', medals: MISSION_MEDALS });
  const hold = Math.ceil(level.bases.length * EXPAND_SHARE);
  options.push({
    kind: 'expand',
    text: `Hold ${hold} bases at once`,
    hold,
    medals: MISSION_MEDALS,
  });
  return options[Math.floor(rng() * options.length)]!;
}

/** What a battle has done towards its mission so far. */
export interface MissionProgress {
  mission: Mission;
  /** You held every base of the mission's kind at once at some point. */
  capturedAll: boolean;
  /** One of your bases was taken. */
  lostBase: boolean;
  /** Most bases you have held at once. */
  mostHeld: number;
}

export function startMission(mission: Mission): MissionProgress {
  return { mission, capturedAll: false, lostBase: false, mostHeld: 0 };
}

/** Update progress after a step of the battle (call it every step). */
export function trackMission(progress: MissionProgress, world: World): void {
  for (const e of world.events) {
    if (e.type === 'capture' && e.from === 'player') progress.lostBase = true;
  }
  const held = world.bases.filter((b) => b.owner === 'player').length;
  progress.mostHeld = Math.max(progress.mostHeld, held);
  const kind = progress.mission.baseKind;
  if (kind && !progress.capturedAll) {
    const all = world.bases.filter((b) => b.kind === kind);
    progress.capturedAll = all.length > 0 && all.every((b) => b.owner === 'player');
  }
}

/** Whether the mission is complete at the end of the battle. */
export function missionComplete(progress: MissionProgress, world: World, won: boolean): boolean {
  if (!won) return false;
  const m = progress.mission;
  switch (m.kind) {
    case 'capture':
      return progress.capturedAll;
    case 'blitz':
      return world.time <= (m.seconds ?? Infinity);
    case 'untouchable':
      return !progress.lostBase;
    case 'expand':
      return progress.mostHeld >= (m.hold ?? Infinity);
  }
}

/** A short status for the HUD while the battle is on ("2:31 left", "done!", "failed"). */
export function missionStatus(progress: MissionProgress, world: World): string {
  const m = progress.mission;
  switch (m.kind) {
    case 'capture':
      return progress.capturedAll ? 'done!' : 'not yet';
    case 'blitz': {
      const left = Math.max(0, (m.seconds ?? 0) - world.time);
      if (left <= 0) return 'out of time';
      return `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} left`;
    }
    case 'untouchable':
      return progress.lostBase ? 'missed' : 'so far so good';
    case 'expand': {
      const goal = m.hold ?? 0;
      return progress.mostHeld >= goal ? 'done!' : `${progress.mostHeld} of ${goal}`;
    }
  }
}
