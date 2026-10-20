import Phaser from 'phaser';
import { COLORS, textStyle } from '../theme';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  sublabel?: string;
  color?: number;
  labelSize?: number;
  onClick: () => void;
}

/**
 * Make a container behave like a button: it fires only when the press both starts and ends
 * on it, so a drag that happens to end on a button (or a tap that started before the button
 * appeared) doesn't trigger it.
 */
export function makePressable(
  target: Phaser.GameObjects.Container,
  onClick: () => void,
  onHover?: (hover: boolean) => void,
) {
  let pressed = false;
  target.setInteractive({ useHandCursor: true });
  target.on('pointerdown', () => {
    pressed = true;
    onHover?.(true);
  });
  target.on('pointerover', () => onHover?.(true));
  target.on('pointerout', () => {
    pressed = false;
    onHover?.(false);
  });
  target.on('pointerup', () => {
    const fire = pressed;
    pressed = false;
    onHover?.(false);
    if (fire) onClick();
  });
}

/** A large, touch-friendly button: a rounded panel with a label and optional sublabel. */
export function addButton(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
  const { width, height, label, sublabel, color = 0x3a4a30, labelSize = 36 } = opts;
  const bg = scene.add.graphics();
  const draw = (hover: boolean) => {
    bg.clear();
    bg.fillStyle(color, hover ? 1 : 0.85);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 16);
    bg.lineStyle(4, hover ? 0xffffff : 0x000000, hover ? 0.9 : 0.5);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
  };
  draw(false);

  const parts: Phaser.GameObjects.GameObject[] = [bg];
  const labelY = sublabel ? -height * 0.14 : 0;
  parts.push(scene.add.text(0, labelY, label, textStyle(labelSize)).setOrigin(0.5));
  if (sublabel) {
    parts.push(
      scene.add.text(0, height * 0.24, sublabel, textStyle(24, COLORS.textDim)).setOrigin(0.5),
    );
  }

  const container = scene.add.container(x, y, parts);
  container.setSize(width, height);
  makePressable(container, opts.onClick, draw);
  return container;
}

/**
 * Size of a virtual canvas that keeps UI readable: on small screens UI is drawn at a
 * smaller zoom than the battlefield would need, but never so small that text is unreadable.
 */
export function uiZoom(screenWidth: number, screenHeight: number, designW = 1280, designH = 720) {
  const fit = Math.min(screenWidth / designW, screenHeight / designH);
  return Phaser.Math.Clamp(fit, 0.62, 1.25);
}
