import type Phaser from 'phaser';

/**
 * Device pixel ratio the canvas renders at, so phones and iPads get sharp graphics.
 * Capped because very high ratios cost a lot of fill rate for little visible gain.
 */
export const DPR = Math.min(window.devicePixelRatio || 1, 2.5);

/**
 * Size of the area the game fills, in CSS pixels. Never zero: a page opened in a hidden
 * tab can report 0x0, and WebGL fails to start with a zero-sized canvas.
 */
export function hostSize(): { width: number; height: number } {
  const el = document.getElementById('game');
  return {
    width: Math.max(1, el?.clientWidth || window.innerWidth),
    height: Math.max(1, el?.clientHeight || window.innerHeight),
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
