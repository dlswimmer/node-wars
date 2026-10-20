import type { DifficultyId } from './sim/difficulty';
import {
  MASTERY_WINS,
  NO_UPGRADES,
  UPGRADES,
  nextCost,
  type UpgradeId,
  type UpgradeLevels,
} from './sim/upgrades';

/**
 * Campaign progress, saved on this device. Versioned so later phases (zones, prestige) can
 * add fields and migrate old saves instead of wiping a kid's progress.
 */
export interface SaveData {
  version: 1;
  medals: number;
  upgrades: UpgradeLevels;
  /** Campaign wins the player earned themselves (not auto-battles), per rank. */
  wins: Record<DifficultyId, number>;
}

const KEY = 'node-wars:save';

function fresh(): SaveData {
  return {
    version: 1,
    medals: 0,
    upgrades: { ...NO_UPGRADES },
    wins: { recruit: 0, soldier: 0, general: 0 },
  };
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  cache = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (data.version === 1) {
        cache = {
          version: 1,
          medals: Number(data.medals) || 0,
          upgrades: { ...NO_UPGRADES, ...data.upgrades },
          wins: { ...cache.wins, ...data.wins },
        };
      }
    }
  } catch {
    // Unreadable or blocked storage: play on with a fresh save.
  }
  return cache;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSave()));
  } catch {
    // Storage unavailable (private mode); progress lasts until the page closes.
  }
}

export function addMedals(amount: number): void {
  loadSave().medals += amount;
  persist();
}

export function recordWin(rank: DifficultyId): void {
  loadSave().wins[rank] += 1;
  persist();
}

/** Buy the next level of an upgrade. Returns false if it's maxed or too expensive. */
export function buyUpgrade(id: UpgradeId): boolean {
  const save = loadSave();
  const cost = nextCost(save.upgrades, id);
  if (cost === null || save.medals < cost - 1e-9) return false;
  save.medals -= cost;
  save.upgrades[id] += 1;
  persist();
  return true;
}

export function isMastered(rank: DifficultyId): boolean {
  return loadSave().wins[rank] >= MASTERY_WINS;
}

export function canAutoBattle(rank: DifficultyId): boolean {
  const adjutantMax = UPGRADES.find((u) => u.id === 'adjutant')!.costs.length;
  return loadSave().upgrades.adjutant >= adjutantMax && isMastered(rank);
}
