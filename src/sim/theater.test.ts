import { describe, expect, it } from 'vitest';
import {
  HOME_GROWTH,
  THEATER_ZONES,
  ZONE_GROWTH,
  applyAttack,
  attackSize,
  autoBattle,
  battleLevel,
  commit,
  enemyOrder,
  newTheater,
  nextRound,
  targetsFrom,
  theaterRank,
} from './theater';

const SEED = 4242;
const homeOf = (s: ReturnType<typeof newTheater>, side: 'player' | 'enemy') =>
  Object.values(s.zones).find((z) => z.home && z.owner === side)!;

describe('the Theater', () => {
  it('starts with your home west, theirs east, and neutral zones between', () => {
    const s = newTheater(SEED);
    const zones = Object.values(s.zones);
    expect(zones).toHaveLength(THEATER_ZONES);
    expect(homeOf(s, 'player').centre.x).toBeLessThan(homeOf(s, 'enemy').centre.x);
    expect(zones.filter((z) => z.owner === 'neutral')).toHaveLength(THEATER_ZONES - 2);
    // Neighbours point both ways.
    for (const z of zones)
      for (const n of z.neighbours) expect(s.zones[n]!.neighbours).toContain(z.id);
  });

  it('attacks from a zone into its neighbours, sending part of the garrison', () => {
    const s = newTheater(SEED);
    const home = homeOf(s, 'player');
    const targets = targetsFrom(s, home.id);
    expect(targets.length).toBeGreaterThan(0);
    expect(attackSize(home)).toBe(24);
  });

  it('puts both sides on the zone’s battle map, and a big army wins it', () => {
    const s = newTheater(SEED);
    const home = homeOf(s, 'player');
    const to = targetsFrom(s, home.id)[0]!;
    const level = battleLevel(s, to, 60, 8);
    const hqs = level.bases.filter((b) => b.kind === 'hq');
    expect(hqs.find((b) => b.owner === 'player')!.troops).toBe(60);
    expect(hqs.find((b) => b.owner === 'enemy')!.troops).toBe(8);
    const r = autoBattle(level, theaterRank(s, 'neutral'), 1);
    expect(r.won).toBe(true);
    const order = { from: home.id, to, troops: 24, auto: true };
    commit(s, order);
    applyAttack(s, order, r);
    expect(s.zones[to]!.owner).toBe('player');
    expect(s.zones[to]!.troops).toBeLessThanOrEqual(24);
    expect(s.log.at(-1)).toContain('You took');
  }, 30_000);

  it('grows garrisons each round, and the enemy picks an attack', () => {
    const s = newTheater(SEED);
    const home = homeOf(s, 'enemy');
    nextRound(s);
    expect(home.troops).toBe(40 + HOME_GROWTH);
    expect(s.round).toBe(2);
    expect(enemyOrder(s)?.from).toBe(home.id);
    expect(ZONE_GROWTH).toBeLessThan(HOME_GROWTH);
  });

  it('ends when a home falls', () => {
    const s = newTheater(SEED);
    const enemyHome = homeOf(s, 'enemy');
    const order = { from: homeOf(s, 'player').id, to: enemyHome.id, troops: 30, auto: true };
    applyAttack(s, order, { won: true, survivors: 20, enemyLeft: 0 });
    expect(s.winner).toBe('player');
  });
});
