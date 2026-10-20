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
      scene.add.text(0, height * 0.24, sublabel, textStyle(20, COLORS.textDim)).setOrigin(0.5),
    );
  }

  const container = scene.add.container(x, y, parts);
  container.setSize(width, height);
  container.setInteractive({ useHandCursor: true });
  container.on('pointerover', () => draw(true));
  container.on('pointerout', () => draw(false));
  container.on('pointerup', opts.onClick);
  return container;
}
