import { createRng } from './rng';
import { addScenery, fitsWithTwin, regionOutline } from './scenery';
import { NO_TERRAIN, RANDOM_TERRAIN, addTerrain, type TerrainOptions } from './terrain';
import type { BaseDef, BaseKind, Faction, LevelDef, Point } from './types';

/**
 * Random skirmish maps. Bases are placed on the player's half and then point-mirrored
 * through the centre, so the enemy gets exactly the same map turned around: fair without
 * balancing each map by hand.
 */

export const MAP_HEIGHT = 720;
export const MIN_WIDTH = 1180;
export const MAX_WIDTH = 1400;
/** No two base centres closer than this (world units); keeps swarms and labels readable. */
export const MIN_SPACING = 150;
export const MIN_BASES = 8;
export const MAX_BASES = 14;
/** Map numbers shown to players run 1..MAX_MAP_SEED. */
export const MAX_MAP_SEED = 99999;

const HQ_TROOPS = 20;
/** Bases stay inside these margins so labels and the HUD have room. */
const EDGE_X = 110;
const EDGE_Y = 100;
/** Share of the map's width and height kept empty in each corner, where the HUD sits. */
const CORNER_X = 0.22;
const CORNER_Y = 0.3;
const SPECIALS: BaseKind[] = ['factory', 'radar', 'armory'];
/** Neutral garrisons: a few troops near an HQ, more towards the middle, more for specials. */
const NEAR_TROOPS = 5;
const FAR_TROOPS = 19;
const KIND_TROOPS: Partial<Record<BaseKind, number>> = {
  barracks: 2,
  factory: 6,
  radar: 6,
  armory: 6,
  // A Bunker's defenders count double, so it starts with fewer of them.
  bunker: -6,
  hospital: 2,
  airfield: 4,
  // It builds nothing, so it is cheap to take; it is worth having only for where it stands.
  checkpoint: -10,
};
/** Chance a (not small) map gets a pair of Bunkers, and of Field Hospitals. */
const BUNKER_CHANCE = 0.45;
const HOSPITAL_CHANCE = 0.4;
/** Chance a (not small) map gets a pair of Airfields, and of Checkpoints. */
const AIRFIELD_CHANCE = 0.4;
const CHECKPOINT_CHANCE = 0.55;
/** No neutral base starts with fewer troops than this. */
const MIN_TROOPS = 4;

const OPERATIONS = [
  'Thunder',
  'Iron Fist',
  'Desert Fox',
  'Tin Soldier',
  'Night Owl',
  'Red Comet',
  'Steel Rain',
  'Lightning',
  'Grizzly',
  'Rolling Stone',
  'Polar Bear',
  'Hammerhead',
  'Wildfire',
  'Sky Hook',
  'Mudslide',
  'Avalanche',
  'Copperhead',
  'Big Cheese',
  'Snowball',
  'Jackrabbit',
];

/** A fresh map number for a new battle (uses Math.random; the map itself is seeded). */
export function randomMapSeed(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * MAX_MAP_SEED);
}

export function mapName(seed: number): string {
  return `Operation ${OPERATIONS[seed % OPERATIONS.length]}`;
}

/** The same seed always gives the same map, so a map number can be played again. */
export function generateLevel(seed: number): LevelDef {
  return addTerrain(addScenery(layoutLevel(seed, false), seed), seed, RANDOM_TERRAIN);
}

/** Battlefield area of a conquest region (about a random map's), and of the tutorial one. */
export const REGION_AREA = 700_000;
export const SMALL_REGION_AREA = 480_000;

/** Where bases may go on a region's map: its size, and which spots fit with their twins. */
interface Field {
  width: number;
  height: number;
  fits: (x: number, y: number) => boolean;
}

/**
 * A battle for a conquest-map region. The outline is the region's exact shape from the world
 * map, only scaled and moved. Bases still come in mirrored pairs through the shape's centre
 * (so both sides get the same map), placed only where a base and its twin both fit inside.
 * The two HQs face each other along the region's long way, yours at the west/south end.
 * A small map has few bases, for the tutorial region. Terrain (rivers, mountains) comes from
 * the region's rating.
 */
