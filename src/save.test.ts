import { describe, expect, it } from 'vitest';
import { migrate } from './save';
import { NO_UPGRADES } from './sim/upgrades';
import { START_ID, availableRegions } from './sim/worldmap';

describe('save migration', () => {
  it('keeps medals and upgrades from version 1 and starts a fresh conquest map', () => {
    const v1 = {
      version: 1,
      medals: 7.5,
      upgrades: { headStart: 2, adjutant: 5 },
      wins: { recruit: 4, soldier: 6, general: 1 },
    };
    const save = migrate(v1)!;
    expect(save.version).toBe(2);
    expect(save.medals).toBe(7.5);
    expect(save.upgrades).toEqual({ ...NO_UPGRADES, headStart: 2, adjutant: 5 });
    expect(save.conquest.held).toEqual([]);
    expect(availableRegions(save.conquest)).toEqual([START_ID]);
    // Rank wins count toward mastering the matching star levels.
    expect(save.conquest.starWins[1]).toBe(4);
    expect(save.conquest.starWins[3]).toBe(6);
    expect(save.conquest.starWins[4]).toBe(1);
  });

  it('loads version 2 as it was, and rejects junk', () => {
    const v2 = migrate(migrate({ version: 1, medals: 2, upgrades: {}, wins: {} }))!;
    expect(migrate(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
    expect(migrate(null)).toBeNull();
    expect(migrate({ version: 9 })).toBeNull();
  });
});
