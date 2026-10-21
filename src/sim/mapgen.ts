import { createRng } from './rng';
import { addScenery, fitOutline } from './scenery';
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
};

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

/**
 * A battle for a conquest-map region: bases from the random-map generator, with the region's
 * own shape (stretched and scaled to fit around them) as the battlefield's outline. A small
 * map has few bases, for the tutorial region.
 */
export function generateRegionLevel(
  seed: number,
  shape: Point[],
  id: string,
  name: string,
  small: boolean,
): LevelDef {
  const { seed: _mapNumber, ...level } = layoutLevel(seed, small);
  const region = { ...level, id, name };
  return addScenery(region, seed, fitOutline(shape, region));
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

function tryLayout(rng: () => number, small: boolean): { width: number; list: BaseDef[] } | null {
  const [minWidth, maxWidth] = small ? SMALL_WIDTH : [MIN_WIDTH, MAX_WIDTH];
  const width = Math.round((minWidth + rng() * (maxWidth - minWidth)) / 10) * 10;
  const height = MAP_HEIGHT;
  const cx = width / 2;
  const cy = height / 2;
  const between = (a: number, b: number) => a + rng() * (b - a);
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;

  const half: Spot[] = [];
  const centre: Spot | null =
    rng() < (small ? 0 : 0.4) ? { kind: pick(SPECIALS), x: cx, y: cy } : null;

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
  const inBounds = (x: number, y: number) =>
    x >= EDGE_X &&
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

  const hq = {
    kind: 'hq' as const,
    x: between(EDGE_X, 170),
    y: between(height * 0.4, height * 0.6),
  };
  if (!place('hq', () => [hq.x, hq.y])) return null;

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
  const middle = () =>
    [between(width * 0.3, cx - 40), between(EDGE_Y, height - EDGE_Y)] as [number, number];
  for (const kind of specials.slice(0, specialCount)) {
    if (!place(kind, middle, 3)) return null;
  }

  // Fill the rest of the half evenly with barracks and outposts. Every side gets a Barracks:
  // maps of only slow Outposts turned into endless see-saws in bot matches.
  const perSide = small ? 3 : centre ? 4 + Math.floor(rng() * 3) : 4 + Math.floor(rng() * 4);
  const anywhere = () =>
    [between(EDGE_X, cx), between(EDGE_Y, height - EDGE_Y)] as [number, number];
  const hasBarracks = () => half.some((b) => b.kind === 'barracks');
  while (half.length < perSide || !hasBarracks()) {
    const kind = !hasBarracks() || rng() < 0.4 ? 'barracks' : 'outpost';
    if (!place(kind, anywhere, 12)) return null;
  }

  const all = [...half, ...half.map((b) => ({ ...b, x: width - b.x, y: height - b.y }))];
  if (centre) all.push(centre);
  if (crowdsCorner(all)) return null;

  // Garrisons grow with distance from home; computed on the player's half and copied to the
  // mirror twin so both sides match exactly.
  const reach = Math.hypot(cx - hq.x, cy - hq.y) - MIN_SPACING;
  const troopsAt = (b: Spot) => {
    const t = Math.min(1, Math.max(0, (Math.hypot(b.x - hq.x, b.y - hq.y) - MIN_SPACING) / reach));
    return Math.round(NEAR_TROOPS + (FAR_TROOPS - NEAR_TROOPS) * t + (KIND_TROOPS[b.kind] ?? 0));
  };
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