export function generateRegionLevel(
  seed: number,
  shape: Point[],
  id: string,
  name: string,
  small: boolean,
  terrain: TerrainOptions = NO_TERRAIN,
): LevelDef {
  const { outline, width, height } = regionOutline(shape, small ? SMALL_REGION_AREA : REGION_AREA);
  const fits = fitsWithTwin(outline, width, height);
  // The layout runs in a frame turned to lie along the region's long way (only the bases
  // turn, never the outline), with your HQ at the west/south end.
  const [cx, cy] = [width / 2, height / 2];
  const d = playerToEnemy(outline, cx, cy);
  const n = { x: -d.y, y: d.x };
  const reach = (axis: Point) =>
    2 * Math.max(...outline.map((p) => Math.abs((p.x - cx) * axis.x + (p.y - cy) * axis.y)));
  const [fw, fh] = [reach(d), reach(n)];
  const toMap = (x: number, y: number) => ({
    x: cx + (x - fw / 2) * d.x + (y - fh / 2) * n.x,
    y: cy + (x - fw / 2) * d.y + (y - fh / 2) * n.y,
  });
  const field: Field = {
    width: fw,
    height: fh,
    fits: (x, y) => {
      const p = toMap(x, y);
      return fits(p.x, p.y);
    },
  };
  const rng = createRng(seed * 2654435761);
  for (let attempt = 0; attempt < 500; attempt++) {
    const bases = tryLayout(rng, small, field);
    if (!bases) continue;
    // Turn the bases onto the map, rounded, then rebuild each mirror twin (listed right after
    // its base) exactly through the centre.
    const list = bases.list.map((b) => {
      const p = toMap(b.x, b.y);
      return { ...b, x: Math.round(p.x), y: Math.round(p.y) };
    });
    for (let i = 0; i + 1 < list.length; i += 2) {
      list[i + 1] = { ...list[i + 1]!, x: width - list[i]!.x, y: height - list[i]!.y };
    }
    if (list.length % 2 === 1) list[list.length - 1] = { ...list[list.length - 1]!, x: cx, y: cy };
    const level = addScenery({ id, name, width, height, bases: list }, seed, outline);
    return addTerrain(level, seed, terrain, d);
  }
  throw new Error(`Could not lay out region ${id}`);
}

/**
 * Unit direction from your HQ's end of a region to the enemy's: along the shape's longest
 * spread, pointing so you start on the west or south side (left or lower on screen).
 */
