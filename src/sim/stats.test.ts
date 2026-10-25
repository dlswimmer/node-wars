import { describe, expect, it } from 'vitest';
import { NO_COLLEGE_EFFECTS, collegeEffects } from './collegeweb';
import { playerStats } from './stats';
import { NO_UPGRADES } from './upgrades';

const row = (rows: ReturnType<typeof playerStats>, label: string) =>
  rows.find((r) => r.label === label)!;

describe('the Stats page', () => {
  it('shows nothing extra for a brand-new player', () => {
    const rows = playerStats(NO_UPGRADES, NO_COLLEGE_EFFECTS, 0);
    for (const r of rows) expect(r.total).toBe('-');
  });

  it('multiplies Command Tent and War College edges, the way battles do', () => {
    // Sharpshooters 2 (+10%) and two Hit Harder nodes (+6%): 1.10 x 1.06 = +17%.
    const college = collegeEffects(['1,0', '2,0', '-1,1']);
    const rows = playerStats({ ...NO_UPGRADES, sharpshooters: 2, strongShield: 1 }, college, 30);
    expect(row(rows, 'Hit strength')).toEqual({
      label: 'Hit strength',
      tent: '+10%',
      college: '+6%',
      total: '+17%',
    });
    // Shields add up: 5 s from the Tent, 2 s from a Stronger Bases node.
    expect(row(rows, 'Opening shield').total).toBe('+7 s');
    // 30 Honor earned: two free Adjutant duties.
    expect(row(rows, 'Adjutant').total).toBe('QUARTERMASTER (level 2)');
  });

  it('lists the abilities you own', () => {
    const rows = playerStats(NO_UPGRADES, collegeEffects(['1,0', '2,0', '3,0']), 0);
    expect(row(rows, 'Abilities').total).toBe('AIR STRIKE');
  });
});
