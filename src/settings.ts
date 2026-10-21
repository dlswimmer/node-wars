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
