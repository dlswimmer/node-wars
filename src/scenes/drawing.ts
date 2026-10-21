import type Phaser from 'phaser';
import { BASE_STATS, HOSPITAL_RANGE } from '../sim/config';
import { createRng } from '../sim/rng';
import { insidePolygon } from '../sim/scenery';
import type { Base, Bridge, Feature, LevelDef, Point, Ridge, River } from '../sim/types';
import { COLORS } from '../theme';

/** Tactical-map background: a grid with heavier lines every 5 cells. */
export function drawMapGrid(g: Phaser.GameObjects.Graphics, width: number, height: number) {
  const cell = 40;
  for (let x = 0, i = 0; x <= width; x += cell, i++) {
    g.lineStyle(1, i % 5 === 0 ? COLORS.gridMajor : COLORS.grid, 1);
    g.lineBetween(x, 0, x, height);
  }
  for (let y = 0, i = 0; y <= height; y += cell, i++) {
    g.lineStyle(1, i % 5 === 0 ? COLORS.gridMajor : COLORS.grid, 1);
    g.lineBetween(0, y, width, y);
  }
}

function polygon(sides: number, r: number, x: number, y: number, rotation = -Math.PI / 2) {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  return pts;
}

/** Darker or lighter version of a colour (f < 1 darkens, f > 1 lightens). */
function shade(color: number, f: number): number {
  const ch = (shift: number) => {
    const c = (color >> shift) & 0xff;
    const v = f < 1 ? c * f : c + (255 - c) * (f - 1);
    return Math.max(0, Math.min(255, Math.round(v))) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

const OUTLINE = 0x000000;
const CONCRETE = 0x6d705f;
const WOOD = 0x6b5434;
const WHITE = 0xf2f2e6;
const SANDBAG = 0x8a7d55;
const DOOR = 0x1a1a14;

/**
 * Each base kind is drawn as a small building seen from above and a little from the front:
 * the roof in its army's colour (so who owns it reads at a glance) and a darker front wall.
 * Shapes stay bold, since a base is only a finger wide on a phone, and the middle stays plain
 * enough for the troop count drawn on top. `time` turns the radar dish.
 */
export function drawBase(g: Phaser.GameObjects.Graphics, base: Base, color: number, time = 0) {
  const r = BASE_STATS[base.kind].radius;
  const { x, y } = base;
  const roof = color;
  const wall = shade(color, 0.55);
  const light = shade(color, 1.35);
  // A shadow on the ground under every building, about the size of its tap area.
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(x + 3, y + r * 0.25, r * 2.1, r * 1.7);

  /** A box: a roof rectangle with a darker front wall below it. */
  const block = (cx: number, top: number, w: number, d: number, h: number, c = roof) => {
    g.fillStyle(shade(c, 0.55), 1);
    g.fillRect(cx - w / 2, top + d, w, h);
    g.fillStyle(c, 1);
    g.fillRect(cx - w / 2, top, w, d);
    g.lineStyle(2, OUTLINE, 0.7);
    g.strokeRect(cx - w / 2, top, w, d + h);
    g.lineStyle(1.5, shade(c, 1.4), 0.8);
    g.lineBetween(cx - w / 2 + 2, top + 2, cx + w / 2 - 2, top + 2);
  };
  /** A ring of sandbags around the building. */
  const sandbags = (count: number, rx: number, ry: number) => {
    g.fillStyle(SANDBAG, 1);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      g.fillEllipse(x + Math.cos(a) * rx, y + Math.sin(a) * ry + 4, 12, 8);
    }
  };

  switch (base.kind) {
    case 'hq': {
      // The command building: sandbags round it and a flag on the roof.
      sandbags(18, r * 0.98, r * 0.86);
      block(x, y - r * 0.62, r * 1.5, r * 1.0, r * 0.36);
      g.fillStyle(DOOR, 1);
      g.fillRect(x - r * 0.12, y + r * 0.42, r * 0.24, r * 0.32);
      for (const dx of [-0.5, 0.34]) g.fillRect(x + dx * r, y + r * 0.46, r * 0.16, r * 0.12);
      const [px, py] = [x + r * 0.58, y - r * 0.58];
      g.lineStyle(3, 0x2b2b22, 1);
      g.lineBetween(px, py, px, py - r * 0.9);
      g.fillStyle(light, 1);
      g.fillTriangle(px, py - r * 0.9, px + r * 0.55, py - r * 0.74, px, py - r * 0.56);
      g.lineStyle(1.5, OUTLINE, 0.7);
      g.strokeTriangle(px, py - r * 0.9, px + r * 0.55, py - r * 0.74, px, py - r * 0.56);
      return;
    }
    case 'barracks': {
      // A long army hut with a round, ribbed metal roof.
      const [w, d] = [r * 1.9, r * 1.15];
      const top = y - r * 0.68;
      const corners = { tl: d / 2, tr: d / 2, bl: 4, br: 4 };
      g.fillStyle(wall, 1);
      g.fillRect(x - w / 2, top + d * 0.75, w, r * 0.5);
      g.fillStyle(roof, 1);
      g.fillRoundedRect(x - w / 2, top, w, d, corners);
      g.lineStyle(2, shade(color, 0.7), 0.9);
      for (let i = 1; i < 7; i++) {
        const lx = x - w / 2 + (w * i) / 7;
        g.lineBetween(lx, top + 3, lx, top + d - 2);
      }
      g.lineStyle(2, OUTLINE, 0.7);
      g.strokeRoundedRect(x - w / 2, top, w, d, corners);
      g.strokeRect(x - w / 2, top + d * 0.75, w, r * 0.5);
      g.fillStyle(DOOR, 1);
      g.fillRect(x - r * 0.16, top + d * 0.82, r * 0.32, r * 0.4);
      return;
    }
    case 'outpost': {
      // A wooden watchtower: crossed legs, a platform and a pointed roof in army colour.
      g.lineStyle(4, WOOD, 1);
      for (const dx of [-0.6, 0.6]) g.lineBetween(x + dx * r, y + r * 0.85, x + dx * r * 0.7, y);
      g.lineStyle(2, WOOD, 1);
      g.lineBetween(x - r * 0.62, y + r * 0.55, x + r * 0.62, y + r * 0.25);
      g.lineBetween(x + r * 0.62, y + r * 0.55, x - r * 0.62, y + r * 0.25);
      block(x, y - r * 0.15, r * 1.3, r * 0.32, r * 0.22, WOOD);
      const [left, right, peak] = [x - r * 0.85, x + r * 0.85, y - r * 1.05];
      const eaves = y - r * 0.12;
      g.fillStyle(roof, 1);
      g.fillTriangle(left, eaves, right, eaves, x, peak);
      g.fillStyle(light, 1);
      g.fillTriangle(left, eaves, x, eaves, x, peak);
      g.lineStyle(2, OUTLINE, 0.7);
      g.strokeTriangle(left, eaves, right, eaves, x, peak);
      return;
    }
    case 'factory': {
      // A works with a saw-tooth roof and a smoking chimney.
      const [w, top] = [r * 1.8, y - r * 0.45];
      g.fillStyle(CONCRETE, 1);
      g.fillRect(x + r * 0.4, y - r * 1.15, r * 0.34, r * 0.9);
      g.lineStyle(2, OUTLINE, 0.7);
      g.strokeRect(x + r * 0.4, y - r * 1.15, r * 0.34, r * 0.9);
      g.fillStyle(0xbfbfb0, 0.35);
      g.fillCircle(x + r * 0.62, y - r * 1.35, r * 0.22);
      g.fillCircle(x + r * 0.85, y - r * 1.6, r * 0.28);
      block(x, top, w, r * 0.75, r * 0.45);
      for (let i = 0; i < 4; i++) {
        const lx = x - w / 2 + (w * i) / 4;
        g.fillStyle(light, 1);
        g.fillTriangle(lx, top, lx + w / 4, top, lx + w / 4, top - r * 0.32);
        g.lineStyle(2, OUTLINE, 0.7);
        g.strokeTriangle(lx, top, lx + w / 4, top, lx + w / 4, top - r * 0.32);
      }
      g.fillStyle(DOOR, 1);
      g.fillRect(x - r * 0.3, y + r * 0.42, r * 0.6, r * 0.33);
      return;
    }
    case 'radar': {
      // A dish on a mast over a control hut, slowly turning.
      g.fillStyle(CONCRETE, 1);
      g.fillRect(x - r * 0.55, y + r * 0.25, r * 1.1, r * 0.45);
      g.lineStyle(2, OUTLINE, 0.7);
      g.strokeRect(x - r * 0.55, y + r * 0.25, r * 1.1, r * 0.45);
      g.lineStyle(5, 0x3a3a30, 1);
      g.lineBetween(x, y + r * 0.3, x, y - r * 0.1);
      const turn = Math.cos(time * 0.8);
      const dishW = r * 1.7 * Math.max(0.25, Math.abs(turn));
      const dishY = y - r * 0.25;
      g.fillStyle(turn > 0 ? WHITE : shade(WHITE, 0.7), 1);
      g.fillEllipse(x, dishY, dishW, r * 1.25);
      g.fillStyle(roof, 1);
      g.fillEllipse(x, dishY, dishW * 0.7, r * 0.85);
      g.lineStyle(2, OUTLINE, 0.7);
      g.strokeEllipse(x, dishY, dishW, r * 1.25);
      const tip = { x: x + turn * r * 0.5, y: y - r * 0.95 };
      g.lineStyle(2, 0x2b2b22, 1);
      g.lineBetween(x, dishY, tip.x, tip.y);
      g.fillStyle(0xff5a5f, 1);
      g.fillCircle(tip.x, tip.y, 3);
      return;
    }
    case 'armory': {
      // A weapons store: a solid shed with a shell painted on top and ammo crates beside it.
      block(x - r * 0.15, y - r * 0.7, r * 1.35, r * 0.95, r * 0.45);
      g.fillStyle(light, 0.9);
      g.fillRoundedRect(x - r * 0.3, y - r * 0.6, r * 0.3, r * 0.7, {
        tl: r * 0.15,
        tr: r * 0.15,
        bl: 0,
        br: 0,
      });
      const crates = [
        [0.72, 0.2],
        [0.72, -0.25],
        [0.38, 0.5],
      ] as const;
      for (const [dx, dy] of crates) {
        const [cx, cy, s] = [x + dx * r, y + dy * r, r * 0.42];
        g.fillStyle(0x7a6236, 1);
        g.fillRect(cx - s / 2, cy - s / 2, s, s);
        g.lineStyle(1.5, 0x2e2416, 1);
        g.strokeRect(cx - s / 2, cy - s / 2, s, s);
        g.lineBetween(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2);
        g.lineBetween(cx + s / 2, cy - s / 2, cx - s / 2, cy + s / 2);
      }
      return;
    }
    case 'bunker': {
      // A squat concrete pillbox ringed with sandbags, its roof in army colour.
      sandbags(16, r, r * 0.85);
      const body = polygon(8, r * 0.85, x, y + r * 0.12, Math.PI / 8);
      g.fillStyle(CONCRETE, 1);
      g.fillPoints(body, true);
      g.lineStyle(3, OUTLINE, 0.75);
      g.strokePoints(body, true);
      const top = polygon(8, r * 0.62, x, y - r * 0.08, Math.PI / 8);
      g.fillStyle(roof, 1);
      g.fillPoints(top, true);
      g.lineStyle(2, OUTLINE, 0.6);
      g.strokePoints(top, true);
      // The firing slit.
      g.fillStyle(0x000000, 0.85);
      g.fillRect(x - r * 0.45, y + r * 0.5, r * 0.9, r * 0.13);
      return;
    }
    case 'hospital': {
      // A field tent with a ridge pole and a big cross on top.
      const [w, d] = [r * 1.8, r * 1.4];
      const top = y - r * 0.75;
      g.fillStyle(wall, 1);
      g.fillTriangle(x - w / 2, top + d, x + w / 2, top + d, x, top + d + r * 0.35);
      g.fillStyle(roof, 1);
      g.fillRect(x - w / 2, top, w / 2, d);
      g.fillStyle(light, 1);
      g.fillRect(x, top, w / 2, d);
      g.lineStyle(2, OUTLINE, 0.7);
      g.strokeRect(x - w / 2, top, w, d);
      g.lineStyle(3, shade(color, 0.5), 1);
      g.lineBetween(x, top, x, top + d);
      const [arm, len] = [r * 0.2, r * 0.55];
      const cy = top + d * 0.42;
      g.fillStyle(WHITE, 1);
      g.fillRect(x - arm, cy - len, arm * 2, len * 2);
      g.fillRect(x - len, cy - arm, len * 2, arm * 2);
      return;
    }
  }
}

/** The faint circle a Field Hospital saves troops within, shown when it's picked or tapped. */
export function drawHospitalRange(
  g: Phaser.GameObjects.Graphics,
  base: Base,
  color: number,
  strength: number,
) {
  g.fillStyle(color, 0.06 * strength);
  g.fillCircle(base.x, base.y, HOSPITAL_RANGE);
  g.lineStyle(3, 0xffffff, 0.3 * strength);
  g.strokeCircle(base.x, base.y, HOSPITAL_RANGE);
}

/** Ring around a base showing how full it is relative to its capacity. */
export function drawCapacityRing(g: Phaser.GameObjects.Graphics, base: Base, color: number) {
  const stats = BASE_STATS[base.kind];
  const frac = Math.min(1, base.troops / stats.capacity);
  const r = stats.radius + 8;
  g.lineStyle(4, 0x000000, 0.35);
  g.strokeCircle(base.x, base.y, r);
  if (frac > 0) {
    g.lineStyle(4, color, 0.9);
    g.beginPath();
    g.arc(base.x, base.y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    g.strokePath();
  }
}

const FOG = 0x060806;
const GROUND = 0x1b2416;
const BORDER = 0x6f7d52;

/**
 * The battlefield: ground and grid inside the map's outline, rivers and bridges, mountains, scenery, a
 * soft dark edge, and
 * fog of war everywhere outside. Drawn once when the battle starts.
 */
export function drawTerrain(
  g: Phaser.GameObjects.Graphics,
  level: LevelDef & { outline: Point[] },
  area: { x: number; y: number; width: number; height: number },
) {
  const { outline, features = [], rivers = [], bridges = [], ridges = [] } = level;
  const far = 4000;
  g.fillStyle(FOG, 1);
  g.fillRect(area.x - far, area.y - far, area.width + far * 2, area.height + far * 2);
  g.fillStyle(GROUND, 1);
  g.fillPoints(outline, true);
  drawClippedGrid(g, outline);
  for (const r of rivers) drawRiver(g, r, outline);
  for (const b of bridges) drawBridge(g, b);
  for (const r of ridges) drawRidge(g, r);
  for (const f of features) drawFeature(g, f);
  // Darken just inside the edge so the land fades into the fog.
  for (const [width, alpha] of [
    [56, 0.16],
    [34, 0.2],
    [16, 0.25],
  ] as const) {
    g.lineStyle(width, FOG, alpha);
    g.strokePoints(outline, true, true);
  }
  g.lineStyle(3, BORDER, 0.85);
  g.strokePoints(outline, true, true);
}

const SHORE_COLOR = 0x2b3a22;
const WATER = 0x1a2f38;
const RIPPLE = 0x2a4651;

/** A river, cut off where it leaves the map's outline (it runs on under the fog). */
function drawRiver(g: Phaser.GameObjects.Graphics, river: River, outline: Point[]) {
  const pts = river.points;
  const inside = pts.map((p) => insidePolygon(p, outline));
  const first = inside.indexOf(true);
  const last = inside.lastIndexOf(true);
  if (first < 0) return;
  // Find where the river crosses the edge, between a point outside and one inside.
  const edge = (out: Point, inn: Point) => {
    let [a, b] = [out, inn];
    for (let i = 0; i < 12; i++) {
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (insidePolygon(m, outline)) b = m;
      else a = m;
    }
    return b;
  };
  const line = pts.slice(first, last + 1);
  if (first > 0) line.unshift(edge(pts[first - 1]!, pts[first]!));
  if (last < pts.length - 1) line.push(edge(pts[last + 1]!, pts[last]!));
  // Thick strokes leave gaps at the bends; a circle on every corner fills them.
  const band = (width: number, color: number, alpha = 1) => {
    g.lineStyle(width, color, alpha);
    g.strokePoints(line, false);
    g.fillStyle(color, alpha);
    for (const p of line.slice(1, -1)) g.fillCircle(p.x, p.y, width / 2);
  };
  band(river.width + 12, SHORE_COLOR);
  band(river.width, WATER);
  band(river.width * 0.35, RIPPLE, 0.35);
}

/** A plank bridge with rails, running across its river. */
function drawBridge(g: Phaser.GameObjects.Graphics, b: Bridge) {
  const cos = Math.cos(b.angle);
  const sin = Math.sin(b.angle);
  const at = (along: number, across: number) => ({
    x: b.x + along * cos - across * sin,
    y: b.y + along * sin + across * cos,
  });
  const [hl, hw] = [b.length / 2, b.width / 2];
  const deck = [at(-hl, -hw), at(hl, -hw), at(hl, hw), at(-hl, hw)];
  g.fillStyle(0x111a0d, 0.5);
  g.fillPoints(
    deck.map((p) => ({ x: p.x + 4, y: p.y + 4 })),
    true,
  );
  g.fillStyle(0x5b4a33, 1);
  g.fillPoints(deck, true);
  g.lineStyle(1.5, 0x3a2f20, 0.9);
  for (let s = -hl + 6; s < hl; s += 8) {
    const [p, q] = [at(s, -hw), at(s, hw)];
    g.lineBetween(p.x, p.y, q.x, q.y);
  }
  g.lineStyle(4, 0x2e2618, 1);
  for (const side of [-hw, hw]) {
    const [p, q] = [at(-hl, side), at(hl, side)];
    g.lineBetween(p.x, p.y, q.x, q.y);
  }
}

/** A rocky mountain ridge: a dark base with a row of peaks lit from the top left. */
function drawRidge(g: Phaser.GameObjects.Graphics, ridge: Ridge) {
  const line = ridge.points;
  const band = (width: number, color: number) => {
    g.lineStyle(width, color, 1);
    g.strokePoints(line, false);
    g.fillStyle(color, 1);
    for (const p of line) g.fillCircle(p.x, p.y, width / 2);
  };
  band(ridge.width + 8, 0x1c1f17);
  band(ridge.width, 0x3a3c32);
  // Peaks every so often along the crest, alternating sizes so it reads as rock, not a pipe.
  const rng = createRng(Math.round(line[0]!.x * 31 + line[0]!.y * 17));
  const peaks: Point[] = [];
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1]!, line[i]!];
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 14));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      peaks.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  peaks.push(line[line.length - 1]!);
  for (const [i, p] of peaks.entries()) {
    const h = ridge.width * (i % 2 === 0 ? 0.42 : 0.3) * (0.8 + rng() * 0.4);
    const w = h * 0.9;
    const [x, y] = [p.x + (rng() - 0.5) * 6, p.y + h * 0.35];
    g.fillStyle(0x2b2d25, 1);
    g.fillTriangle(x, y - h, x + w, y, x, y);
    g.fillStyle(0x56584b, 1);
    g.fillTriangle(x, y - h, x - w, y, x, y);
    g.fillStyle(0x8c8e80, 1);
    g.fillTriangle(x, y - h, x - w * 0.3, y - h * 0.65, x + w * 0.25, y - h * 0.7);
  }
}

