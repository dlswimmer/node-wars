import { BASE_STATS } from './config';
import { nearPolyline } from './paths';
import { createRng } from './rng';
import type { Feature, FeatureKind, LevelDef, Point } from './types';

/**
 * The look of a map: an organic outline around the bases (fog of war outside it) and
 * scattered scenery (only lakes block troops), point-mirrored like the bases so neither
 * side's half looks different. Uses its own random stream so it never changes where bases
 * go.
 */

/** Outline corners; even, so each corner has a mirror twin half a turn away. */
export const OUTLINE_POINTS = 72;
/** Room kept between a base centre and the map's edge (the label hangs below the base). */
export const OUTLINE_MARGIN = 75;
const LABEL_DROP = 12;
/** How fast the edge may pull in between bases, per outline corner; keeps it rounded. */
const OUTLINE_SLOPE = 28;
const OUTLINE_WOBBLE = 34;
/** Scenery keeps this far from a base's edge, and from the label below it. */
const BASE_CLEARANCE = 38;
const LABEL_Y = 48;
/** Scenery keeps this far from water and rock. */
const RIVER_CLEARANCE = 60;
const RIDGE_CLEARANCE = 30;

const FEATURE_SIZES: Record<FeatureKind, [number, number]> = {
  forest: [45, 75],
  rocks: [22, 36],
  lake: [40, 65],
  crater: [16, 28],
  sandbags: [26, 36],
  traps: [22, 32],
};
const FEATURE_WEIGHTS: [FeatureKind, number][] = [
  ['forest', 4],
  ['rocks', 3],
  ['crater', 3],
  ['lake', 1.5],
  ['sandbags', 1.5],
  ['traps', 1.5],
];

/**
 * Add an outline and scenery to a point-symmetric level. The outline is generated around the
 * bases unless one is given (a conquest region's shape, from regionOutline).
 */
export function addScenery(level: LevelDef, seed: number, outline?: Point[]): LevelDef {
  const rng = createRng(seed * 40503 + 7);
  const edge = outline ?? makeOutline(level, rng);
  return { ...level, outline: edge, features: makeFeatures(level, edge, rng) };
}

/**
 * A conquest region's exact shape as a battle outline: only scaled (to the given area) and
 * moved so its centre of mass is the map's centre, never stretched, turned or re-noised. The
 * map is sized so that centre is its middle, letting bases mirror through it.
 */
export function regionOutline(
  shape: Point[],
  area: number,
): { outline: Point[]; width: number; height: number } {
  const c = centroid(shape);
  const scale = Math.sqrt(area / polygonArea(shape));
  // A whole-number centre, so mirrored bases land on whole numbers too.
  const cx = Math.ceil(Math.max(...shape.map((p) => Math.abs(p.x - c.x))) * scale);
  const cy = Math.ceil(Math.max(...shape.map((p) => Math.abs(p.y - c.y))) * scale);
  const outline = shape.map((p) => ({ x: cx + (p.x - c.x) * scale, y: cy + (p.y - c.y) * scale }));
  return { outline, width: 2 * cx, height: 2 * cy };
}

/**
 * Whether a base at this spot fits inside an outline with room for its label, and so does
 * its mirror twin through the map's centre (an irregular region isn't symmetric itself).
 */
export function fitsWithTwin(outline: Point[], width: number, height: number) {
  const roomy = (x: number, y: number) => {
    const p = { x, y: y + LABEL_DROP };
    return insidePolygon(p, outline) && edgeDistance(p, outline) >= OUTLINE_MARGIN;
  };
  return (x: number, y: number) => roomy(x, y) && roomy(width - x, height - y);
}

export function polygonArea(poly: Point[]): number {
  let twice = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    twice += poly[j]!.x * poly[i]!.y - poly[i]!.x * poly[j]!.y;
  }
  return Math.abs(twice) / 2;
}

/** Area-weighted centre of a polygon. */
export function centroid(poly: Point[]): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  return { x: x / (3 * area), y: y / (3 * area) };
}

