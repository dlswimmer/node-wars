import type Phaser from 'phaser';
import { BASE_STATS } from '../sim/config';
import { createRng } from '../sim/rng';
import type { Base, Feature, Point } from '../sim/types';
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

function star(r: number, x: number, y: number) {
  const pts: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.5;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  return pts;
}

/** Each base kind gets a distinct silhouette so it is recognisable without reading. */
export function drawBase(g: Phaser.GameObjects.Graphics, base: Base, color: number) {
  const r = BASE_STATS[base.kind].radius;
  const { x, y } = base;
  g.fillStyle(color, 1);
  g.lineStyle(3, 0x000000, 0.6);
  switch (base.kind) {
    case 'hq':
      g.fillCircle(x, y, r);
      g.strokeCircle(x, y, r);
      g.fillStyle(0xffffff, 0.25);
      g.fillPoints(star(r * 0.8, x, y), true);
      return;
    case 'barracks':
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.strokeRect(x - r, y - r, r * 2, r * 2);
      return;
    case 'outpost':
      g.fillPoints(polygon(3, r * 1.15, x, y + r * 0.15), true);
      g.strokePoints(polygon(3, r * 1.15, x, y + r * 0.15), true);
      return;
    case 'factory':
      g.fillPoints(polygon(6, r, x, y, 0), true);
      g.strokePoints(polygon(6, r, x, y, 0), true);
      return;
    case 'radar':
      g.fillCircle(x, y, r);
      g.strokeCircle(x, y, r);
      g.lineStyle(2, 0xffffff, 0.35);
      g.strokeCircle(x, y, r * 0.65);
      g.strokeCircle(x, y, r * 0.3);
      return;
    case 'armory':
      g.fillPoints(polygon(4, r * 1.2, x, y), true);
      g.strokePoints(polygon(4, r * 1.2, x, y), true);
      return;
  }
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
 * The battlefield: ground and grid inside the map's outline, scenery, a soft dark edge, and
 * fog of war everywhere outside. Drawn once when the battle starts.
 */
export function drawTerrain(
  g: Phaser.GameObjects.Graphics,
  outline: Point[],
  features: Feature[],
  area: { x: number; y: number; width: number; height: number },
) {
  const far = 4000;
  g.fillStyle(FOG, 1);
  g.fillRect(area.x - far, area.y - far, area.width + far * 2, area.height + far * 2);
  g.fillStyle(GROUND, 1);
  g.fillPoints(outline, true);
  drawClippedGrid(g, outline);
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
