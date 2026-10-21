import type { Bridge, LevelDef, Point, Route } from './types';

/**
 * Real ways between bases. The map is split into a grid of cells, each open or blocked
 * (water, unless a bridge crosses it). Once per map, a shortest-path search runs from every
 * base over the grid, and each path is pulled tight into a few straight legs. Troops then
 * just walk those corners, so hundreds of units cost nothing extra.
 */

/** Grid cell size in map units. */
export const CELL = 20;
/** Troops keep this far from the water's edge, so they walk on the bank, not in the river. */
export const SHORE = 6;

const cache = new WeakMap<LevelDef, Route[][]>();

/** Routes from every base to every other one (`routes[from][to]`), worked out once per level. */
export function levelRoutes(level: LevelDef): Route[][] {
  let routes = cache.get(level);
  if (!routes) {
    routes = buildRoutes(level);
    cache.set(level, routes);
  }
  return routes;
}

/** Whether the level has anything that blocks troops. */
export function hasBlockers(level: LevelDef): boolean {
  return (level.rivers?.length ?? 0) > 0 || (level.features ?? []).some((f) => f.kind === 'lake');
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

/** Whether a point is water troops can't walk on (counting a little bank around it). */
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
  for (const r of level.rivers ?? []) {
    if (distToPolyline(x, y, r.points) > r.width / 2 + shore) continue;
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
  return {
    points: [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ],
    length: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

function buildRoutes(level: LevelDef): Route[][] {
  const bases = level.bases;
  if (!hasBlockers(level)) return bases.map((a) => bases.map((b) => straight(a, b)));

  // The grid covers the map, its outline, and every base, with a cell to spare.
  const xs = [0, level.width, ...(level.outline ?? []).map((p) => p.x), ...bases.map((b) => b.x)];
  const ys = [0, level.height, ...(level.outline ?? []).map((p) => p.y), ...bases.map((b) => b.y)];
  const x0 = Math.min(...xs) - CELL;
  const y0 = Math.min(...ys) - CELL;
  const cols = Math.ceil((Math.max(...xs) + CELL - x0) / CELL);
  const rows = Math.ceil((Math.max(...ys) + CELL - y0) / CELL);
  const open = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      open[r * cols + c] = cellIsDry(level, x0 + c * CELL, y0 + r * CELL) ? 1 : 0;
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

  const isOpen = (x: number, y: number) => {
    const c = Math.floor((x - x0) / CELL);
    const r = Math.floor((y - y0) / CELL);
    return c >= 0 && r >= 0 && c < cols && r < rows && open[r * cols + c] === 1;
  };
  const clear = (a: Point, b: Point) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 4));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (!isOpen(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  };

  const routes: Route[][] = bases.map(() => []);
  for (let i = 0; i < bases.length; i++) {
    const a = bases[i]!;
    routes[i]![i] = straight(a, a);
    const start = cellOf(a);
    const parent = search(open, cols, rows, start);
    for (let j = i + 1; j < bases.length; j++) {
      const b = bases[j]!;
      const end = cellOf(b);
      let route: Route;
      // Unreachable (map making never allows it) goes straight rather than nowhere.
      if (clear(a, b) || (parent[end] === -1 && end !== start)) {
        route = straight(a, b);
      } else {
        const cells: Point[] = [];
        for (let k = end; k !== start; k = parent[k]!) cells.push(centre(k));
        route = tighten([b, ...cells, centre(start), a].reverse(), clear);
      }
      routes[i]![j] = route;
      routes[j]![i] = { points: [...route.points].reverse(), length: route.length };
    }
  }
  return routes;
}

/** Dijkstra over open cells (8 directions, no cutting corners); returns each cell's parent. */
function search(open: Uint8Array, cols: number, rows: number, start: number): Int32Array {
  const n = cols * rows;
  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  dist[start] = 0;
  const heap = new Heap();
  heap.push(start, 0);
  while (heap.size > 0) {
    const [k, d] = heap.pop();
    if (d > dist[k]!) continue;
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
        const nd = d + (dr !== 0 && dc !== 0 ? Math.SQRT2 : 1);
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
  return { points: out, length };
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
