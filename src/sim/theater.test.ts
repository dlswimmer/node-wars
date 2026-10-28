import { describe, expect, it } from 'vitest';
import {
  THEATER_ZONES,
  buyUpgrade,
  newTheater,
  pushStrength,
  pushTargets,
  updateTheater,
  type TheaterState,
} from './theater';

const SEED = 4242;
const homeOf = (s: TheaterState, side: 'player' | 'enemy') =>
  Object.values(s.zones).find((z) => z.home && z.owner === side)!;
/** Run the front for this many seconds. */
const run = (s: TheaterState, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) updateTheater(s, 0.1);
};

describe('the real-time Theater', () => {
  it('starts with your home west, theirs east, full and fortified', () => {
    const s = newTheater(SEED);
    expect(Object.keys(s.zones)).toHaveLength(THEATER_ZONES);
    const home = homeOf(s, 'player');
    expect(home.centre.x).toBeLessThan(homeOf(s, 'enemy').centre.x);
    expect(home.share.player).toBe(1);
    expect(home.levels.fortify).toBe(1);
  });

  it('pushes into every neighbour on its own, filling them with your colour', () => {
    const s = newTheater(SEED);
    s.enemyThink = Infinity;
    const home = homeOf(s, 'player');
    expect(pushTargets(s, home)).toEqual(home.neighbours);
    run(s, 4);
    for (const n of home.neighbours) {
      expect(s.zones[n]!.share.player).toBeGreaterThan(0);
      expect(s.zones[n]!.share.player).toBeLessThan(1);
    }
    run(s, 150);
    expect(home.neighbours.every((n) => s.zones[n]!.owner === 'player')).toBe(true);
    expect(s.log.join(' ')).toContain('You captured');
  });

  it('splits a zone’s push between its neighbours; barracks make it stronger', () => {
    const s = newTheater(SEED);
    const home = homeOf(s, 'player');
    run(s, 0.1);
    const push = s.pushes.find((p) => p.from === home.id)!;
    const spread = pushStrength(s, push);
    home.levels.build = 2;
    expect(pushStrength(s, push)).toBeGreaterThan(spread);
  });

  it('wears away the other side before claiming, and forts slow pushes in', () => {
    const s = newTheater(SEED);
    s.enemyThink = Infinity;
    const home = homeOf(s, 'player');
    const to = s.zones[home.neighbours[0]!]!;
    Object.assign(to, { owner: 'enemy', share: { player: 0, enemy: 1 } });
    run(s, 0.1);
    const push = s.pushes.find((p) => p.side === 'player' && p.to === to.id)!;
    const plain = pushStrength(s, push);
    to.levels.fortify = 2;
    expect(pushStrength(s, push)).toBeLessThan(plain);
    expect(to.share.enemy).toBeLessThan(1);
    expect(to.share.player).toBe(0);
  });

  it('spends supply on upgrades for zones you own', () => {
    const s = newTheater(SEED);
    const home = homeOf(s, 'player');
    expect(buyUpgrade(s, 'player', home.id, 'build')).toBe(false);
    s.supply.player = 100;
    expect(buyUpgrade(s, 'player', home.id, 'build')).toBe(true);
    expect(home.levels.build).toBe(1);
    expect(buyUpgrade(s, 'player', homeOf(s, 'enemy').id, 'build')).toBe(false);
  });

  it('plays itself out to a winner, and upgrades decide it', () => {
    const idle = newTheater(SEED);
    run(idle, 900);
    expect(idle.winner).not.toBeNull();
    // A player who keeps building up the front beats the enemy.
    const busy = newTheater(SEED);
    for (let t = 0; t < 900 && !busy.winner; t += 1) {
      const front = Object.values(busy.zones).filter(
        (z) => z.owner === 'player' && pushTargets(busy, z).length > 0,
      );
      for (const z of front) {
        if (!buyUpgrade(busy, 'player', z.id, 'build')) buyUpgrade(busy, 'player', z.id, 'enhance');
      }
      run(busy, 1);
    }
    expect(busy.winner).toBe('player');
  }, 30_000);
});
