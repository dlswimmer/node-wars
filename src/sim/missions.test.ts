import { describe, expect, it } from 'vitest';
import {
  missionComplete,
  missionStatus,
  regionMission,
  startMission,
  trackMission,
} from './missions';
import type { LevelDef } from './types';
import { createWorld } from './world';
import { regionLevel } from './worldmap';

const level = (): LevelDef => ({
  id: 'm',
  name: 'M',
  width: 800,
  height: 400,
  bases: [
    { kind: 'hq', x: 100, y: 200, owner: 'player', troops: 20 },
    { kind: 'hq', x: 700, y: 200, owner: 'enemy', troops: 20 },
    { kind: 'radar', x: 300, y: 100, owner: 'neutral', troops: 5 },
    { kind: 'radar', x: 500, y: 300, owner: 'neutral', troops: 5 },
    { kind: 'outpost', x: 600, y: 100, owner: 'neutral', troops: 5 },
    { kind: 'outpost', x: 600, y: 300, owner: 'neutral', troops: 5 },
  ],
});

describe('region missions', () => {
  it('are fixed for a region and missing for the tutorial', () => {
    const l = regionLevel(7, '1,0');
    expect(regionMission(7, '1,0', l, 2, false)).toEqual(regionMission(7, '1,0', l, 2, false));
    expect(regionMission(7, '0,0', l, 1, true)).toBeNull();
  });

  it('vary across regions', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++)
      kinds.add(regionMission(seed, `${seed},1`, level(), 3, false)!.kind);
    expect([...kinds].sort()).toEqual(['blitz', 'capture', 'expand', 'untouchable']);
  });

  it('name the bases to capture by how many there are', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = regionMission(seed, 'x', level(), 2, false)!;
      if (m.kind === 'capture') expect(m.text).toBe('Capture both Radars');
    }
  });

  it('ask you to hold most of the map at once', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = regionMission(seed, 'y', level(), 2, false)!;
      if (m.kind === 'expand') expect(m.text).toBe('Hold 4 bases at once');
    }
    const world = createWorld(level());
    const expand = startMission({ kind: 'expand', text: '', hold: 3, medals: 1 });
    world.bases[2]!.owner = 'player';
    trackMission(expand, world);
    expect(missionStatus(expand, world)).toBe('2 of 3');
    world.bases[3]!.owner = 'player';
    trackMission(expand, world);
    expect(missionComplete(expand, world, true)).toBe(true);
  });

  it('track capturing them all, losing a base, and the clock', () => {
    const world = createWorld(level());
    const capture = startMission({ kind: 'capture', text: '', baseKind: 'radar', medals: 1 });
    world.bases[2]!.owner = 'player';
    trackMission(capture, world);
    expect(missionComplete(capture, world, true)).toBe(false);
    world.bases[3]!.owner = 'player';
    trackMission(capture, world);
    // Holding them all once counts, even if one is lost again later.
    world.bases[3]!.owner = 'enemy';
    trackMission(capture, world);
    expect(missionComplete(capture, world, true)).toBe(true);
    expect(missionComplete(capture, world, false)).toBe(false);

    const careful = startMission({ kind: 'untouchable', text: '', medals: 1 });
    world.events = [{ type: 'capture', baseId: 0, from: 'player', to: 'enemy' }];
    trackMission(careful, world);
    expect(missionComplete(careful, world, true)).toBe(false);

    const blitz = startMission({ kind: 'blitz', text: '', seconds: 240, medals: 1 });
    world.time = 151;
    expect(missionStatus(blitz, world)).toBe('1:29 left');
    expect(missionComplete(blitz, world, true)).toBe(true);
    world.time = 241;
    expect(missionComplete(blitz, world, true)).toBe(false);
  });
});
