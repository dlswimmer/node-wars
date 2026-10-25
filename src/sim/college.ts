import { ABILITIES, type AbilityId } from './abilities';
import { HONOR_COSTS } from './economy';
import type { ConquestState } from './worldmap';
import { naturalStars, regionThreat } from './worldmap';

/**
 * The War College: permanent upgrades bought with Honor, which only a Tactical Retreat pays.
 * A retreat starts a new war (new world, no medals, no Command Tent upgrades) but keeps
 * Honor, the War College and your insignia, so each war goes further than the last.
 */

export type CollegeId =
  | 'veteranPay'
  | 'warChest'
  | 'drillSchool'
  | 'logistics'
  | 'gunnery'
  | 'fortifications'
  | 'officerCorps'
  | AbilityId;

export interface CollegeDef {
  id: CollegeId;
  name: string;
  /** Lasting upgrades, or commander abilities to unlock (one level each). */
  page: 'college' | 'abilities';
  /** What this many levels add up to, in kid words. */
  total: (levels: number) => string;
  /** Honor cost of each level (index 0 buys level 1); see HONOR_COSTS in economy.ts. */
  costs: number[];
}

type Def = Omit<CollegeDef, 'costs' | 'page'>;

const LASTING: Def[] = [
  { id: 'veteranPay', name: 'VETERAN PAY', total: (n) => `+${25 * n}% medals from every win` },
  { id: 'warChest', name: 'WAR CHEST', total: (n) => `start each war with ${5 * n} medals` },
  { id: 'drillSchool', name: 'DRILL SCHOOL', total: (n) => `+${6 * n}% troop building, always` },
  { id: 'logistics', name: 'LOGISTICS', total: (n) => `+${5 * n}% troop speed, always` },
  { id: 'gunnery', name: 'GUNNERY SCHOOL', total: (n) => `troops hit +${5 * n}% harder, always` },
  {
    id: 'fortifications',
    name: 'FORTIFICATIONS',
    total: (n) => `bases hold +${8 * n}% more, +${5 * n} s shield`,
  },
  {
    id: 'officerCorps',
    name: 'OFFICER CORPS',
    total: (n) => `start each war with ${n} Adjutant level${n === 1 ? '' : 's'}`,
  },
];

/** Commander abilities: unlocked once, then usable in every campaign battle. */
const POWERS: Def[] = (Object.keys(ABILITIES) as AbilityId[]).map((id) => ({
  id,
  name: ABILITIES[id].name,
  total: () => `${ABILITIES[id].blurb} (every ${ABILITIES[id].cooldown} s)`,
}));

const DEFS: Omit<CollegeDef, 'costs'>[] = [
  ...LASTING.map((d) => ({ ...d, page: 'college' as const })),
  ...POWERS.map((d) => ({ ...d, page: 'abilities' as const })),
];

export const COLLEGE: CollegeDef[] = DEFS.map((d) => ({ ...d, costs: HONOR_COSTS[d.id] }));

export type CollegeLevels = Record<CollegeId, number>;

export const NO_COLLEGE: CollegeLevels = {
  veteranPay: 0,
  warChest: 0,
  drillSchool: 0,
  logistics: 0,
  gunnery: 0,
  fortifications: 0,
  officerCorps: 0,
  airStrike: 0,
  supplyDrop: 0,
  charge: 0,
};

/** The commander abilities this War College has unlocked. */
export function unlockedAbilities(levels: CollegeLevels): AbilityId[] {
  return (Object.keys(ABILITIES) as AbilityId[]).filter((id) => levels[id] > 0);
}

export function nextHonorCost(levels: CollegeLevels, id: CollegeId): number | null {
  const def = COLLEGE.find((c) => c.id === id)!;
  return def.costs[levels[id]] ?? null;
}

/** Multiplier on medals from wins (Veteran Pay). */
export function medalBonus(levels: CollegeLevels): number {
  return 1 + 0.25 * levels.veteranPay;
}

/** The War College's lasting edges in battle, folded in with the Command Tent's. */
export function collegeEdges(levels: CollegeLevels) {
  return {
    production: 1 + 0.06 * levels.drillSchool,
    speed: 1 + 0.05 * levels.logistics,
    attack: 1 + 0.05 * levels.gunnery,
    capacity: 1 + 0.08 * levels.fortifications,
    shield: 5 * levels.fortifications,
  };
}

/** You may only retreat once you have beaten a region with at least this many stars. */
export const RETREAT_MIN_STARS = 3;

/** Whether this war has gone far enough to retreat for Honor. */
export function canRetreat(state: ConquestState): boolean {
  return state.held.some((id) => naturalStars(state.seed, id) >= RETREAT_MIN_STARS);
}

/**
 * Honor a Tactical Retreat pays: every region you hold counts, and harder ones count far
 * more (the square of its stars plus Threat), so pushing deeper always beats retreating
 * early. A handful of easy regions pays almost nothing.
 */
export function honorFor(state: ConquestState): number {
  if (!canRetreat(state)) return 0;
  let points = 0;
  for (const id of state.held) {
    const hard = naturalStars(state.seed, id) + regionThreat(state.seed, id);
    points += (hard * hard) / 9;
  }
  return Math.floor(points);
}

/** Insignia by how many Tactical Retreats you have made: a rank that only goes up. */
const INSIGNIA = ['LIEUTENANT', 'CAPTAIN', 'MAJOR', 'COLONEL', 'BRIGADIER', 'FIELD MARSHAL'];

export function insignia(retreats: number): string {
  const top = INSIGNIA.length - 1;
  if (retreats <= top) return INSIGNIA[retreats]!;
  return `${INSIGNIA[top]} ${'★'.repeat(Math.min(5, retreats - top))}`;
}
