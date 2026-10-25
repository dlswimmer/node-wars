import { ABILITIES } from './abilities';
import type { CollegeEffects } from './collegeweb';
import { ADJUTANT_LEVELS, adjutantLevel, upgradeOptions, type UpgradeLevels } from './upgrades';

/**
 * The player's full numbers for the Stats page: what the Command Tent (this war) and the War
 * College (for good) each give, and what they add up to in battle. Percent edges multiply,
 * the same way campaignWorldOptions stacks them.
 */

export interface StatRow {
  label: string;
  /** From the Command Tent, the War College, and together; '-' when nothing. */
  tent: string;
  college: string;
  total: string;
  /** A word answer (the Adjutant's duty, abilities) that spans the value columns. */
  wide?: boolean;
}

export const NONE = '-';
const percent = (mult: number) => (mult === 1 ? NONE : `+${Math.round((mult - 1) * 100)}%`);
const plus = (n: number, unit = '') => (n === 0 ? NONE : `+${n}${unit}`);

/** Every stat row, from this war's upgrades, the War College, and Honor earned. */
export function playerStats(
  levels: UpgradeLevels,
  college: CollegeEffects,
  honorEarned: number,
): StatRow[] {
  const up = upgradeOptions(levels, 0);
  const b = up.boosts!.player!;
  const mult = (label: string, tent: number, edge: number): StatRow => ({
    label,
    tent: percent(tent),
    college: percent(edge),
    total: percent(tent * edge),
  });
  const add = (label: string, tent: number, edge: number, unit = ''): StatRow => ({
    label,
    tent: plus(tent, unit),
    college: plus(edge, unit),
    total: plus(tent + edge, unit),
  });
  const tentOnly = (label: string, total: string): StatRow => ({
    label,
    tent: total,
    college: NONE,
    total,
  });
  const adjutant = adjutantLevel(levels.adjutant, honorEarned);
  const duty = adjutant > 0 ? ADJUTANT_LEVELS[adjutant - 1]!.split(':')[0]! : NONE;
  return [
    mult('Troop building', up.handicap!.player!, college.production),
    mult('Troop speed', b.speed!, college.speed),
    mult('Hit strength', b.attack!, college.attack),
    mult('Base size', b.capacity!, college.capacity),
    add('Opening shield', up.shield!.player!, college.shield, ' s'),
    tentOnly('HQ size', plus(b.hqCapacity!, ' troops')),
    tentOnly('HQ start troops', plus(up.startTroops!.player!)),
    tentOnly('Troops in captured bases', plus(b.captureTroops!)),
    tentOnly('Tank worth', plus(b.tankPower!, ' troops')),
    tentOnly('Jet speed', percent(b.jetSpeed!)),
    tentOnly('Hospitals save', percent(1 + b.recovery!)),
    {
      label: 'Medals per win',
      tent: NONE,
      college: percent(college.medals),
      total: percent(college.medals),
    },
    {
      label: 'Starting medals each war',
      tent: NONE,
      college: plus(college.startMedals),
      total: plus(college.startMedals),
    },
    {
      label: 'Adjutant',
      tent: NONE,
      college: NONE,
      total: duty === NONE ? NONE : `${duty} (level ${adjutant})`,
      wide: true,
    },
    {
      label: 'Abilities',
      tent: NONE,
      college: NONE,
      total: college.abilities.map((id) => ABILITIES[id].name).join(', ') || NONE,
      wide: true,
    },
  ];
}
