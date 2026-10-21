import { describe, expect, it } from 'vitest';
import {
  addMedals,
  buyUpgrade,
  loadSave,
  migrate,
  newWorld,
  recordRegionBattle,
  resetAll,
} from './save';
import { NO_UPGRADES } from './sim/upgrades';
import { START_ID, availableRegions, newConquest } from './sim/worldmap';

describe('save migration', () => {
  it('keeps upgrades from version 1, scales its medals to whole ones, and starts a fresh map', () => {
    const v1 = {
      version: 1,
      medals: 7.5, // from the days of half medals
      upgrades: { headStart: 2, adjutant: 5 },
      wins: { recruit: 4, soldier: 6, general: 1 },
    };
    const save = migrate(v1)!;
    expect(save.version).toBe(3);
    expect(save.medals).toBe(23); // 7.5 x 3, rounded
    expect(save.medalsEarned).toBe(23);
    expect(save.upgrades).toEqual({ ...NO_UPGRADES, headStart: 2, adjutant: 5 });
    expect(save.conquest.held).toEqual([]);
    expect(availableRegions(save.conquest)).toEqual([START_ID]);
    // Rank wins count toward mastering the matching star levels.
    expect(save.conquest.starWins[1]).toBe(4);
    expect(save.conquest.starWins[3]).toBe(6);
    expect(save.conquest.starWins[4]).toBe(1);
  });

  it('scales version 2 medals and keeps its map', () => {
    const conquest = newConquest(55);
    conquest.held.push(START_ID);
    const save = migrate({ version: 2, medals: 2.5, medalsEarned: 10.75, upgrades: {}, conquest })!;
    expect(save.version).toBe(3);
    expect(save.medals).toBe(8);
    expect(save.medalsEarned).toBe(32);
    expect(save.conquest).toEqual(conquest);
    // Early version-2 saves had no lifetime count.
    expect(migrate({ version: 2, medals: 3, upgrades: {}, conquest })!.medalsEarned).toBe(9);
  });

  it('loads version 3 as it was, and rejects junk', () => {
    const v3 = migrate({ version: 1, medals: 2, upgrades: {}, wins: {} })!;
    expect(migrate(JSON.parse(JSON.stringify(v3)))).toEqual(v3);
    expect(migrate(null)).toBeNull();
    expect(migrate({ version: 9 })).toBeNull();
  });
});

describe('resets', () => {
  it('a new world keeps medals and upgrades but changes the map', () => {
    resetAll();
    addMedals(6);
    expect(buyUpgrade('headStart')).toBe(true);
    recordRegionBattle(START_ID, true, false);
    const before = loadSave();
    const seed = before.conquest.seed;
    newWorld();
    const after = loadSave();
    expect(after.conquest.seed).not.toBe(seed);
    expect(after.conquest.held).toEqual([]);
    expect(availableRegions(after.conquest)).toEqual([START_ID]);
    expect(after.medals).toBe(3); // 6 earned, 3 spent on Head Start
    expect(after.medalsEarned).toBe(6);
    expect(after.upgrades.headStart).toBe(1);
  });

  it('resetting everything gives a fresh save', () => {
    addMedals(4);
    resetAll();
    const save = loadSave();
    expect(save.medals).toBe(0);
    expect(save.medalsEarned).toBe(0);
    expect(save.upgrades).toEqual(NO_UPGRADES);
    expect(save.conquest.held).toEqual([]);
  });
});
