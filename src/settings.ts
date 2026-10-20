import { DIFFICULTIES, type DifficultyId } from './sim/difficulty';

const KEY = 'node-wars:difficulty';

/** Last difficulty picked on this device. Storage can be unavailable (private mode), so never throw. */
export function loadDifficulty(): DifficultyId {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in DIFFICULTIES) return saved as DifficultyId;
  } catch {
    // fall through to the default
  }
  return 'soldier';
}

export function saveDifficulty(id: DifficultyId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // not worth bothering a player about
  }
}