/** The tactical grid, only where it lies inside the outline. */
function drawClippedGrid(g: Phaser.GameObjects.Graphics, outline: Point[]) {
  const cell = 40;
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  // Crossings of the line `along = c` with the outline, as pairs of entry/exit points.
  const spans = (c: number, horizontal: boolean) => {
    const hits: number[] = [];
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i]!;
      const b = outline[j]!;
      const [ac, bc, ao, bo] = horizontal ? [a.y, b.y, a.x, b.x] : [a.x, b.x, a.y, b.y];
      if (ac > c !== bc > c) hits.push(ao + ((c - ac) / (bc - ac)) * (bo - ao));
    }
    return hits.sort((p, q) => p - q);
  };
  const lines = (from: number, to: number, horizontal: boolean) => {
    for (let c = Math.ceil(from / cell) * cell; c <= to; c += cell) {
      g.lineStyle(1, Math.round(c / cell) % 5 === 0 ? COLORS.gridMajor : COLORS.grid, 1);
      const hits = spans(c, horizontal);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        if (horizontal) g.lineBetween(hits[k]!, c, hits[k + 1]!, c);
        else g.lineBetween(c, hits[k]!, c, hits[k + 1]!);
      }
    }
  };
  lines(y0, y1, true);
  lines(x0, x1, false);
}

