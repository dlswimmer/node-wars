import { DIFFICULTIES, type DifficultyId } from './sim/difficulty';

const KEY = 'node-wars:difficulty';

/**
 * Last difficulty picked on this device, or null if none has been picked yet.
 * Storage can be unavailable (private mode), so never throw.
 */
export function loadDifficulty(): DifficultyId | null {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && Object.hasOwn(DIFFICULTIES, saved)) return saved as DifficultyId;
  } catch {
    // fall through
  }
  return null;
}

export function saveDifficulty(id: DifficultyId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // not worth bothering a player about
  }
}

const PLAYED_KEY = 'node-wars:played';

/** True until this device has finished a battle; the very first one is always Boot Camp. */
export function isFirstBattle(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) === null;
  } catch {
    return false;
  }
}

export function markBattlePlayed(): void {
  try {
    localStorage.setItem(PLAYED_KEY, '1');
  } catch {
    // Boot Camp again next time is fine
  }
}

// ----- Options from the Settings screen (per device; not part of the campaign save) ------

const MUTE_KEY = 'node-wars:muted';
const VOLUME_KEY = 'node-wars:volume';
const SHAKE_KEY = 'node-wars:shake';
const HINTS_KEY = 'node-wars:attack-hints';

/** Volume steps run 0..MAX_VOLUME. */
export const MAX_VOLUME = 10;
const DEFAULT_VOLUME = 7;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable; the option lasts until the page closes.
  }
}

export function loadMuted(): boolean {
  return read(MUTE_KEY) === '1';
}

export function saveMuted(muted: boolean): void {
  write(MUTE_KEY, muted ? '1' : '0');
}

export function loadVolume(): number {
  const v = Number(read(VOLUME_KEY) ?? DEFAULT_VOLUME);
  return Number.isFinite(v) ? Math.max(0, Math.min(MAX_VOLUME, Math.round(v))) : DEFAULT_VOLUME;
}

export function saveVolume(volume: number): void {
  write(VOLUME_KEY, String(volume));
}

/** Camera shake when you lose a base or an HQ falls. On unless turned off. */
export function screenShake(): boolean {
  return read(SHAKE_KEY) !== '0';
}

export function setScreenShake(on: boolean): void {
  write(SHAKE_KEY, on ? '1' : '0');
}

/** The "12 ATTACK!" label while dragging an order. On unless turned off. */
export function attackHints(): boolean {
  return read(HINTS_KEY) !== '0';
}

export function setAttackHints(on: boolean): void {
  write(HINTS_KEY, on ? '1' : '0');
}
