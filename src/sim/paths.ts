import type { Bridge, LevelDef, Point, Route, UnitKind } from './types';

/**
 * Real ways between bases. The map is split into a grid of cells, each blocked (water or
 * rock, unless a bridge crosses it), slow (forest or mud) or open. Once per map, a
 * shortest-path search runs from every base over the grid, counting slow cells as longer,
 * and each path is pulled tight into a few straight legs. Tanks, which bog down most, get
 * their own routes. Troops then just walk those corners, so hundreds of units cost nothing
 * extra.
 */

/** How fast soldiers and tanks move through slow ground (jets fly over it). */
export const GROUND_SPEED = {
  forest: { soldier: 0.75, tank: 0.5 },
  mud: { soldier: 0.6, tank: 0.4 },
} as const;
type Slow = keyof typeof GROUND_SPEED;
const SLOW_KINDS: Slow[] = ['forest', 'mud'];
/** Everyone but jets walks; soldiers and tanks each get their own routes. */
type Walker = 'soldier' | 'tank';

/** Slow ground on a grid, for looking up how fast a unit moves where it stands. */
export interface Ground {
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  /** 0 = normal, otherwise 1 + the index in SLOW_KINDS. */
  type: Uint8Array;
}

/** Grid cell size in map units. */
export const CELL = 20;
/** Troops keep this far from the water's edge, so they walk on the bank, not in the river. */
export const SHORE = 6;

const cache = new WeakMap<LevelDef, Record<Walker, Route[][]>>();
const groundCache = new WeakMap<LevelDef, Ground | null>();
/** Levels where some base can't reach another at all (map making rejects those). */
const cutOff = new WeakSet<LevelDef>();

/**
 * Routes from every base to every other one (`routes[from][to]`) for soldiers, or tanks,
 * worked out once per level.
 */
export function levelRoutes(level: LevelDef, walker: Walker = 'soldier'): Route[][] {
  let routes = cache.get(level);
  if (!routes) {
    routes = buildRoutes(level);
    cache.set(level, routes);
  }
  return routes[walker];
}

/** The level's slow ground, or null if it has none (then everyone moves at full speed). */
export function levelGround(level: LevelDef): Ground | null {
  if (!groundCache.has(level)) groundCache.set(level, buildGround(level));
  return groundCache.get(level)!;
}

/** How fast a unit of this kind moves at this spot (1 = full speed). */
export function groundSpeed(ground: Ground | null, x: number, y: number, unit: UnitKind): number {
  if (!ground || unit === 'jet') return 1;
  const c = Math.floor((x - ground.x0) / CELL);
  const r = Math.floor((y - ground.y0) / CELL);
  if (c < 0 || r < 0 || c >= ground.cols || r >= ground.rows) return 1;
  const t = ground.type[r * ground.cols + c]!;
  return t === 0 ? 1 : GROUND_SPEED[SLOW_KINDS[t - 1]!][unit];
}

/** The slow ground (forest or mud) at a point, if any. */
export function slowAt(level: LevelDef, x: number, y: number): Slow | null {
  for (const f of level.features ?? []) {
    if (f.kind !== 'forest' && f.kind !== 'mud') continue;
    // Matches the drawn patch, an oval about 0.85 x 0.66 of its size.
    const dx = x - f.x;
    const dy = y - f.y;
    const lx = dx * Math.cos(f.angle) + dy * Math.sin(f.angle);
    const ly = -dx * Math.sin(f.angle) + dy * Math.cos(f.angle);
    if ((lx / (f.size * 0.85)) ** 2 + (ly / (f.size * 0.66)) ** 2 <= 1) return f.kind;
  }
  return null;
}

/** Whether the level has any forest or mud. */
function hasSlowGround(level: LevelDef): boolean {
  return (level.features ?? []).some((f) => f.kind === 'forest' || f.kind === 'mud');
}

/** Where the grid sits: over the map, its outline and every base, with a cell to spare. */
function gridFrame(level: LevelDef) {
  const { bases } = level;
  const xs = [0, level.width, ...(level.outline ?? []).map((p) => p.x), ...bases.map((b) => b.x)];
  const ys = [0, level.height, ...(level.outline ?? []).map((p) => p.y), ...bases.map((b) => b.y)];
  const x0 = Math.min(...xs) - CELL;
  const y0 = Math.min(...ys) - CELL;
  const cols = Math.ceil((Math.max(...xs) + CELL - x0) / CELL);
  const rows = Math.ceil((Math.max(...ys) + CELL - y0) / CELL);
  return { x0, y0, cols, rows };
}

function buildGround(level: LevelDef): Ground | null {
  if (!hasSlowGround(level)) return null;
  const { x0, y0, cols, rows } = gridFrame(level);
  const type = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const slow = slowAt(level, x0 + (c + 0.5) * CELL, y0 + (r + 0.5) * CELL);
      type[r * cols + c] = slow ? SLOW_KINDS.indexOf(slow) + 1 : 0;
    }
  }
  return { x0, y0, cols, rows, type };
}

/** Whether every base can walk to every other one. */
export function routesReachEverywhere(level: LevelDef): boolean {
  levelRoutes(level);
  return !cutOff.has(level);
}

