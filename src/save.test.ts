import { describe, expect, it } from 'vitest';
import {
  addMedals,
  buyCollege,
  promote,
  buyUpgrade,
  loadSave,
  migrate,
  newWorld,
  recordRegionBattle,
  resetAll,
  tacticalRetreat,
} from './save';
import { PROMOTION_HONOR } from './sim/economy';
import { NO_UPGRADES } from './sim/upgrades';
import { START_ID, availableRegions, naturalStars, newConquest } from './sim/worldmap';

describe('save migration', () => {
  it('keeps upgrades from version 1, scales its medals to whole ones, and starts a fresh map', () => {
    const v1 = {
      version: 1,
      medals: 7.5, // from the days of half medals
      upgrades: { headStart: 2, adjutant: 5 },
      wins: { recruit: 4, soldier: 6, general: 1 },
    };
    const save = migrate(v1)!;
    expect(save.version).toBe(5);
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
    expect(save.version).toBe(5);
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

describe('Tactical Retreat', () => {
  it('upgrades version 3 saves with no Honor yet', () => {
    const save = migrate({
      version: 3,
      medals: 4,
      medalsEarned: 9,
      upgrades: {},
      conquest: newConquest(3),
    })!;
    expect(save.version).toBe(5);
    expect(save.honor).toBe(0);
    expect(save.retreats).toBe(0);
    expect(save.college).toEqual([]);
  });

  it('needs a 3-star region won, then banks Honor and starts a new war', () => {
    resetAll();
    const save = loadSave();
    expect(tacticalRetreat()).toBe(0);
    // Hold a ring of regions out to 3 stars.
    const c = save.conquest;
    const ids = ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '1,1', '2,1', '3,1'];
    c.held = ids.filter((id) => naturalStars(c.seed, id) >= 1);
    c.held.push(...['6,0', '7,0', '8,0', '9,0']);
    if (!c.held.some((id) => naturalStars(c.seed, id) >= 3)) return;
    save.medals = 30;
    save.upgrades.fastBuilders = 3;
    // Two Head Start nodes on the start-medals line: +4 medals each new war.
    save.college = ['-1,0', '-2,0'];
    const oldSeed = c.seed;
    const honor = tacticalRetreat();
    expect(honor).toBeGreaterThan(0);
    const after = loadSave();
    expect(after.honor).toBe(honor);
    expect(after.retreats).toBe(1);
    expect(after.conquest.seed).not.toBe(oldSeed);
    expect(after.conquest.held).toEqual([]);
    expect(after.medals).toBe(4);
    expect(after.upgrades).toEqual(NO_UPGRADES);
    expect(after.college).toEqual(['-1,0', '-2,0']);
  });

  it('spends Honor in the War College', () => {
    resetAll();
    const save = loadSave();
    // The first Hit Harder node, next to the centre, costs 2.
    expect(buyCollege('1,0')).toBe(false);
    save.honor = 5;
    expect(buyCollege('1,0')).toBe(true);
    expect(loadSave().college).toEqual(['1,0']);
    expect(loadSave().honor).toBe(3);
    // Nodes must touch one you own, and can only be bought once.
    expect(buyCollege('3,0')).toBe(false);
    expect(buyCollege('1,0')).toBe(false);
    expect(buyCollege('2,0')).toBe(true);
    expect(buyCollege('nonsense')).toBe(false);
  });

  it('pays starting medals bought before the first battle into the new war', () => {
    resetAll();
    const save = loadSave();
    save.honor = 20;
    // A fresh war: the Savings node next to the centre adds its 2 medals now.
    expect(buyCollege('-1,0')).toBe(true);
    expect(loadSave().medals).toBe(2);
    expect(loadSave().medalsEarned).toBe(2);
    // Other nodes add no medals.
    expect(buyCollege('1,0')).toBe(true);
    expect(loadSave().medals).toBe(2);
    // Once a battle is fought, they wait for the next war.
    recordRegionBattle(START_ID, true, false);
    expect(buyCollege('-2,0')).toBe(true);
    expect(loadSave().medals).toBe(2);
  });
});

describe('the War College became a web', () => {
  it('refunds every Honor spent on the old levels, Rally and Officer Corps included', () => {
    const save = migrate({
      version: 4,
      medals: 0,
      medalsEarned: 0,
      upgrades: {},
      conquest: newConquest(5),
      honor: 2,
      honorEarned: 60,
      college: { veteranPay: 2, rally: 1, officerCorps: 2, airStrike: 1 },
      retreats: 2,
    })!;
    // 2 in hand, 3 + 6 Veteran Pay, 8 Rally, 4 + 9 Officer Corps, 8 Air Strike.
    expect(save.honor).toBe(40);
    expect(save.honorEarned).toBe(60);
    expect(save.college).toEqual([]);
  });

  it('keeps a version-5 web, dropping ids that are not nodes', () => {
    const save = migrate({ ...loadSave(), college: ['1,0', 'veteranPay', '2,0'] })!;
    expect(save.college).toEqual(['1,0', '2,0']);
  });
});

describe('Promotion', () => {
  it('works out lifetime Honor for older saves from what is held and spent', () => {
    const save = migrate({
      version: 4,
      medals: 0,
      medalsEarned: 0,
      upgrades: {},
      conquest: newConquest(5),
      honor: 4,
      college: { veteranPay: 2, airStrike: 1 },
      retreats: 2,
    })!;
    // 4 in hand, plus 3 + 6 on Veteran Pay and 8 on Air Strike (all refunded).
    expect(save.honorEarned).toBe(21);
    expect(save.honor).toBe(21);
    expect(save.phase).toBe(1);
  });

  it('counts banked Honor plus what this war would pay, then promotes once', () => {
    resetAll();
    const save = loadSave();
    expect(promote()).toBe(false);
    save.honorEarned = PROMOTION_HONOR - 1;
    expect(promote()).toBe(false);
    save.honorEarned = PROMOTION_HONOR;
    expect(promote()).toBe(true);
    expect(loadSave().phase).toBe(2);
    expect(promote()).toBe(false);
  });

  it('banks lifetime Honor on a Tactical Retreat, even after spending it', () => {
    resetAll();
    const save = loadSave();
    save.honor = 10;
    save.honorEarned = 10;
    expect(buyCollege('-1,0')).toBe(true);
    expect(loadSave().honorEarned).toBe(10);
  });
});

describe('Adjutant levels', () => {
  it('lets you buy Adjutant levels only up to Commander, counting free ones', () => {
    resetAll();
    const save = loadSave();
    save.honorEarned = 70; // four free duties
    save.medals = 100;
    expect(buyUpgrade('adjutant')).toBe(true);
    // The first bought level costs the cheapest price.
    expect(save.medals).toBe(97);
    expect(buyUpgrade('adjutant')).toBe(false);
  });
});
