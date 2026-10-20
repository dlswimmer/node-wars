import type Phaser from 'phaser';
import { BASE_STATS } from '../sim/config';
import type { Base } from '../sim/types';
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
