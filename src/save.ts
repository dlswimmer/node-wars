import {
  MASTERY_WINS,
  NO_UPGRADES,
  UPGRADES,
  nextCost,
  type UpgradeId,
  type UpgradeLevels,
} from './sim/upgrades';
import { newConquest, recordBattle, type ConquestState } from './sim/worldmap';

/**
 * Campaign progress, saved on this device. Versioned so later phases (zones, prestige) can
 * add fields and migrate old saves instead of wiping a kid's progress.
 */
export interface SaveData {
  version: 2;
  medals: number;
  upgrades: UpgradeLevels;
  /** The conquest map: world seed, regions held, ratings and wins. */
  conquest: ConquestState;
}

/** Version 1 kept wins per rank instead of a conquest map. */
interface SaveV1 {
  version: 1;
  medals: number;
  upgrades: Partial<UpgradeLevels>;
  wins: Partial<Record<'recruit' | 'soldier' | 'general', number>>;
}

const KEY = 'node-wars:save';

/** A new world for a new campaign (the world itself is generated from this seed). */
function worldSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

function fresh(): SaveData {
  return {
    version: 2,
    medals: 0,
    upgrades: { ...NO_UPGRADES },
    conquest: newConquest(worldSeed()),
  };
}

/** Old saves keep their medals and upgrades; rank wins count as wins at matching stars. */
export function migrate(data: unknown): SaveData | null {
  const d = data as Partial<SaveData> | Partial<SaveV1> | null;
  if (!d || typeof d !== 'object') return null;
  if (d.version === 1) {
    const conquest = newConquest(worldSeed());
    const wins = d.wins ?? {};
    conquest.starWins[1] = Number(wins.recruit) || 0;
    conquest.starWins[3] = Number(wins.soldier) || 0;
    conquest.starWins[4] = Number(wins.general) || 0;
    return {
      version: 2,
      medals: Number(d.medals) || 0,
      upgrades: { ...NO_UPGRADES, ...d.upgrades },
      conquest,
    };
  }
  if (d.version === 2 && d.conquest) {
    return {
      version: 2,
      medals: Number(d.medals) || 0,
      upgrades: { ...NO_UPGRADES, ...d.upgrades },
      conquest: d.conquest,
    };
  }
  return null;
}

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  cache = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cache = migrate(JSON.parse(raw)) ?? cache;
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

/** Record a conquest battle; returns the regions a win revealed. */
export function recordRegionBattle(region: string, won: boolean, auto: boolean): string[] {
  const revealed = recordBattle(loadSave().conquest, region, won, auto);
  persist();
  return revealed;
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

/** Wins the player has earned themselves at a star level, toward mastering it. */
export function starWins(stars: number): number {
  return loadSave().conquest.starWins[stars] ?? 0;
}

export function isMastered(stars: number): boolean {
  return starWins(stars) >= MASTERY_WINS;
}

/** The Adjutant may auto-battle a region you hold, once you've mastered its star level. */
export function canAutoBattle(region: string): boolean {
  const { conquest, upgrades } = loadSave();
  const adjutantMax = UPGRADES.find((u) => u.id === 'adjutant')!.costs.length;
  const stars = conquest.regions[region]?.stars ?? 0;
  return upgrades.adjutant >= adjutantMax && conquest.held.includes(region) && isMastered(stars);
}
