import { MAX_MAP_SEED, generateRegionLevel } from './mapgen';
import { createRng } from './rng';
import type { LevelDef, Point } from './types';

/**
 * The conquest map: an endless world split into organic, puzzle-piece regions.
 *
 * Region sites sit on a hex lattice, each nudged by a seeded jitter (a lattice is already as
 * evenly spread as relaxed points, and lets any region be built on its own, so the world can
 * grow forever). Each region is the Voronoi cell of its site, and every border between two
 * regions is bent by noise seeded from that pair, so both neighbours draw exactly the same
 * wobbly edge.
 */

/** Distance between neighbouring region sites, in world-map units. */
export const REGION_SPACING = 100;
const ROW = (REGION_SPACING * Math.sqrt(3)) / 2;
/** How far a site may stray from its lattice point, as a share of the spacing. */
const JITTER = 0.25;
/** Borders shorter than this (share of spacing) are a corner touch, not neighbours. */
const MIN_BORDER = 0.12;
/** The first, tutorial region. */
export const START_ID = '0,0';
export const MAX_STARS = 5;

export interface Region {
  id: string;
  i: number;
  j: number;
  site: Point;
  /** Noisy outline; shared point for point with each neighbour along their border. */
  polygon: Point[];
  /** Regions sharing a real border with this one. */
  neighbours: string[];
  name: string;
}

export function regionId(i: number, j: number): string {
  return `${i},${j}`;
}

function parseId(id: string): [number, number] {
  const [i, j] = id.split(',').map(Number);
  return [i!, j!];
}

/** Mixes numbers into a well-spread 32-bit seed. */
export function hashSeed(...xs: number[]): number {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

function site(seed: number, i: number, j: number): Point {
  const rng = createRng(hashSeed(seed, i, j, 1));
  return {
    x: (i + (j & 1) * 0.5 + (rng() * 2 - 1) * JITTER) * REGION_SPACING,
    y: (j + (rng() * 2 - 1) * JITTER) * ROW,
  };
}

const cache = new Map<string, Region>();

/** A region of the world (built on demand, so the world has no edge). */
export function getRegion(seed: number, id: string): Region {
  const key = `${seed}|${id}`;
  let region = cache.get(key);
  if (!region) {
    region = buildRegion(seed, id);
    cache.set(key, region);
  }
  return region;
}

interface CellCorner {
  p: Point;
  /** Region on the other side of the edge from this corner to the next (null: bounding box). */
  edge: string | null;
}

function buildRegion(seed: number, id: string): Region {
  const [i, j] = parseId(id);
  const s = site(seed, i, j);
  const sites = new Map<string, Point>([[id, s]]);

  // Voronoi cell: a big square cut down by the half-way line to every nearby site.
  const r = REGION_SPACING * 2;
  let cell: CellCorner[] = [
    { p: { x: s.x - r, y: s.y - r }, edge: null },
    { p: { x: s.x + r, y: s.y - r }, edge: null },
    { p: { x: s.x + r, y: s.y + r }, edge: null },
    { p: { x: s.x - r, y: s.y + r }, edge: null },
  ];
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      if (di === 0 && dj === 0) continue;
      const other = regionId(i + di, j + dj);
      const o = site(seed, i + di, j + dj);
      sites.set(other, o);
      cell = clipCell(cell, s, o, other);
    }
  }

  // Recompute every corner from the three sites that meet there (in a fixed order), so a
  // corner is bit-for-bit the same point whichever of its regions is being built.
  const n = cell.length;
  const corners = cell.map((c, k) => {
    const prev = cell[(k + n - 1) % n]!.edge;
    if (!prev || !c.edge) return c.p;
    const ids = [id, prev, c.edge].sort();
    return circumcentre(sites.get(ids[0]!)!, sites.get(ids[1]!)!, sites.get(ids[2]!)!) ?? c.p;
  });

  const polygon: Point[] = [];
  const neighbours: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = corners[k]!;
    const b = corners[(k + 1) % n]!;
    const other = cell[k]!.edge;
    polygon.push(a);
    if (!other) continue;
    if (Math.hypot(b.x - a.x, b.y - a.y) >= MIN_BORDER * REGION_SPACING) neighbours.push(other);
    polygon.push(...noisyBorder(seed, id, other, a, b));
  }
  return { id, i, j, site: s, polygon, neighbours, name: regionName(seed, id) };
}

