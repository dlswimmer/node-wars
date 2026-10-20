import type { LevelDef } from './types';

export const LEVELS: LevelDef[] = [
  {
    id: 'boot-camp',
    name: 'Boot Camp',
    width: 1280,
    height: 720,
    bases: [
      { kind: 'hq', x: 140, y: 360, owner: 'player', troops: 20 },
      { kind: 'hq', x: 1140, y: 360, owner: 'enemy', troops: 20 },

      { kind: 'outpost', x: 330, y: 170, owner: 'neutral', troops: 6 },
      { kind: 'outpost', x: 330, y: 550, owner: 'neutral', troops: 6 },
      { kind: 'outpost', x: 950, y: 170, owner: 'neutral', troops: 6 },
      { kind: 'outpost', x: 950, y: 550, owner: 'neutral', troops: 6 },

      { kind: 'barracks', x: 480, y: 360, owner: 'neutral', troops: 12 },
      { kind: 'barracks', x: 800, y: 360, owner: 'neutral', troops: 12 },

      { kind: 'factory', x: 640, y: 110, owner: 'neutral', troops: 18 },
      { kind: 'radar', x: 640, y: 610, owner: 'neutral', troops: 18 },
      { kind: 'armory', x: 640, y: 360, owner: 'neutral', troops: 25 },
    ],
  },
];
