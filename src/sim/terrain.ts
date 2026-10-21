import { BASE_STATS } from './config';
import { SHORE, levelRoutes, nearPolyline, routesReachEverywhere } from './paths';
import { createRng } from './rng';
import { addScenery, edgeDistance, insidePolygon } from './scenery';
import type { Bridge, LevelDef, Point, Ridge, River } from './types';

/**
 * Terrain that blocks troops: a river across the middle (crossed only on its bridges) and
 * mountain ranges with a pass through each. Like the bases, all of it is point-mirrored
 * through the map's centre, so both sides face exactly the same ground. Each kind uses its
 * own random stream, so terrain never moves bases, and adding one kind never changes another.
 */

export interface TerrainOptions {
  /** Chance of a river (when one fits). */
  river: number;
  /** 'many' always gives three bridges (gentle); 'any' gives one, two or three. */
  bridges: 'many' | 'any';
  /** Chance of each mirrored pair of mountain ranges. */
  mountains: number[];
}

export const NO_TERRAIN: TerrainOptions = { river: 0, bridges: 'any', mountains: [] };
/** Quick Battle maps. */
export const RANDOM_TERRAIN: TerrainOptions = { river: 0.9, bridges: 'any', mountains: [0.4] };

/**
 * Conquest regions by their natural star rating: none on the first ring, a gentle river at
 * two stars, and more (and fewer bridges) further out.
 */
export function regionTerrain(stars: number): TerrainOptions {
  if (stars <= 1) return NO_TERRAIN;
  if (stars === 2) return { river: 0.6, bridges: 'many', mountains: [] };
  if (stars === 3) return { river: 0.6, bridges: 'any', mountains: [0.5] };
  return { river: 0.7, bridges: 'any', mountains: [0.8, 0.4] };
}

/** Never more than this times the straight line between the HQs (the long way round). */
export const MAX_DETOUR = 1.7;

const STEP = 20;
/** How far the river runs past the map's outline at both ends, out into the fog. */
const OVERSHOOT = 300;
/** Room between terrain and a base's edge, and the label hanging below it. */
const BASE_GAP = 24;
const LABEL_Y = 44;
const LABEL_GAP = 16;
/** Bridges stay this far along the river from the centre, and well inside the outline. */
const BRIDGE_MIN_OFFSET = 150;
const BRIDGE_EDGE = 80;
const ROAD_WIDTH = 60;
/** How far a bridge reaches past each bank, so troops step onto it from dry land. */
const BRIDGE_OVERHANG = 26;
/** Gap through a mountain range, wide enough for a swarm to squeeze through. */
const PASS = [70, 90] as const;

/**
 * Add terrain to a level that already has its outline. `axis` points from the player's side
 * to the enemy's (the way the HQs face each other).
 */
export function addTerrain(
  level: LevelDef,
  seed: number,
  options: TerrainOptions,
  axis: Point = { x: 1, y: 0 },
): LevelDef {
  const outline = level.outline!;
  const water = makeRiver(level, outline, createRng(seed * 69069 + 3), axis, options);
  const wet: LevelDef = water ? { ...level, rivers: [water.river], bridges: water.bridges } : level;
  const ridges = makeRidges(wet, outline, createRng(seed * 22695477 + 9), axis, options);
  // Scenery is placed again around the terrain. If the map got too roundabout, give up the
  // mountains first, then the river.
  const tries = [ridges.length ? { ...wet, ridges } : wet, wet];
  for (const t of tries) {
    if (t === level) break;
    const dressed = addScenery(t, seed, outline);
    if (fair(dressed)) return dressed;
  }
  return level;
}

/** Every base can reach every other, and the HQs aren't too far apart on foot. */
function fair(level: LevelDef): boolean {
  if (!routesReachEverywhere(level)) return false;
  const a = level.bases.findIndex((b) => b.kind === 'hq' && b.owner === 'player');
  const b = level.bases.findIndex((b) => b.kind === 'hq' && b.owner === 'enemy');
  if (a < 0 || b < 0) return true;
  const [p, q] = [level.bases[a]!, level.bases[b]!];
  return levelRoutes(level)[a]![b]!.length <= MAX_DETOUR * Math.hypot(p.x - q.x, p.y - q.y);
}

/** Whether a line of terrain this wide keeps clear of every base and its label. */
function clearOfBases(level: LevelDef, points: Point[], width: number): boolean {
  return level.bases.every(
    (b) =>
      !nearPolyline(b.x, b.y, points, BASE_STATS[b.kind].radius + width / 2 + BASE_GAP) &&
      !nearPolyline(b.x, b.y + LABEL_Y, points, width / 2 + LABEL_GAP),
  );
}

/**
 * A river winding across the middle, square to the HQs' axis, through the map's centre. Its
 * sideways wander is an odd function of the distance from the centre, so it mirrors onto itself.
 */