function playerToEnemy(outline: Point[], cx: number, cy: number): Point {
  let [xx, yy, xy] = [0, 0, 0];
  for (const p of outline) {
    xx += (p.x - cx) ** 2;
    yy += (p.y - cy) ** 2;
    xy += (p.x - cx) * (p.y - cy);
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const d = { x: Math.cos(angle), y: Math.sin(angle) };
  // Towards the enemy means away from west (-x) and south (+y on screen).
  return d.x - d.y >= 0 ? d : { x: -d.x, y: -d.y };
}

function layoutLevel(seed: number, small: boolean): LevelDef {
  const rng = createRng(seed * 2654435761);
  for (let attempt = 0; attempt < 500; attempt++) {
    const bases = tryLayout(rng, small);
    if (bases) {
      return {
        id: `map-${seed}`,
        name: mapName(seed),
        seed,
        width: bases.width,
        height: MAP_HEIGHT,
        bases: bases.list,
      };
    }
  }
  throw new Error(`Could not lay out map ${seed}`);
}

/** Width range of a small (tutorial) map. */
const SMALL_WIDTH = [980, 1080] as const;

interface Spot {
  kind: BaseKind;
  x: number;
  y: number;
}

function tryLayout(
  rng: () => number,
  small: boolean,
  field?: Field,
): { width: number; list: BaseDef[] } | null {
  const [minWidth, maxWidth] = small ? SMALL_WIDTH : [MIN_WIDTH, MAX_WIDTH];
  const width = field
    ? field.width
    : Math.round((minWidth + rng() * (maxWidth - minWidth)) / 10) * 10;
  const height = field?.height ?? MAP_HEIGHT;
  const cx = width / 2;
  const cy = height / 2;
  const between = (a: number, b: number) => a + rng() * (b - a);
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;

  const half: Spot[] = [];
  let centre: Spot | null =
    rng() < (small ? 0 : 0.4) ? { kind: pick(SPECIALS), x: cx, y: cy } : null;
  if (field && !field.fits(cx, cy)) centre = null;

  // Distance from a point to the nearest base, counting the mirrored half and the centre.
  const clearance = (x: number, y: number) => {
    let d = Math.hypot(x - cx, y - cy) * 2; // its own mirror twin
    if (centre) d = Math.min(d, Math.hypot(x - cx, y - cy));
    for (const b of half) {
      d = Math.min(d, Math.hypot(b.x - x, b.y - y), Math.hypot(width - b.x - x, height - b.y - y));
    }
    return d;
  };
  // The left corners (and, mirrored, the right ones) stay empty for the HUD.
  const cornerX = EDGE_X + (width - 2 * EDGE_X) * CORNER_X;
  const cornerY = (height - 2 * EDGE_Y) * CORNER_Y;
  // A region's own shape decides where bases fit; a plain map keeps to its margins.
  const [left, top, bottom] = field ? [0, 0, height] : [EDGE_X, EDGE_Y, height - EDGE_Y];
  const inBounds = (x: number, y: number) =>
    field
      ? x < cx && field.fits(x, y)
      : x >= EDGE_X &&
        x < cx &&
        y >= EDGE_Y &&
        y <= height - EDGE_Y &&
        !(x < cornerX && Math.min(y - EDGE_Y, height - EDGE_Y - y) < cornerY);

  /** Try random points from `sample`; keep the most open of a few (Poisson-disk style). */
  const place = (kind: BaseKind, sample: () => [number, number], candidates = 1): boolean => {
    let best: [number, number] | null = null;
    let bestGap = 0;
    let found = 0;
    for (let i = 0; i < 80 && found < candidates; i++) {
      const [x, y] = sample();
      if (!inBounds(x, y)) continue;
      const gap = clearance(x, y);
      if (gap < MIN_SPACING) continue;
      found++;
      if (gap > bestGap) {
        best = [x, y];
        bestGap = gap;
      }
    }
    if (!best) return false;
    half.push({ kind, x: Math.round(best[0]), y: Math.round(best[1]) });
    return true;
  };

  const hq = field
    ? edgeHq(field, between(height * 0.4, height * 0.6))
    : {
        x: between(EDGE_X, 170),
        y: between(height * 0.4, height * 0.6),
      };
  if (!hq || !place('hq', () => [hq.x, hq.y])) return null;

  // A starter base close to home, so the first move is obvious.
  const nearKind: BaseKind = rng() < 0.5 ? 'barracks' : 'outpost';
  const near = () => {
    const angle = between(-1.75, 1.75);
    const r = between(MIN_SPACING + 10, 230);
    return [hq.x + Math.cos(angle) * r, hq.y + Math.sin(angle) * r] as [number, number];
  };
  if (!place(nearKind, near)) return null;

  // Specials go in the contested middle.
  const specials = SPECIALS.filter((k) => k !== centre?.kind);
  for (let i = specials.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [specials[i], specials[j]] = [specials[j]!, specials[i]!];
  }
  const specialCount = centre || small ? 1 : rng() < 0.5 ? 1 : 2;
  const middle = () => [between(width * 0.3, cx - 40), between(top, bottom)] as [number, number];
  for (const kind of specials.slice(0, specialCount)) {
    if (!place(kind, middle, 3)) return null;
  }

  // Fill the rest of the half evenly with barracks and outposts. Every side gets a Barracks:
  // maps of only slow Outposts turned into endless see-saws in bot matches.
  const perSide = small ? 3 : centre ? 4 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 4);
  const anywhere = () => [between(left, cx), between(top, bottom)] as [number, number];
  // Sometimes a Bunker on the way to the middle and a Field Hospital behind the front, in
  // place of a filler base (so maps don't get more crowded). Each tries a few spots and is
  // simply left out if none fits.
  const front = () => [between(width * 0.22, cx - 60), between(top, bottom)] as [number, number];
  const behind = () =>
    [between(width * 0.18, width * 0.4), between(top, bottom)] as [number, number];
  if (!small && rng() < BUNKER_CHANCE && half.length < perSide - 1) place('bunker', front, 4);
  if (!small && rng() < HOSPITAL_CHANCE && half.length < perSide - 1) place('hospital', behind, 4);
  if (!small && rng() < AIRFIELD_CHANCE && half.length < perSide - 1) place('airfield', behind, 4);
  // A Checkpoint comes on top of the usual bases when it fits (it builds nothing itself).
  if (!small && rng() < CHECKPOINT_CHANCE) place('checkpoint', front, 4);
  const hasBarracks = () => half.some((b) => b.kind === 'barracks');
  while (half.length < perSide || !hasBarracks()) {
    const kind = !hasBarracks() || rng() < 0.4 ? 'barracks' : 'outpost';
    if (!place(kind, anywhere, 12)) return null;
  }

  const all = [...half, ...half.map((b) => ({ ...b, x: width - b.x, y: height - b.y }))];
  if (centre) all.push(centre);
  // (A region's rounded shape already keeps bases out of the screen corners.)
  if (!field && crowdsCorner(all)) return null;

  // Garrisons grow with distance from home; computed on the player's half and copied to the
  // mirror twin so both sides match exactly.
  const reach = Math.hypot(cx - hq.x, cy - hq.y) - MIN_SPACING;
  const troopsAt = (b: Spot) => {
    const t = Math.min(1, Math.max(0, (Math.hypot(b.x - hq.x, b.y - hq.y) - MIN_SPACING) / reach));
    const troops = NEAR_TROOPS + (FAR_TROOPS - NEAR_TROOPS) * t + (KIND_TROOPS[b.kind] ?? 0);
    return Math.max(MIN_TROOPS, Math.round(troops));
  };
  // Each base is followed by its mirror twin (region maps rely on this order).
  const list: BaseDef[] = [];
  for (const b of half) {
    const isHq = b.kind === 'hq';
    const troops = isHq ? HQ_TROOPS : troopsAt(b);
    list.push({ kind: b.kind, x: b.x, y: b.y, owner: isHq ? 'player' : 'neutral', troops });
    list.push({
      kind: b.kind,
      x: width - b.x,
      y: height - b.y,
      owner: isHq ? 'enemy' : 'neutral',
      troops,
    });
  }
  if (centre) list.push({ ...centre, owner: 'neutral', troops: troopsAt(centre) });
  return { width, list };
}

