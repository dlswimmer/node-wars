import type Phaser from 'phaser';

/**
 * Device pixel ratio the canvas renders at, so phones and iPads get sharp graphics.
 * Capped because very high ratios cost a lot of fill rate for little visible gain.
 */
export const DPR = Math.min(window.devicePixelRatio || 1, 2.5);

/** Size of the area the game fills, in CSS pixels. */
export function hostSize(): { width: number; height: number } {
  const el = document.getElementById('game');
  return {
    width: el?.clientWidth || window.innerWidth,
    height: el?.clientHeight || window.innerHeight,
  };
}

/** Canvas size in CSS pixels (the canvas itself is DPR times larger). */
export function cssSize(scene: Phaser.Scene): { width: number; height: number } {
  return { width: scene.scale.width / DPR, height: scene.scale.height / DPR };
}

/** Convert a size in CSS pixels to world units for a camera at the given zoom. */
export function cssToWorld(cssPx: number, cameraZoom: number): number {
  return (cssPx * DPR) / cameraZoom;
}