/** Keep the part of a convex cell closer to `s` than to `o`; new edges face region `other`. */
function clipCell(cell: CellCorner[], s: Point, o: Point, other: string): CellCorner[] {
  const mx = (s.x + o.x) / 2;
  const my = (s.y + o.y) / 2;
  const nx = o.x - s.x;
  const ny = o.y - s.y;
  const side = (p: Point) => (p.x - mx) * nx + (p.y - my) * ny;
  const out: CellCorner[] = [];
  for (let k = 0; k < cell.length; k++) {
    const cur = cell[k]!;
    const next = cell[(k + 1) % cell.length]!;
    const dc = side(cur.p);
    const dn = side(next.p);
    if (dc <= 0) out.push(cur);
    if (dc <= 0 !== dn <= 0) {
      const t = dc / (dc - dn);
      const p = { x: cur.p.x + (next.p.x - cur.p.x) * t, y: cur.p.y + (next.p.y - cur.p.y) * t };
      // Leaving the cell: the edge from here runs along the cut. Entering: the old edge goes on.
      out.push({ p, edge: dc <= 0 ? other : cur.edge });
    }
  }
  return out;
}

function circumcentre(a: Point, b: Point, c: Point): Point | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

/**
 * Points along the border from `a` to `b` (ends excluded), bent by a few smooth waves. The
 * waves are seeded by the pair of regions and laid out in a fixed direction, so both sides
 * get the same points. They fade out at the corners and stay shallow, so borders never cross.
 */
function noisyBorder(seed: number, id: string, other: string, a: Point, b: Point): Point[] {
  const [lo, hi] = [id, other].sort() as [string, string];
  const flip = a.x > b.x || (a.x === b.x && a.y > b.y);
  const [p, q] = flip ? [b, a] : [a, b];
  const rng = createRng(hashSeed(seed, ...parseId(lo), ...parseId(hi), 2));
  const waves = [0.06, 0.02, 0.012].map((amp) => amp * (rng() * 2 - 1));
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(4, Math.round((length / REGION_SPACING) * 14));
  const points: Point[] = [];
  for (let k = 1; k < steps; k++) {
    const t = k / steps;
    const bend = waves.reduce((sum, amp, w) => sum + amp * Math.sin(Math.PI * (w + 1) * t), 0);
    points.push({ x: p.x + dx * t - dy * bend, y: p.y + dy * t + dx * bend });
  }
  return flip ? points.reverse() : points;
}

const NAME_FIRST = [
  'Pine',
  'Dusty',
  'Red',
  'Misty',
  'Iron',
  'Rocky',
  'Silver',
  'Thunder',
  'Frozen',
  'Green',
  'Windy',
  'Sunny',
  'Muddy',
  'Stone',
  'Golden',
  'Shadow',
  'Copper',
  'Wolf',
  'Eagle',
  'Bear',
];
const NAME_SECOND = [
  'Ridge',
  'Valley',
  'Flats',
  'Hills',
  'Woods',
  'Pass',
  'Marsh',
  'Plains',
  'Bluff',
  'Creek',
  'Canyon',
  'Heights',
  'Fields',
  'Point',
  'Hollow',
  'Lake',
];

function regionName(seed: number, id: string): string {
  if (id === START_ID) return 'Training Ground';
  const h = hashSeed(seed, ...parseId(id), 3);
  return `${NAME_FIRST[h % NAME_FIRST.length]} ${NAME_SECOND[(h >>> 8) % NAME_SECOND.length]}`;
}

/**
 * The battle fought for a region: its own map, outlined by the region's shape. The start
 * region is a small, gentle map for learning.
 */
export function regionLevel(seed: number, id: string): LevelDef {
  const r = getRegion(seed, id);
  const mapSeed = 1 + (hashSeed(seed, r.i, r.j, 7) % MAX_MAP_SEED);
  return generateRegionLevel(mapSeed, r.polygon, `region-${id}`, r.name, id === START_ID);
}

/**
 * A region's normal rating: more stars further from the start, give or take one for variety.
 * The nearest ring stays at one or two stars so the campaign eases in.
 */
export function naturalStars(seed: number, id: string): number {
  if (id === START_ID) return 1;
  const s = getRegion(seed, id).site;
  const home = getRegion(seed, START_ID).site;
  const distance = Math.hypot(s.x - home.x, s.y - home.y) / REGION_SPACING;
  const variety = createRng(hashSeed(seed, ...parseId(id), 4))() * 2 - 0.9;
  return clampStars(Math.round(1 + 0.6 * (distance - 1) + variety));
}

function clampStars(stars: number): number {
  return Math.max(1, Math.min(MAX_STARS, stars));
}

// ----- Conquest progress ----------------------------------------------------------------

export interface RegionProgress {
  /** Its normal rating. */
  base: number;
  /** Current rating: drifts below normal after losses and back up with wins. */
  stars: number;
  /** Battles won here. */
  wins: number;
}

export interface ConquestState {
  seed: number;
  /** Regions the player holds, in the order they were won. */
  held: string[];
  /** Every region the player has seen (held or available to attack). */
  regions: Record<string, RegionProgress>;
  /** Wins the player earned themselves (not auto-battles), per star level (index = stars). */
  starWins: number[];
  /** Battles fought; seeds the rating drift so it is reproducible. */
  battles: number;
}

