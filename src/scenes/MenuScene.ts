import Phaser from 'phaser';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from '../sim/difficulty';
import { loadDifficulty, saveDifficulty } from '../settings';
import { COLORS, textStyle } from '../theme';
import { drawMapGrid } from './drawing';
import { addButton } from './ui';

const DIFFICULTY_COLORS: Record<DifficultyId, number> = {
  recruit: 0x2f6b3a,
  soldier: 0x6b5a1f,
  general: 0x7a2a2a,
};

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    const { width } = this.scale.gameSize;
    drawMapGrid(this.add.graphics(), width, this.scale.gameSize.height);

    this.add.text(width / 2, 120, 'NODE WARS', textStyle(110, COLORS.accent)).setOrigin(0.5);
    this.add
      .text(width / 2, 205, 'Capture bases. Build your army. Win the war.', textStyle(28))
      .setOrigin(0.5);

    const howTo = [
      'Drag from your BLUE base to another base to send half your troops.',
      'Or tap your base, then tap where they should go.',
      'Factory = build faster  ·  Radar = move faster  ·  Armory = hit harder',
    ];
    this.add
      .text(width / 2, 300, howTo.join('\n'), { ...textStyle(22, COLORS.textDim), align: 'center' })
      .setOrigin(0.5)
      .setLineSpacing(10);

    this.add.text(width / 2, 420, 'CHOOSE YOUR RANK', textStyle(30)).setOrigin(0.5);

    const last = loadDifficulty();
    DIFFICULTY_ORDER.forEach((id, i) => {
      const d = DIFFICULTIES[id];
      const x = width / 2 + (i - 1) * 340;
      const button = addButton(this, x, 540, {
        width: 300,
        height: 130,
        label: d.label,
        sublabel: d.blurb,
        color: DIFFICULTY_COLORS[id],
        labelSize: 44,
        onClick: () => {
          saveDifficulty(id);
          this.scene.start('battle', { difficulty: id });
        },
      });
      if (id === last) {
        this.add
          .text(x, 540 - 65 - 6, 'LAST PLAYED', textStyle(18, COLORS.accent))
          .setOrigin(0.5, 1);
        this.tweens.add({ targets: button, scale: 1.05, duration: 600, yoyo: true, repeat: -1 });
      }
    });
  }
}
