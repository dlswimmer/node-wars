import { BASE_STATS } from './config';
import { SHORE, distToPolyline } from './paths';
import { createRng } from './rng';
import type { Bridge, LevelDef, Point } from './types';

/**
 * Rivers on random maps. A river winds across the middle of the map, between the two HQs,
 * so the bridges over it become the places worth fighting for. Like the bases, a river is
 * point-mirrored through the map's centre (it runs through the centre itself), so both sides
 * face exactly the same crossing. Uses its own random stream so it never moves bases or scenery.
 */

/** Chance a random map gets a river (when one fits). */
export const RIVER_CHANCE = 0.9;
/** How far the river runs past the top and bottom of the map, out into the fog. */
const OVERSHOOT = 300;
const STEP = 20;
/** Room between the water and a base's edge, and the label hanging below it. */
const BASE_GAP = 24;
const LABEL_Y = 44;
const LABEL_GAP = 16;
/** Bridges stay this far up or down from the centre, and inside the bases' rows. */
const BRIDGE_MIN_OFFSET = 150;
const BRIDGE_EDGE = 110;
const ROAD_WIDTH = 60;
/** How far a bridge reaches past each bank, so troops step onto it from dry land. */
const BRIDGE_OVERHANG = 26;
/** Never more than this times the straight line between the HQs (the long way round). */
export const MAX_DETOUR = 1.7;

export function addRiver(level: LevelDef, seed: number): LevelDef {
  const rng = createRng(seed * 69069 + 3);
  if (rng() >= RIVER_CHANCE) return level;
  const { width: w, height: h } = level;
  const [cx, cy] = [w / 2, h / 2];
  const between = (lo: number, hi: number) => lo + rng() * (hi - lo);

  for (let attempt = 0; attempt < 150; attempt++) {
    // x along the river is odd around the centre, so the river mirrors onto itself.
    const slope = between(-0.35, 0.35);
    const [a1, k1] = [between(0, 55), (Math.PI * 2) / between(420, 750)];
    const [a2, k2] = [between(0, 16), (Math.PI * 2) / between(180, 280)];
    const xAt = (y: number) => {
      const d = y - cy;
      return cx + slope * d + a1 * Math.sin(k1 * d) + a2 * Math.sin(k2 * d);
    };
    const riverWidth = Math.round(between(36, 46));
    const points: Point[] = [];
    for (let y = -OVERSHOOT; y <= h + OVERSHOOT; y += STEP) points.push({ x: xAt(y), y });

    const roomy = level.bases.every((b) => {
      const water = riverWidth / 2;
      return (
        distToPolyline(b.x, b.y, points) >= BASE_STATS[b.kind].radius + water + BASE_GAP &&
        distToPolyline(b.x, b.y + LABEL_Y, points) >= water + LABEL_GAP
      );
    });
    if (!roomy) continue;

    // One bridge in the middle, a mirrored pair, or all three.
    const layout = rng();
    const reach = cy - BRIDGE_EDGE;
    const offset = between(BRIDGE_MIN_OFFSET, Math.max(BRIDGE_MIN_OFFSET, reach));
    const spots = layout < 0.25 ? [0] : layout < 0.6 ? [-offset, offset] : [0, -offset, offset];
    const bridges = spots.map((d): Bridge => {
      const y = cy + d;
      const dx = (xAt(y + 1) - xAt(y - 1)) / 2;
      return {
        x: xAt(y),
        y,
        // The road runs across the river, square to its flow.
        angle: Math.atan2(-dx, 1),
        length: riverWidth + 2 * (SHORE + BRIDGE_OVERHANG),
        width: ROAD_WIDTH,
      };
    });
    const clearOfBases = bridges.every((br) =>
      level.bases.every(
        (b) => Math.hypot(b.x - br.x, b.y - br.y) >= BASE_STATS[b.kind].radius + br.length / 2 + 20,
      ),
    );
    if (!clearOfBases) continue;
    return { ...level, rivers: [{ points, width: riverWidth }], bridges };
  }
  return level;
}
