import {
  ADJUTANT_BUYABLE,
  MASTERY_WINS,
  NO_UPGRADES,
  adjutantLevel,
  canBuyAdjutant,
  nextCost,
  type UpgradeId,
  type UpgradeLevels,
} from './sim/upgrades';
import { honorFor, promotionProgress } from './sim/college';
import {
  collegeCost,
  collegeEffects,
  collegeNode,
  collegeSpent,
  collegeState,
} from './sim/collegeweb';
import { OLD_MEDAL_SCALE, exactMedals } from './sim/economy';
import { isUnlocked, newConquest, recordBattle, type ConquestState } from './sim/worldmap';

/**
 * Campaign progress, saved on this device. Versioned so later phases (zones, prestige) can
 * add fields and migrate old saves instead of wiping a kid's progress.
 */
export interface SaveData {
  /** 5: the War College is an upgrade web (4 had Honor and Tactical Retreats, college levels). */
  version: 5;
  /** Medals to spend. */
  medals: number;
  /** Every medal ever earned (spending doesn't lower it); unlocks higher-star regions. */
  medalsEarned: number;
  upgrades: UpgradeLevels;
  /** The conquest map: world seed, regions held, ratings and wins. */
  conquest: ConquestState;
  /** Honor to spend in the War College (only Tactical Retreats pay it). */
  honor: number;
  /** Every Honor ever earned (spending doesn't lower it); counts toward a Promotion. */
  honorEarned: number;
  /** Highest phase the player has been promoted to (1 = still in the first). */
  phase: number;
  /** War College web nodes owned (ids from collegeweb.ts): permanent, never reset. */
  college: string[];
  /** Tactical Retreats made; sets your insignia. */
  retreats: number;
}

/** Version 4 had the War College as levels of named upgrades. */
interface SaveV4 extends Omit<SaveData, 'version' | 'college'> {
  version: 4;
  college: Record<string, number>;
}

/** Version 3 had whole medals but no prestige yet. */
interface SaveV3 extends Omit<
  SaveData,
  'version' | 'honor' | 'honorEarned' | 'phase' | 'college' | 'retreats'
> {
  version: 3;
}

/** Version 2 had the conquest map but paid ½-2 medals a win. */
interface SaveV2 extends Omit<SaveV3, 'version'> {
  version: 2;
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
    version: 5,
    medals: 0,
    medalsEarned: 0,
    upgrades: { ...NO_UPGRADES },
    conquest: newConquest(worldSeed()),
    ...NO_PRESTIGE(),
  };
}

/** No Honor, no War College, no retreats yet. */
function NO_PRESTIGE() {
  return { honor: 0, honorEarned: 0, phase: 1, college: [] as string[], retreats: 0 };
}

/** Medals from before whole medals, scaled to keep the same buying power. */
function scaleOld(medals: unknown): number {
  return Math.round((Number(medals) || 0) * OLD_MEDAL_SCALE);
}

/**
 * Old saves keep their medals (scaled to whole medals) and upgrades. Version-1 rank wins count
 * as wins at matching stars, and its medals in hand count as earned (what was spent before is
 * unknown).
 */
