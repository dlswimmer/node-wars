import { BASE_STATS } from './config';
import { createRng } from './rng';
import type { Feature, FeatureKind, LevelDef, Point } from './types';

/**
 * The look of a map: an organic outline around the bases (fog of war outside it) and
 * scattered scenery. Purely visual, and point-mirrored like the bases so neither side's half
 * looks different. Uses its own random stream so it never changes where bases go.
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
 * bases unless one is given (a conquest region's shape, from fitOutline).
 */
export function addScenery(level: LevelDef, seed: number, outline?: Point[]): LevelDef {
  const rng = createRng(seed * 40503 + 7);
  const edge = outline ?? makeOutline(level, rng);
  return { ...level, outline: edge, features: makeFeatures(level, edge, rng) };
}

/**
 * Turn a shape (a conquest region) into a battle outline around a level's bases: centred on
 * the map, stretched to the bases' proportions, and scaled just big enough that every base
 * and its label clears the edge.
 */
export function fitOutline(shape: Point[], level: LevelDef): Point[] {
  const { width, height, bases } = level;
  const c = centroid(shape);
  const span = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  const shapeAspect = span(shape.map((p) => p.x)) / span(shape.map((p) => p.y));
  const basesAspect =
    (span(bases.map((b) => b.x)) + 2 * OUTLINE_MARGIN) /
    (span(bases.map((b) => b.y)) + 2 * OUTLINE_MARGIN);
  const stretch = basesAspect / shapeAspect;
  const unit = shape.map((p) => ({ x: (p.x - c.x) * stretch, y: p.y - c.y }));
  const w = span(unit.map((p) => p.x));
  const h = span(unit.map((p) => p.y));
  // Shift the shape a little off-centre too, if that lets it fit around the bases snugger.
  let best: Point[] = [];
  let bestScale = Infinity;
  for (const ox of [-0.12, -0.06, 0, 0.06, 0.12]) {
    for (const oy of [-0.12, -0.06, 0, 0.06, 0.12]) {
      const scaled = (s: number) =>
        unit.map((p) => ({
          x: Math.round(width / 2 + (p.x + ox * w) * s),
          y: Math.round(height / 2 + (p.y + oy * h) * s),
        }));
      const fits = (s: number) => {
        const poly = scaled(s);
        return bases.every((b) => {
          const q = { x: b.x, y: b.y + LABEL_DROP };
          return insidePolygon(q, poly) && edgeDistance(q, poly) >= OUTLINE_MARGIN;
        });
      };
      let lo = 0;
      let hi = 1;
      while (!fits(hi)) hi *= 2;
      for (let k = 0; k < 16; k++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      if (hi < bestScale - 1e-9) {
        bestScale = hi;
        best = scaled(hi);
      }
    }
  }
  return best;
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