/** On a region map, the HQ goes as far towards the left edge as it fits at this height. */
function edgeHq(field: Field, y: number): { x: number; y: number } | null {
  for (let x = 0; x < field.width / 2; x += 5) if (field.fits(x, y)) return { x: x + 15, y };
  return null;
}

/**
 * The camera fits the bases' bounding box, and the HUD sits in the screen corners, so keep
 * the corners of that box empty.
 */
function crowdsCorner(bases: Spot[], share = 1): boolean {
  const xs = bases.map((b) => b.x);
  const ys = bases.map((b) => b.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return bases.some((b) => {
    const nearSide = Math.min(b.x - x0, x1 - b.x) < (x1 - x0) * CORNER_X * share;
    const nearEdge = Math.min(b.y - y0, y1 - b.y) < (y1 - y0) * CORNER_Y * share;
    return nearSide && nearEdge;
  });
}

/** Size of a Free-for-All map: a little taller than a two-army one, to fit three corners. */
export const FFA_WIDTH = 1400;
export const FFA_HEIGHT = 860;
/** Share of the usual empty screen corners a Free-for-All map keeps (see crowdsCorner). */
const FFA_CORNER = 0.5;

/**
 * A three-army Free-for-All map: you start on the left, the enemy upper right and the rival
 * lower right. One army's third of the map is laid out and turned a third of the way round
 * twice (on an oval, so it fits a wide screen). The turn isn't exact on a wide map, so it is
 * close to fair but not perfectly, which is fine for a Quick Battle; bots measure how it
 * plays. No rivers or mountains yet.
 */
export function generateFreeForAll(seed: number): LevelDef {
  const rng = createRng(seed * 2246822519 + 1);
  for (let attempt = 0; attempt < 500; attempt++) {
    const bases = tryFreeForAll(rng);
    if (bases) {
      const level: LevelDef = {
        id: `ffa-${seed}`,
        name: mapName(seed),
        seed,
        width: FFA_WIDTH,
        height: FFA_HEIGHT,
        bases,
      };
      return addScenery(level, seed, undefined, false);
    }
  }
  throw new Error(`Could not lay out Free-for-All map ${seed}`);
}

function tryFreeForAll(rng: () => number): BaseDef[] | null {
  const [w, h] = [FFA_WIDTH, FFA_HEIGHT];
  const [cx, cy] = [w / 2, h / 2];
  const [ra, rb] = [cx - EDGE_X, cy - EDGE_Y];
  const between = (a: number, b: number) => a + rng() * (b - a);
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;
  /** Point at angle and radius on the oval (1 = its edge). */
  const at = (angle: number, r: number) => ({
    x: cx + Math.cos(angle) * r * ra,
    y: cy + Math.sin(angle) * r * rb,
  });
  /** The same spot in the other two armies' thirds. */
  const turned = (p: Spot, k: number): Spot => {
    const angle = Math.atan2((p.y - cy) / rb, (p.x - cx) / ra) + (k * Math.PI * 2) / 3;
    const r = Math.hypot((p.x - cx) / ra, (p.y - cy) / rb);
    const q = at(angle, r);
    return { kind: p.kind, x: Math.round(q.x), y: Math.round(q.y) };
  };

  const third: Spot[] = [];
  const centre: Spot | null = rng() < 0.5 ? { kind: pick(SPECIALS), x: cx, y: cy } : null;
  const copies = (p: Spot) => [p, turned(p, 1), turned(p, 2)];
  // Turning on an oval doesn't keep distances, so every copy is checked against every other.
  const clearance = (p: Spot) => {
    const mine = copies(p);
    const others = third.flatMap(copies);
    if (centre) others.push(centre);
    let d = Infinity;
    for (const [i, q] of mine.entries()) {
      for (const o of [...mine.slice(i + 1), ...others])
        d = Math.min(d, Math.hypot(o.x - q.x, o.y - q.y));
    }
    return d;
  };
  const inBounds = (p: Spot) =>
    copies(p).every(
      (q) => q.x >= EDGE_X && q.x <= w - EDGE_X && q.y >= EDGE_Y && q.y <= h - EDGE_Y,
    );
  /** Try random spots in this army's third; keep the most open of a few. */
  const place = (kind: BaseKind, sample: () => { x: number; y: number }, candidates = 1) => {
    let best: Spot | null = null;
    let bestGap = 0;
    let found = 0;
    for (let i = 0; i < 80 && found < candidates; i++) {
      const s = sample();
      const spot = { kind, x: Math.round(s.x), y: Math.round(s.y) };
      if (!inBounds(spot)) continue;
      const gap = clearance(spot);
      if (gap < MIN_SPACING) continue;
      found++;
      if (gap > bestGap) [best, bestGap] = [spot, gap];
    }
    if (best) third.push(best);
    return best !== null;
  };
  // This army's third of the oval: a wedge around due west.
  const wedge = (r0: number, r1: number) => () =>
    at(Math.PI + between(-Math.PI / 3, Math.PI / 3), between(r0, r1));

  const hq = at(Math.PI + between(-0.08, 0.08), between(0.9, 1));
  if (!place('hq', () => hq)) return null;
  const nearKind: BaseKind = rng() < 0.5 ? 'barracks' : 'outpost';
  const near = () => {
    const angle = between(-1.4, 1.4);
    const r = between(MIN_SPACING + 10, 220);
    return { x: hq.x + Math.cos(angle) * r, y: hq.y + Math.sin(angle) * r };
  };
  if (!place(nearKind, near)) return null;
  const special = pick(SPECIALS.filter((k) => k !== centre?.kind));
  if (!place(special, wedge(0.3, 0.6), 3)) return null;
  const perArmy = 4 + Math.floor(rng() * 2);
  const hasBarracks = () => third.some((b) => b.kind === 'barracks');
  while (third.length < perArmy || !hasBarracks()) {
    const kind = !hasBarracks() || rng() < 0.4 ? 'barracks' : 'outpost';
    if (!place(kind, wedge(0.3, 1), 12)) return null;
  }

  const owners: Faction[] = ['player', 'enemy', 'rival'];
  const all = [...owners.flatMap((_, k) => third.map((b) => turned(b, k)))];
  if (centre) all.push(centre);
  // Three armies fill the map out to its corners, so only the very corners stay empty.
  if (crowdsCorner(all, FFA_CORNER)) return null;

  // Garrisons grow from each HQ towards the middle, the same in every army's third.
  const reach = Math.hypot(cx - hq.x, cy - hq.y) - MIN_SPACING;
  const troopsAt = (b: Spot) => {
    const d = Math.hypot(b.x - hq.x, b.y - hq.y) - MIN_SPACING;
    const t = Math.min(1, Math.max(0, d / reach));
    const troops = NEAR_TROOPS + (FAR_TROOPS - NEAR_TROOPS) * t + (KIND_TROOPS[b.kind] ?? 0);
    return Math.max(MIN_TROOPS, Math.round(troops));
  };
  const list: BaseDef[] = owners.flatMap((owner, k) =>
    third.map((b) => {
      const isHq = b.kind === 'hq';
      const p = turned(b, k);
      return {
        kind: b.kind,
        x: p.x,
        y: p.y,
        owner: isHq ? owner : 'neutral',
        troops: isHq ? HQ_TROOPS : troopsAt(b),
      };
    }),
  );
  if (centre) list.push({ ...centre, owner: 'neutral', troops: troopsAt(centre) });
  return list;
}