export function newConquest(seed: number): ConquestState {
  return {
    seed,
    held: [],
    regions: { [START_ID]: { base: 1, stars: 1, wins: 0 } },
    starWins: Array.from({ length: MAX_STARS + 1 }, () => 0),
    battles: 0,
  };
}

/** Regions the player can attack: seen but not held. */
export function availableRegions(state: ConquestState): string[] {
  const held = new Set(state.held);
  return Object.keys(state.regions).filter((id) => !held.has(id));
}

/** Unknown regions bordering the available ones (drawn in fog). */
export function fogRegions(state: ConquestState): string[] {
  const fog = new Set<string>();
  for (const id of availableRegions(state)) {
    for (const n of getRegion(state.seed, id).neighbours) {
      if (!state.regions[n]) fog.add(n);
    }
  }
  return [...fog];
}

/**
 * Lifetime medals earned (not spent) needed before you may attack a region with this many
 * stars (index = stars). Gives a reason to replay and farm held regions for medals.
 */
export const STAR_UNLOCK_MEDALS = [0, 0, 0, 0, 10, 25];

export function unlockMedals(stars: number): number {
  return STAR_UNLOCK_MEDALS[stars] ?? 0;
}

export function isUnlocked(stars: number, medalsEarned: number): boolean {
  return medalsEarned >= unlockMedals(stars) - 1e-9;
}

/** Share of available regions that lose a star after a defeat (or regain one after a win). */
const DRIFT_CHANCE = 0.75;

/**
 * Apply a battle's result. A win takes the region and reveals its unknown neighbours; ratings
 * on every available region drift down a little after a loss and back up after a win.
 * Returns the newly revealed regions. `medalsEarned` (lifetime, after this battle) keeps
 * at least one region unlocked; leave it out to ignore medal locks.
 */
export function recordBattle(
  state: ConquestState,
  id: string,
  won: boolean,
  auto = false,
  medalsEarned = Infinity,
): string[] {
  const region = state.regions[id];
  if (!region) return [];
  const rng = createRng(hashSeed(state.seed, state.battles, 5));
  state.battles += 1;
  const wasHeld = state.held.includes(id);
  if (won) {
    region.wins += 1;
    if (!auto) state.starWins[region.stars] = (state.starWins[region.stars] ?? 0) + 1;
  }
  // Replaying a region you already hold (auto-battles) only earns medals.
  if (wasHeld) return [];

  const revealed: string[] = [];
  if (won) {
    state.held.push(id);
    for (const n of getRegion(state.seed, id).neighbours) {
      if (state.regions[n]) continue;
      const stars = naturalStars(state.seed, n);
      state.regions[n] = { base: stars, stars, wins: 0 };
      revealed.push(n);
    }
  }
  for (const other of availableRegions(state)) {
    if (revealed.includes(other)) continue;
    const r = state.regions[other]!;
    if (rng() >= DRIFT_CHANCE) continue;
    if (won && r.stars < r.base) r.stars += 1;
    if (!won && r.stars > 1) r.stars -= 1;
  }
  ensureChoice(state);
  ensureUnlocked(state, medalsEarned);
  return revealed;
}

/**
 * Make sure the frontier offers a choice: when every available region has the same rating,
 * nudge one of them a notch (up, unless they're all at the top).
 */
export function ensureChoice(state: ConquestState): void {
  const avail = availableRegions(state).sort();
  if (avail.length < 2) return;
  const stars = avail.map((id) => state.regions[id]!.stars);
  if (Math.min(...stars) !== Math.max(...stars)) return;
  const pick = avail[hashSeed(state.seed, state.battles, 6) % avail.length]!;
  const r = state.regions[pick]!;
  if (r.stars < MAX_STARS) {
    r.stars += 1;
    r.base = Math.max(r.base, r.stars);
  } else {
    r.stars -= 1;
    r.base = r.stars;
  }
}

/**
 * No dead ends: if every available region is locked behind medals, the easiest one drops to
 * the highest rating that is open (as its normal rating, so wins don't lock it again).
 */
export function ensureUnlocked(state: ConquestState, medalsEarned: number): void {
  const avail = availableRegions(state).sort();
  if (avail.length === 0) return;
  if (avail.some((id) => isUnlocked(state.regions[id]!.stars, medalsEarned))) return;
  let open = MAX_STARS;
  while (open > 1 && !isUnlocked(open, medalsEarned)) open--;
  const easiest = avail.reduce((a, b) =>
    state.regions[b]!.stars < state.regions[a]!.stars ? b : a,
  );
  state.regions[easiest]!.stars = open;
  state.regions[easiest]!.base = open;
}

/** Wins the player earned themselves at a star level. */
export function starWins(state: ConquestState, stars: number): number {
  return state.starWins[stars] ?? 0;
}