function makeOutline(level: LevelDef, rng: () => number): Point[] {
  const { width, height, bases } = level;
  const cx = width / 2;
  const cy = height / 2;
  const n = OUTLINE_POINTS;
  const half = n / 2;
  const angle = (i: number) => (i / n) * Math.PI * 2;

  // How far out each ray must reach to clear every base (and its label) by the margin.
  const need = Array.from({ length: n }, (_, i) => {
    const dx = Math.cos(angle(i));
    const dy = Math.sin(angle(i));
    let r = 0;
    for (const b of bases) {
      const px = b.x - cx;
      const py = b.y + LABEL_DROP - cy;
      const along = px * dx + py * dy;
      const across = px * dy - py * dx;
      if (Math.abs(across) < OUTLINE_MARGIN) {
        r = Math.max(r, along + Math.sqrt(OUTLINE_MARGIN ** 2 - across ** 2));
      }
    }
    return r;
  });
  // Labels hang down on both sides, so take the larger of each mirrored pair.
  for (let i = 0; i < half; i++) need[i] = need[i + half] = Math.max(need[i]!, need[i + half]!);

  // Smooth 0..1 noise that repeats every half turn, so the outline mirrors cleanly.
  const noise = (spacing: number) => {
    const knots = Array.from({ length: half / spacing }, () => rng());
    return (i: number) => {
      const t = (i % half) / spacing;
      const k = Math.floor(t);
      const f = (1 - Math.cos((t - k) * Math.PI)) / 2;
      return knots[k % knots.length]! * (1 - f) + knots[(k + 1) % knots.length]! * f;
    };
  };
  // Each map gets its own character: a few big lobes or many small inlets, shallow or deep.
  const bays = noise([4, 6, 9][Math.floor(rng() * 3)]!);
  const depth = 0.3 + rng() * 0.3;
  const wobble = noise(2);

  // Round off the gaps between bases, never pinching thinner than a lumpy oval (bays and
  // headlands where there are no bases), then a small wobble so it looks like land.
  const a = width * 0.36;
  const b = height * 0.38;
  const first = Array.from({ length: half }, (_, i) => {
    const oval = (a * b) / Math.hypot(b * Math.cos(angle(i)), a * Math.sin(angle(i)));
    let r = oval * (1.12 - depth * bays(i));
    for (let j = 0; j < n; j++) {
      const steps = Math.min(Math.abs(i - j), n - Math.abs(i - j));
      r = Math.max(r, need[j]! - OUTLINE_SLOPE * steps);
    }
    r += wobble(i) * OUTLINE_WOBBLE;
    return {
      x: Math.round(cx + Math.cos(angle(i)) * r),
      y: Math.round(cy + Math.sin(angle(i)) * r),
    };
  });
  return [...first, ...first.map((p) => ({ x: width - p.x, y: height - p.y }))];
}

function makeFeatures(level: LevelDef, outline: Point[], rng: () => number): Feature[] {
  const { width, height, bases } = level;
  const cx = width / 2;
  const cy = height / 2;
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const total = FEATURE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  const pickKind = (): FeatureKind => {
    let r = rng() * total;
    for (const [kind, w] of FEATURE_WEIGHTS) if ((r -= w) < 0) return kind;
    return 'rocks';
  };
  const [x0, x1] = [Math.min(...outline.map((p) => p.x)), cx];
  const [y0, y1] = [Math.min(...outline.map((p) => p.y)), Math.max(...outline.map((p) => p.y))];

  const half: Feature[] = [];
  const fits = (f: Feature) => {
    if (Math.hypot(f.x - cx, f.y - cy) < f.size + 10) return false; // overlaps its own twin
    // Its mirror twin must fit as well: a conquest region's outline isn't symmetric.
    for (const p of [f, { x: width - f.x, y: height - f.y }]) {
      if (!insidePolygon(p, outline) || edgeDistance(p, outline) < f.size + 12) return false;
    }
    // Off the water and rock, with room to walk to the bridges and through the passes.
    if (onTerrain(level, f, f.size)) return false;
    for (const b of bases) {
      const clear = f.size + BASE_STATS[b.kind].radius + BASE_CLEARANCE;
      if (Math.hypot(f.x - b.x, f.y - b.y) < clear) return false;
      // Labels hang below every base, which is above the base for this spot's mirror twin.
      if (Math.hypot(f.x - b.x, Math.abs(f.y - b.y) - LABEL_Y) < f.size + 42) return false;
    }
    return half.every(
      (o) =>
        Math.hypot(o.x - f.x, o.y - f.y) >= o.size + f.size + 20 &&
        Math.hypot(width - o.x - f.x, height - o.y - f.y) >= o.size + f.size + 20,
    );
  };

  const wanted = 5 + Math.floor(rng() * 4);
  for (let tries = 0; tries < 300 && half.length < wanted; tries++) {
    const kind = pickKind();
    const [lo, hi] = FEATURE_SIZES[kind];
    const f: Feature = {
      kind,
      x: Math.round(between(x0, x1)),
      y: Math.round(between(y0, y1)),
      size: Math.round(between(lo, hi)),
      angle: between(0, Math.PI * 2),
      detail: Math.floor(rng() * 1e9),
    };
    if (fits(f)) half.push(f);
  }
  return [
    ...half,
    ...half.map((f) => ({ ...f, x: width - f.x, y: height - f.y, angle: f.angle + Math.PI })),
  ];
}

/** Whether a patch of scenery this big at this spot would sit on water or rock. */
function onTerrain(level: LevelDef, p: Point, size: number): boolean {
  return (
    (level.rivers ?? []).some((r) =>
      nearPolyline(p.x, p.y, r.points, size + r.width / 2 + RIVER_CLEARANCE),
    ) ||
    (level.ridges ?? []).some((r) =>
      nearPolyline(p.x, p.y, r.points, size + r.width / 2 + RIDGE_CLEARANCE),
    )
  );
}

export function insidePolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to the polygon's edge. */
export function edgeDistance(p: Point, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}