/** Low-contrast scenery so bases, units, and labels stay easy to read on top of it. */
function drawFeature(g: Phaser.GameObjects.Graphics, f: Feature) {
  const rng = createRng(f.detail);
  const cos = Math.cos(f.angle);
  const sin = Math.sin(f.angle);
  // Local (unrotated) offsets to world points, so a mirrored twin draws the same turned around.
  const at = (lx: number, ly: number) => ({
    x: f.x + lx * cos - ly * sin,
    y: f.y + lx * sin + ly * cos,
  });
  const s = f.size;
  const blob = (r: number, cx = 0, cy = 0, sides = 12, rough = 0.25) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      const rr = r * (1 - rough / 2 + rng() * rough);
      return at(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
    });

  switch (f.kind) {
    case 'forest': {
      const trees = Math.round((s * s) / 160);
      for (let i = 0; i < trees; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * s * 0.85;
        const p = at(Math.cos(a) * d, Math.sin(a) * d * 0.75);
        const r = 7 + rng() * 6;
        g.fillStyle(0x111a0d, 0.55);
        g.fillCircle(p.x + 3, p.y + 3, r);
        g.fillStyle(rng() < 0.5 ? 0x24361c : 0x2a3d20, 1);
        g.fillCircle(p.x, p.y, r);
      }
      return;
    }
    case 'rocks': {
      const count = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < count; i++) {
        const cx = (rng() - 0.5) * s * 1.2;
        const cy = (rng() - 0.5) * s * 0.9;
        const r = 5 + rng() * s * 0.3;
        const pts = blob(r, cx, cy, 6, 0.5);
        g.fillStyle(0x30352a, 1);
        g.fillPoints(pts, true);
        g.lineStyle(1.5, 0x161a12, 0.7);
        g.strokePoints(pts, true);
      }
      return;
    }
    case 'lake': {
      const shore = blob(s, 0, 0, 16, 0.3);
      g.fillStyle(0x2b3a22, 1);
      g.fillPoints(shore, true);
      const water = shore.map((p) => ({
        x: f.x + (p.x - f.x) * 0.82,
        y: f.y + (p.y - f.y) * 0.82,
      }));
      g.fillStyle(0x1a2f38, 1);
      g.fillPoints(water, true);
      g.lineStyle(2, 0x2a4651, 0.8);
      g.strokePoints(water, true);
      return;
    }
    case 'crater': {
      g.fillStyle(0x2a3321, 1);
      g.fillCircle(f.x, f.y, s);
      g.fillStyle(0x121810, 1);
      g.fillCircle(f.x, f.y, s * 0.72);
      g.lineStyle(1.5, 0x384530, 0.8);
      g.strokeCircle(f.x, f.y, s);
      return;
    }
    case 'sandbags': {
      const bags = 7;
      for (let i = 0; i < bags; i++) {
        const a = -0.9 + (i / (bags - 1)) * 1.8;
        const p = at(Math.sin(a) * s, -Math.cos(a) * s * 0.5 + s * 0.25);
        g.fillStyle(0x4a4532, 0.9);
        g.fillCircle(p.x, p.y, 6.5);
        g.lineStyle(1, 0x24221a, 0.8);
        g.strokeCircle(p.x, p.y, 6.5);
      }
      return;
    }
    case 'traps': {
      g.lineStyle(3, 0x40443a, 0.9);
      for (let row = 0; row < 2; row++) {
        for (let col = -1; col <= 1; col++) {
          const c = at(col * s * 0.6 + row * s * 0.3, (row - 0.5) * s * 0.7);
          g.lineBetween(c.x - 6, c.y - 6, c.x + 6, c.y + 6);
          g.lineBetween(c.x - 6, c.y + 6, c.x + 6, c.y - 6);
        }
      }
      return;
    }
  }
}
