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
import {
  NO_COLLEGE,
  honorFor,
  honorSpent,
  nextHonorCost,
  promotionProgress,
  type CollegeId,
  type CollegeLevels,
} from './sim/college';
import { OLD_MEDAL_SCALE } from './sim/economy';
import { isUnlocked, newConquest, recordBattle, type ConquestState } from './sim/worldmap';

/**
 * Campaign progress, saved on this device. Versioned so later phases (zones, prestige) can
 * add fields and migrate old saves instead of wiping a kid's progress.
 */
export interface SaveData {
  /** 4: Honor, the War College and Tactical Retreats. */
  version: 4;
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
  /** War College levels: permanent, never reset. */
  college: CollegeLevels;
  /** Tactical Retreats made; sets your insignia. */
  retreats: number;
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
    version: 4,
    medals: 0,
    medalsEarned: 0,
    upgrades: { ...NO_UPGRADES },
    conquest: newConquest(worldSeed()),
    ...NO_PRESTIGE(),
  };
}

/** No Honor, no War College, no retreats yet. */
function NO_PRESTIGE() {
  return { honor: 0, honorEarned: 0, phase: 1, college: { ...NO_COLLEGE }, retreats: 0 };
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
  const d = data as Partial<SaveData> | Partial<SaveV3> | Partial<SaveV2> | Partial<SaveV1> | null;
  if (!d || typeof d !== 'object') return null;
  if (d.version === 1) {
    const conquest = newConquest(worldSeed());
    const wins = d.wins ?? {};
    conquest.starWins[1] = Number(wins.recruit) || 0;
    conquest.starWins[3] = Number(wins.soldier) || 0;
    conquest.starWins[4] = Number(wins.general) || 0;
    const medals = scaleOld(d.medals);
    return {
      version: 4,
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
      version: 4,
      medals,
      // Early version-2 saves had no lifetime count yet.
      medalsEarned: Math.max(medals, scaleOld(d.medalsEarned)),
      upgrades: { ...NO_UPGRADES, ...d.upgrades },
      conquest: d.conquest,
      ...NO_PRESTIGE(),
    };
  }
  if ((d.version === 3 || d.version === 4) && d.conquest) {
    const v4 = d as Partial<SaveData>;
    // Rally was swapped for Charge: anyone who bought Rally has Charge.
    const college = { ...NO_COLLEGE, ...v4.college, charge: rallyToCharge(v4.college) };
    // Officer Corps became free Adjutant levels from Honor: its Honor comes back.
    const officers =
      Number((v4.college as { officerCorps?: number } | undefined)?.officerCorps) || 0;
    delete (college as { officerCorps?: number }).officerCorps;
    const refund = OFFICER_CORPS_COSTS.slice(0, officers).reduce((a, b) => a + b, 0);
    const honor = (Number(v4.honor) || 0) + refund;
    return {
      version: 4,
      medals: Number(d.medals) || 0,
      medalsEarned: Number(d.medalsEarned) || 0,
      upgrades: { ...NO_UPGRADES, ...d.upgrades },
      conquest: d.conquest,
      honor,
      // Saves from before lifetime Honor count what is in hand plus what was spent.
      honorEarned: Number(v4.honorEarned) || honor + honorSpent(college),
      phase: Math.max(1, Number(v4.phase) || 1),
      college,
      retreats: Number(v4.retreats) || 0,
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
  save.medals += amount;
  save.medalsEarned += amount;
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

/** What Officer Corps cost before it was replaced by free Adjutant levels (for refunds). */
const OFFICER_CORPS_COSTS = [4, 9, 15];

/** Charge replaced Rally; a War College that bought Rally gets Charge. */
function rallyToCharge(college: Partial<CollegeLevels> | undefined): number {
  const old = college as (Partial<CollegeLevels> & { rally?: number }) | undefined;
  return Math.max(Number(old?.charge) || 0, Number(old?.rally) || 0);
}

/** Buy the next level of a War College upgrade with Honor. */
export function buyCollege(id: CollegeId): boolean {
  const save = loadSave();
  const cost = nextHonorCost(save.college, id);
  if (cost === null || save.honor < cost) return false;
  save.honor -= cost;
  save.college[id] += 1;
  persist();
  return true;
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
  const startMedals = 5 * save.college.warChest;
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