export function migrate(data: unknown): SaveData | null {
  const d = data as
    | Partial<SaveData>
    | Partial<SaveV4>
    | Partial<SaveV3>
    | Partial<SaveV2>
    | Partial<SaveV1>
    | null;
  if (!d || typeof d !== 'object') return null;
  if (d.version === 1) {
    const conquest = newConquest(worldSeed());
    const wins = d.wins ?? {};
    conquest.starWins[1] = Number(wins.recruit) || 0;
    conquest.starWins[3] = Number(wins.soldier) || 0;
    conquest.starWins[4] = Number(wins.general) || 0;
    const medals = scaleOld(d.medals);
    return {
      version: 5,
      medals,
      medalsEarned: medals,
      upgrades: { ...NO_UPGRADES, ...d.upgrades },
      conquest,
      ...NO_PRESTIGE(),
    };
  }
  if (d.version === 2 && d.conquest) {
    const medals = scaleOld(d.medals);
    return {
      version: 5,
      medals,
      // Early version-2 saves had no lifetime count yet.
      medalsEarned: Math.max(medals, scaleOld(d.medalsEarned)),
      upgrades: { ...NO_UPGRADES, ...d.upgrades },
      conquest: d.conquest,
      ...NO_PRESTIGE(),
    };
  }
  if ((d.version === 3 || d.version === 4) && d.conquest) {
    const v4 = d as Partial<SaveV4>;
    // The War College became a web: every Honor spent on its old levels comes back to spend
    // on the web (Officer Corps and Rally included).
    const refund = legacyHonorSpent(v4.college ?? {});
    const honor = (Number(v4.honor) || 0) + refund;
    return {
      version: 5,
      medals: Number(d.medals) || 0,
      medalsEarned: Number(d.medalsEarned) || 0,
      upgrades: { ...NO_UPGRADES, ...d.upgrades },
      conquest: d.conquest,
      honor,
      // Saves from before lifetime Honor count what is in hand (now including the refund).
      honorEarned: Number(v4.honorEarned) || honor,
      phase: Math.max(1, Number(v4.phase) || 1),
      college: [],
      retreats: Number(v4.retreats) || 0,
    };
  }
  if (d.version === 5 && d.conquest) {
    const v5 = d as Partial<SaveData>;
    return {
      ...fresh(),
      ...v5,
      version: 5,
      upgrades: { ...NO_UPGRADES, ...v5.upgrades },
      conquest: d.conquest,
      college: Array.isArray(v5.college) ? v5.college.filter((id) => collegeNode(id)) : [],
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

/** Earn medals (auto-battle medals count too, so farming unlocks regions). */
export function addMedals(amount: number): void {
  const save = loadSave();
  save.medals = exactMedals(save.medals + amount);
  save.medalsEarned = exactMedals(save.medalsEarned + amount);
  persist();
}

/** Record a conquest battle; returns the regions a win revealed. */
export function recordRegionBattle(region: string, won: boolean, auto: boolean): string[] {
  const save = loadSave();
  const revealed = recordBattle(save.conquest, region, won, auto, save.medalsEarned);
  persist();
  return revealed;
}

/** Buy the next level of an upgrade. Returns false if it's maxed or too expensive. */
export function buyUpgrade(id: UpgradeId): boolean {
  const save = loadSave();
  if (id === 'adjutant' && !canBuyAdjutant(save.upgrades.adjutant, save.honorEarned)) return false;
  const cost = nextCost(save.upgrades, id);
  if (cost === null || save.medals < cost) return false;
  save.medals = exactMedals(save.medals - cost);
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
  const { conquest, upgrades, honorEarned } = loadSave();
  const stars = conquest.regions[region]?.stars ?? 0;
  const commander = adjutantLevel(upgrades.adjutant, honorEarned) >= ADJUTANT_BUYABLE;
  return commander && conquest.held.includes(region) && isMastered(stars);
}

/** Whether you've earned enough medals to attack a region with this many stars. */
export function starsUnlocked(stars: number): boolean {
  return isUnlocked(stars, loadSave().medalsEarned);
}

/** Start a fresh conquest map on a new world; medals and upgrades stay. */
export function newWorld(): void {
  const save = loadSave();
  const old = save.conquest.seed;
  let seed = worldSeed();
  while (seed === old) seed = worldSeed();
  // Mastery is the player's own skill, so it carries over to the new world.
  const starWins = save.conquest.starWins;
  save.conquest = { ...newConquest(seed), starWins };
  persist();
}

/** What each level of the old War College cost (version 4 saves), for refunds. */
const LEGACY_COLLEGE_COSTS: Record<string, number[]> = {
  veteranPay: [3, 6, 10, 15, 22],
  warChest: [2, 4, 7, 11, 16],
  drillSchool: [3, 6, 10, 15, 22],
  logistics: [3, 6, 10, 15, 22],
  gunnery: [3, 6, 10, 15, 22],
  fortifications: [4, 9, 15],
  officerCorps: [4, 9, 15],
  airStrike: [8],
  supplyDrop: [8],
  charge: [12],
  rally: [8],
};

/** Honor a version-4 save spent on its War College levels. */
function legacyHonorSpent(levels: Record<string, number>): number {
  let spent = 0;
  for (const [id, n] of Object.entries(levels)) {
    const costs = LEGACY_COLLEGE_COSTS[id] ?? [];
    spent += costs.slice(0, Number(n) || 0).reduce((a, b) => a + b, 0);
  }
  return spent;
}

/** Buy a War College web node with Honor. Returns false if it isn't open or is too dear. */
export function buyCollege(id: string): boolean {
  const save = loadSave();
  const node = collegeNode(id);
  if (!node || collegeState(node, save.college) !== 'open') return false;
  const cost = collegeCost(node);
  if (save.honor < cost) return false;
  const before = collegeEffects(save.college).startMedals;
  save.honor -= cost;
  save.college.push(id);
  // Starting medals bought before a war's first battle still count for that war, so you can
  // spend Honor right after a Tactical Retreat.
  if (save.conquest.battles === 0) {
    const extra = collegeEffects(save.college).startMedals - before;
    save.medals += extra;
    save.medalsEarned += extra;
  }
  persist();
  return true;
}

/** Honor spent in the War College so far. */
export function collegeHonorSpent(): number {
  return collegeSpent(loadSave().college);
}

/**
 * Tactical Retreat: bank Honor for how far this war got, then start a new war on a new world
 * with no medals and no Command Tent upgrades. Honor, the War College, insignia and your
 * mastery (wins per star level) stay. War Chest and Officer Corps give the new war a start.
 * Returns the Honor earned, or 0 (and does nothing) if the war hasn't gone far enough.
 */
export function tacticalRetreat(): number {
  const save = loadSave();
  const honor = honorFor(save.conquest);
  if (honor <= 0) return 0;
  const starWins = save.conquest.starWins;
  let seed = worldSeed();
  while (seed === save.conquest.seed) seed = worldSeed();
  const startMedals = collegeEffects(save.college).startMedals;
  save.honor += honor;
  save.honorEarned += honor;
  save.retreats += 1;
  save.medals = startMedals;
  save.medalsEarned = startMedals;
  save.upgrades = { ...NO_UPGRADES };
  save.conquest = { ...newConquest(seed), starWins };
  persist();
  return honor;
}

/**
 * Promotion: once Honor earned (plus this war's) reaches the goal, move up a phase. The next
 * phase isn't built yet, so for now this records the Promotion (a badge) and the war goes on.
 */
export function promote(): boolean {
  const save = loadSave();
  if (save.phase >= 2 || !promotionProgress(save.honorEarned, save.conquest).ready) return false;
  save.phase = 2;
  persist();
  return true;
}

/** Erase all campaign progress: medals, upgrades and the world. */
export function resetAll(): void {
  cache = fresh();
  persist();
}
