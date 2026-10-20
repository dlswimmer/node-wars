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