/** Whether the level has anything that blocks troops. */
export function hasBlockers(level: LevelDef): boolean {
  return (
    (level.rivers?.length ?? 0) > 0 ||
    (level.ridges?.length ?? 0) > 0 ||
    (level.features ?? []).some((f) => f.kind === 'lake')
  );
}

/**
 * Whether all of a grid cell (top-left corner x, y) is dry ground, so a straight walk through
 * open cells never dips into the water or off the side of a bridge.
 */
function cellIsDry(level: LevelDef, x: number, y: number): boolean {
  const half = CELL / 2;
  // Far from any water (bridges or not) the whole cell is dry; only cells near the shore
  // check their corners and edges.
  if (!blockedAt(level, x + half, y + half, SHORE + half * Math.SQRT2, false)) return true;
  for (const dx of [0, half, CELL]) {
    for (const dy of [0, half, CELL]) if (blockedAt(level, x + dx, y + dy)) return false;
  }
  return true;
}

/**
 * Whether a point is on the battlefield: inside its outline or within a cell of the edge (so
 * bases near the edge stay connected). A level without an outline is all battlefield.
 */
function insideOutline(level: LevelDef, x: number, y: number): boolean {
  const poly = level.outline;
  if (!poly || poly.length < 3) return true;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside || nearPolyline(x, y, [...poly, poly[0]!], CELL);
}

/** Whether a point is water or rock troops can't walk on (counting a little bank around it). */
export function blockedAt(
  level: LevelDef,
  x: number,
  y: number,
  shore = SHORE,
  bridges = true,
): boolean {
  for (const f of level.features ?? []) {
    if (f.kind !== 'lake') continue;
    // The drawn lake is a rough oval about 0.82 x 0.66 of its size (see drawing.ts).
    const dx = x - f.x;
    const dy = y - f.y;
    const lx = dx * Math.cos(f.angle) + dy * Math.sin(f.angle);
    const ly = -dx * Math.sin(f.angle) + dy * Math.cos(f.angle);
    if ((lx / (f.size * 0.85 + shore)) ** 2 + (ly / (f.size * 0.68 + shore)) ** 2 <= 1) return true;
  }
  for (const r of level.ridges ?? []) {
    if (nearPolyline(x, y, r.points, r.width / 2 + shore)) return true;
  }
  for (const r of level.rivers ?? []) {
    if (!nearPolyline(x, y, r.points, r.width / 2 + shore)) continue;
    if (!bridges || !(level.bridges ?? []).some((b) => onBridge(b, x, y))) return true;
  }
  return false;
}

/** Whether a point is on a bridge's road. */
export function onBridge(b: Bridge, x: number, y: number): boolean {
  const dx = x - b.x;
  const dy = y - b.y;
  const along = dx * Math.cos(b.angle) + dy * Math.sin(b.angle);
  const across = -dx * Math.sin(b.angle) + dy * Math.cos(b.angle);
  return Math.abs(along) <= b.length / 2 && Math.abs(across) <= b.width / 2;
}

/**
 * Whether a point is within `limit` of a polyline. Much faster than distToPolyline for long
 * lines, since segments whose box is too far away are skipped without measuring.
 */
export function nearPolyline(x: number, y: number, points: Point[], limit: number): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (x < Math.min(a.x, b.x) - limit || x > Math.max(a.x, b.x) + limit) continue;
    if (y < Math.min(a.y, b.y) - limit || y > Math.max(a.y, b.y) + limit) continue;
    if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= limit) return true;
  }
  return false;
}