function makeRiver(
  level: LevelDef,
  outline: Point[],
  rng: () => number,
  axis: Point,
  options: TerrainOptions,
): { river: River; bridges: Bridge[] } | null {
  if (rng() >= options.river) return null;
  const c = { x: level.width / 2, y: level.height / 2 };
  const n = { x: -axis.y, y: axis.x };
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const reach = Math.max(...outline.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) + OVERSHOOT;
  const steps = Math.ceil(reach / STEP);

  for (let attempt = 0; attempt < 150; attempt++) {
    const slope = between(-0.35, 0.35);
    const [a1, k1] = [between(0, 55), (Math.PI * 2) / between(420, 750)];
    const [a2, k2] = [between(0, 16), (Math.PI * 2) / between(180, 280)];
    const off = (s: number) => slope * s + a1 * Math.sin(k1 * s) + a2 * Math.sin(k2 * s);
    const at = (s: number) => ({
      x: c.x + n.x * s + axis.x * off(s),
      y: c.y + n.y * s + axis.y * off(s),
    });
    const width = Math.round(between(36, 46));
    const points = Array.from({ length: 2 * steps + 1 }, (_, i) => at((i - steps) * STEP));
    if (!clearOfBases(level, points, width)) continue;

    // One bridge in the middle, a mirrored pair, or all three; the pair goes where it fits.
    const layout = options.bridges === 'many' ? 1 : rng();
    const offsets: number[] = [];
    for (let s = BRIDGE_MIN_OFFSET; s < reach; s += 10) {
      const p = at(s);
      if (insidePolygon(p, outline) && edgeDistance(p, outline) >= BRIDGE_EDGE) offsets.push(s);
    }
    const offset = offsets.length ? offsets[Math.floor(rng() * offsets.length)]! : null;
    let spots = layout < 0.25 ? [0] : layout < 0.6 ? [-1, 1] : [0, -1, 1];
    if (offset === null) spots = [0];
    const bridges = spots.map((side): Bridge => {
      const s = side * (offset ?? 0);
      const slant = (off(s + 1) - off(s - 1)) / 2;
      // The road runs across the river, square to its flow.
      const road = { x: axis.x - n.x * slant, y: axis.y - n.y * slant };
      return {
        ...at(s),
        angle: Math.atan2(road.y, road.x),
        length: width + 2 * (SHORE + BRIDGE_OVERHANG),
        width: ROAD_WIDTH,
      };
    });
    const roomy = bridges.every((br) =>
      level.bases.every(
        (b) => Math.hypot(b.x - br.x, b.y - br.y) >= BASE_STATS[b.kind].radius + br.length / 2 + 20,
      ),
    );
    if (roomy) return { river: { points, width }, bridges };
  }
  return null;
}

/**
 * Mountain ranges on the player's half (each with a mirrored twin), lying across the way
 * between the HQs. Each range is two ridges in a line with a pass between them.
 */
function makeRidges(
  level: LevelDef,
  outline: Point[],
  rng: () => number,
  axis: Point,
  options: TerrainOptions,
): Ridge[] {
  const c = { x: level.width / 2, y: level.height / 2 };
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const hq = level.bases.find((b) => b.kind === 'hq' && b.owner === 'player');
  if (!hq) return [];
  // How far back towards the player's HQ the middle of the map runs.
  const back = (hq.x - c.x) * axis.x + (hq.y - c.y) * axis.y;
  const across = Math.max(
    ...outline.map((p) => Math.abs((p.x - c.x) * axis.y - (p.y - c.y) * axis.x)),
  );
  const twin = (p: Point) => ({ x: level.width - p.x, y: level.height - p.y });
  const ridges: Ridge[] = [];

  for (const chance of options.mountains) {
    if (rng() >= chance) continue;
    for (let attempt = 0; attempt < 80; attempt++) {
      const u = between(0.3, 0.75) * back;
      const v = between(-0.55, 0.55) * across;
      const mid = {
        x: c.x + axis.x * u - axis.y * v,
        y: c.y + axis.y * u + axis.x * v,
      };
      // Roughly square to the axis, so it stands in the way.
      const turn = Math.atan2(axis.y, axis.x) + Math.PI / 2 + between(-0.4, 0.4);
      const dir = { x: Math.cos(turn), y: Math.sin(turn) };
      const length = between(260, 380);
      const pass = between(PASS[0], PASS[1]);
      const gapAt = between(0.35, 0.65) * (length - pass);
      const width = Math.round(between(38, 48));
      const wobble = between(-14, 14);
      const line = (from: number, to: number) => {
        const count = Math.max(2, Math.round((to - from) / 25) + 1);
        return Array.from({ length: count }, (_, i) => {
          const t = from + ((to - from) * i) / (count - 1);
          const side = wobble * Math.sin((t / length) * Math.PI * 2);
          return {
            x: mid.x + dir.x * (t - length / 2) - dir.y * side,
            y: mid.y + dir.y * (t - length / 2) + dir.x * side,
          };
        });
      };
      const pair = [line(0, gapAt), line(gapAt + pass, length)];
      const all = [...pair, ...pair.map((pts) => pts.map(twin))];
      const ok = all.every(
        (pts) =>
          clearOfBases(level, pts, width) &&
          pts.every((p) => insidePolygon(p, outline) && edgeDistance(p, outline) >= width / 2) &&
          (level.rivers ?? []).every((r) =>
            pts.every((p) => !nearPolyline(p.x, p.y, r.points, (width + r.width) / 2 + 50)),
          ) &&
          ridges.every((o) =>
            pts.every((p) => !nearPolyline(p.x, p.y, o.points, (width + o.width) / 2 + 60)),
          ),
      );
      // The range mustn't touch its own twin across the centre.
      const apart = pair.every((pts) =>
        pts.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= width + 40),
      );
      if (!ok || !apart) continue;
      for (const pts of all) ridges.push({ points: pts, width });
      break;
    }
  }
  return ridges;
}
