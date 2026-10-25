import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from './difficulty';
import { COLLEGE, NO_COLLEGE, canRetreat, honorFor, insignia, medalBonus } from './college';
import { HONOR_COSTS } from './economy';
import { NO_UPGRADES, campaignWorldOptions, medalsFor } from './upgrades';
import { START_ID, naturalStars, newConquest, regionThreat } from './worldmap';

const SEED = 4242;
/** Regions on a big patch of the grid, sorted from easiest to hardest. */
const regions = (() => {
  const ids: string[] = [];
  for (let i = -14; i <= 14; i++) for (let j = -14; j <= 14; j++) ids.push(`${i},${j}`);
  const hard = (id: string) => naturalStars(SEED, id) + regionThreat(SEED, id);
  return ids.sort((a, b) => hard(a) - hard(b));
})();

const holding = (ids: string[]) => ({ ...newConquest(SEED), held: [START_ID, ...ids] });

describe('Threat', () => {
  it('is zero near the start and keeps climbing further out', () => {
    expect(regionThreat(SEED, START_ID)).toBe(0);
    expect(regionThreat(SEED, '1,0')).toBe(0);
    const far = Math.max(...regions.map((id) => regionThreat(SEED, id)));
    expect(far).toBeGreaterThanOrEqual(4);
  });

  it('gives the enemy more upgrades, and pays more medals', () => {
    const calm = campaignWorldOptions(DIFFICULTIES.marshal, 1, NO_UPGRADES, 0);
    const scary = campaignWorldOptions(DIFFICULTIES.marshal, 1, NO_UPGRADES, 3);
    expect(scary.handicap!.enemy!).toBeCloseTo(calm.handicap!.enemy! * 1.3);
    expect(scary.boosts!.enemy!.attack).toBeCloseTo(1.18);
    expect(scary.startTroops!.enemy).toBe(18);
    expect(medalsFor(5, true, false, 3)).toBe(8);
  });
});

describe('Tactical Retreat and Honor', () => {
  it('needs a 3-star region before a retreat pays anything', () => {
    const easy = regions.filter((id) => naturalStars(SEED, id) <= 2).slice(0, 8);
    expect(canRetreat(holding(easy))).toBe(false);
    expect(honorFor(holding(easy))).toBe(0);
  });

  it('pays far more for pushing deep than for many easy regions', () => {
    const mid = regions.filter((id) => naturalStars(SEED, id) === 3).slice(0, 10);
    const deep = regions.filter((id) => regionThreat(SEED, id) >= 2).slice(0, 10);
    const shallow = honorFor(holding(mid));
    expect(shallow).toBeGreaterThan(0);
    // The same number of regions, but harder ones, pays several times as much.
    expect(honorFor(holding(deep))).toBeGreaterThan(shallow * 3);
  });

  it('buys lasting edges and better pay in the War College', () => {
    expect(medalBonus({ ...NO_COLLEGE, veteranPay: 2 })).toBe(1.5);
    expect(medalsFor(4, true, false, 0, 1.5)).toBe(6);
    const trained = campaignWorldOptions(DIFFICULTIES.soldier, 1, NO_UPGRADES, 0, {
      ...NO_COLLEGE,
      drillSchool: 2,
      gunnery: 1,
    });
    expect(trained.handicap!.player!).toBeCloseTo(1.12);
    expect(trained.boosts!.player!.attack).toBeCloseTo(1.05);
    for (const c of COLLEGE) expect(c.costs).toEqual(HONOR_COSTS[c.id]);
  });

  it('raises your insignia with every retreat', () => {
    expect(insignia(0)).toBe('LIEUTENANT');
    expect(insignia(1)).toBe('CAPTAIN');
    expect(insignia(7)).toBe('FIELD MARSHAL ★★');
  });
});
