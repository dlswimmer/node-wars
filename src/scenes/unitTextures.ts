import type Phaser from 'phaser';
import type { UnitKind } from '../sim/types';

/**
 * Top-down unit art, drawn in code once and baked into textures. Everything is drawn in
 * greys facing right (+x) so one texture serves every army: sprites are tinted with the
 * army's color and rotated toward where they're heading. Swap these for hand-drawn art
 * later by loading images under the same keys.
 */
export const UNIT_TEXTURE: Record<UnitKind, { key: string; width: number; height: number }> = {
  soldier: { key: 'unit-soldier', width: 40, height: 40 },
  tank: { key: 'unit-tank', width: 64, height: 48 },
  jet: { key: 'unit-jet', width: 56, height: 48 },
};

export function ensureUnitTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(UNIT_TEXTURE.soldier.key)) drawSoldier(scene);
  if (!scene.textures.exists(UNIT_TEXTURE.tank.key)) drawTank(scene);
  if (!scene.textures.exists(UNIT_TEXTURE.jet.key)) drawJet(scene);
}

function drawSoldier(scene: Phaser.Scene) {
  const { key, width, height } = UNIT_TEXTURE.soldier;
  const g = scene.make.graphics({}, false);
  // Rifle, held forward.
  g.fillStyle(0x2a2a2a).fillRect(20, 24, 19, 4);
  // Backpack.
  g.fillStyle(0x8c8c8c).fillRoundedRect(5, 12, 9, 16, 3);
  // Shoulders and arms.
  g.fillStyle(0xe6e6e6).fillEllipse(19, 20, 20, 30);
  g.lineStyle(2, 0x5a5a5a).strokeEllipse(19, 20, 20, 30);
  // Helmet.
  g.fillStyle(0xb4b4b4).fillCircle(21, 20, 8);
  g.lineStyle(2, 0x4a4a4a).strokeCircle(21, 20, 8);
  g.generateTexture(key, width, height);
  g.destroy();
}

function drawTank(scene: Phaser.Scene) {
  const { key, width, height } = UNIT_TEXTURE.tank;
  const g = scene.make.graphics({}, false);
  // Tracks with tread marks.
  for (const y of [3, 35]) {
    g.fillStyle(0x3a3a3a).fillRoundedRect(3, y, 52, 10, 3);
    g.fillStyle(0x1e1e1e);
    for (let x = 6; x < 54; x += 6) g.fillRect(x, y + 1, 2, 8);
  }
  // Hull.
  g.fillStyle(0xe0e0e0).fillRoundedRect(7, 10, 46, 28, 4);
  g.lineStyle(2, 0x5a5a5a).strokeRoundedRect(7, 10, 46, 28, 4);
  // Barrel, then turret on top of it.
  g.fillStyle(0x9a9a9a).fillRect(32, 21, 30, 6);
  g.lineStyle(1, 0x3a3a3a).strokeRect(32, 21, 30, 6);
  g.fillStyle(0xbdbdbd).fillCircle(28, 24, 11);
  g.lineStyle(2, 0x4a4a4a).strokeCircle(28, 24, 11);
  g.fillStyle(0x8a8a8a).fillCircle(25, 24, 3);
  g.generateTexture(key, width, height);
  g.destroy();
}

function drawJet(scene: Phaser.Scene) {
  const { key, width, height } = UNIT_TEXTURE.jet;
  const g = scene.make.graphics({}, false);
  // Swept wings and tail fins, then the body and cockpit on top.
  g.fillStyle(0xb0b0b0);
  g.fillTriangle(30, 24, 14, 3, 20, 24);
  g.fillTriangle(30, 24, 14, 45, 20, 24);
  g.fillTriangle(10, 24, 2, 13, 6, 24);
  g.fillTriangle(10, 24, 2, 35, 6, 24);
  g.lineStyle(1.5, 0x4a4a4a);
  g.strokeTriangle(30, 24, 14, 3, 20, 24);
  g.strokeTriangle(30, 24, 14, 45, 20, 24);
  g.fillStyle(0xe6e6e6).fillEllipse(28, 24, 50, 11);
  g.lineStyle(2, 0x5a5a5a).strokeEllipse(28, 24, 50, 11);
  g.fillStyle(0x3a4a5a).fillEllipse(40, 24, 12, 6);
  g.generateTexture(key, width, height);
  g.destroy();
}