export function distToPolyline(x: number, y: number, points: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    best = Math.min(best, distToSegment(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(x1 + t * dx - px, y1 + t * dy - py);
}

function straight(a: Point, b: Point): Route {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    points: [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ],
    length,
    time: length,
  };
}

function reversed(route: Route): Route {
  return { ...route, points: [...route.points].reverse() };
}

function buildRoutes(level: LevelDef): Record<Walker, Route[][]> {
  const soldier = findRoutes(level, 'soldier');
  if (!soldier.ok) cutOff.add(level);
  // Without slow ground, tanks take the same roads as everyone.
  const tank = hasSlowGround(level) ? findRoutes(level, 'tank').table : soldier.table;
  return { soldier: soldier.table, tank };
}

function findRoutes(level: LevelDef, walker: Walker): { table: Route[][]; ok: boolean } {
  const bases = level.bases;
  if (!hasBlockers(level) && !hasSlowGround(level))
    return { table: bases.map((a) => bases.map((b) => straight(a, b))), ok: true };

  const { x0, y0, cols, rows } = gridFrame(level);
  const ground = levelGround(level);
  /** Cost of crossing each cell: 1 on open ground, more where it is slow. */
  const slowness = new Float64Array(cols * rows).fill(1);
  if (ground) {
    for (let k = 0; k < ground.type.length; k++) {
      const t = ground.type[k]!;
      if (t > 0) slowness[k] = 1 / GROUND_SPEED[SLOW_KINDS[t - 1]!][walker];
    }
  }
  const open = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = [x0 + c * CELL, y0 + r * CELL];
      // Off the battlefield is closed too, so a detour around a river's end can't leave it.
      const onMap = insideOutline(level, x + CELL / 2, y + CELL / 2);
      open[r * cols + c] = onMap && cellIsDry(level, x, y) ? 1 : 0;
    }
  }
  const cellOf = (p: Point) => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor((p.x - x0) / CELL)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((p.y - y0) / CELL)));
    return r * cols + c;
  };
  const centre = (i: number): Point => ({
    x: x0 + ((i % cols) + 0.5) * CELL,
    y: y0 + (Math.floor(i / cols) + 0.5) * CELL,
  });
  // A base always stands on open ground (map making keeps water away from bases).
  for (const b of bases) open[cellOf(b)] = 1;

  const cellAt = (x: number, y: number) => {
    const c = Math.floor((x - x0) / CELL);
    const r = Math.floor((y - y0) / CELL);
    return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
  };
  /**
   * Whether a straight leg stays on open ground, crossing slow cells only where the searched
   * path already did (so pulling it tight never cuts through a forest it went around).
   */
  const clearOf = (allowed: Set<number> | null) => (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 4));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const k = cellAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      if (k < 0 || open[k] !== 1) return false;
      if (slowness[k]! > 1 && !allowed?.has(k)) return false;
    }
    return true;
  };
  const clear = clearOf(null);
  /** How far a route is at full speed, counting slow stretches as longer. */
  const timeOf = (points: Point[]) => {
    let time = 0;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1]!, points[i]!];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(length / (CELL / 2)));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const k = cellAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        time += (length / steps) * (k < 0 ? 1 : slowness[k]!);
      }
    }
    return time;
  };

  const routes: Route[][] = bases.map(() => []);
  let ok = true;
  for (let i = 0; i < bases.length; i++) {
    const a = bases[i]!;
    routes[i]![i] = straight(a, a);
    const start = cellOf(a);
    const parent = search(open, slowness, cols, rows, start, bases.slice(i + 1).map(cellOf));
    for (let j = i + 1; j < bases.length; j++) {
      const b = bases[j]!;
      const end = cellOf(b);
      let route: Route;
      // Unreachable (map making never allows it) goes straight rather than nowhere.
      if (parent[end] === -1 && end !== start) ok = false;
      if (clear(a, b) || (parent[end] === -1 && end !== start)) {
        route = straight(a, b);
      } else {
        const cells: Point[] = [];
        const onPath = new Set<number>([start]);
        for (let k = end; k !== start; k = parent[k]!) {
          cells.push(centre(k));
          onPath.add(k);
        }
        route = tighten([b, ...cells, centre(start), a].reverse(), clearOf(onPath));
      }
      route.time = timeOf(route.points);
      routes[i]![j] = route;
      routes[j]![i] = reversed(route);
    }
  }
  return { table: routes, ok };
}

/**
 * Dijkstra over open cells (8 directions, no cutting corners) until every target cell is
 * reached; returns each cell's parent.
 */
function search(
  open: Uint8Array,
  slowness: Float64Array,
  cols: number,
  rows: number,
  start: number,
  targets: number[],
): Int32Array {
  const waiting = new Set(targets);
  const n = cols * rows;
  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  dist[start] = 0;
  const heap = new Heap();
  heap.push(start, 0);
  while (heap.size > 0) {
    const [k, d] = heap.pop();
    if (d > dist[k]!) continue;
    waiting.delete(k);
    if (waiting.size === 0) break;
    const c = k % cols;
    const r = (k - c) / cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const nk = nr * cols + nc;
        if (!open[nk]) continue;
        if (dr !== 0 && dc !== 0 && (!open[r * cols + nc] || !open[nr * cols + c])) continue;
        const nd = d + (dr !== 0 && dc !== 0 ? Math.SQRT2 : 1) * slowness[nk]!;
        if (nd < dist[nk]!) {
          dist[nk] = nd;
          parent[nk] = k;
          heap.push(nk, nd);
        }
      }
    }
  }
  return parent;
}

/** Pull a cell-by-cell path tight: keep only the corners needed to stay on open ground. */
function tighten(points: Point[], clear: (a: Point, b: Point) => boolean): Route {
  const out = [points[0]!];
  let anchor = points[0]!;
  for (let i = 2; i < points.length; i++) {
    if (!clear(anchor, points[i]!)) {
      anchor = points[i - 1]!;
      out.push(anchor);
    }
  }
  out.push(points[points.length - 1]!);
  let length = 0;
  for (let i = 1; i < out.length; i++) {
    length += Math.hypot(out[i]!.x - out[i - 1]!.x, out[i]!.y - out[i - 1]!.y);
  }
  return { points: out, length, time: length };
}

/** A small binary min-heap of (cell, distance). */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (vals[p]! <= val) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0]!, vals[0]!];
    const key = keys.pop()!;
    const val = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const m = l + 1 < n && vals[l + 1]! < vals[l]! ? l + 1 : l;
        if (vals[m]! >= val) break;
        keys[i] = keys[m]!;
        vals[i] = vals[m]!;
        i = m;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return top;
  }
}
