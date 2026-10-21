import { createRng } from './rng';
import { addScenery, fitsWithTwin, regionOutline } from './scenery';
import type { BaseDef, BaseKind, LevelDef, Point } from './types';

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
};
/** Chance a (not small) map gets a pair of Bunkers, and of Field Hospitals. */
const BUNKER_CHANCE = 0.45;
const HOSPITAL_CHANCE = 0.4;
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
  return addScenery(layoutLevel(seed, false), seed);
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
 * A small map has few bases, for the tutorial region.
 */
export function generateRegionLevel(
  seed: number,
  shape: Point[],
  id: string,
  name: string,
  small: boolean,
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
    return addScenery({ id, name, width, height, bases: list }, seed, outline);
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
function crowdsCorner(bases: Spot[]): boolean {
  const xs = bases.map((b) => b.x);
  const ys = bases.map((b) => b.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return bases.some((b) => {
    const nearSide = Math.min(b.x - x0, x1 - b.x) < (x1 - x0) * CORNER_X;
    const nearEdge = Math.min(b.y - y0, y1 - b.y) < (y1 - y0) * CORNER_Y;
    return nearSide && nearEdge;
  });
}
