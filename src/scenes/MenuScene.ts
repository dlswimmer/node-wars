import Phaser from 'phaser';
import { COLORS, textStyle } from '../theme';
import { drawMapGrid } from './drawing';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    const { width, height } = this.scale.gameSize;
    drawMapGrid(this.add.graphics(), width, height);

    this.add.text(width / 2, 200, 'NODE WARS', textStyle(110, COLORS.accent)).setOrigin(0.5);
    this.add
      .text(width / 2, 290, 'Capture bases. Build your army. Win the war.', textStyle(28))
      .setOrigin(0.5);

    const howTo = [
      'Drag from your BLUE base to any other base to send half your troops.',
      'Drag across several of your bases first to attack with all of them.',
      'Or tap your base, then tap the target.',
      'Factory = build faster  ·  Radar = move faster  ·  Armory = hit harder',
    ];
    this.add
      .text(width / 2, 420, howTo.join('\n'), { ...textStyle(22, COLORS.textDim), align: 'center' })
      .setOrigin(0.5)
      .setLineSpacing(10);

    const start = this.add.text(width / 2, 590, 'TAP TO DEPLOY', textStyle(48)).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => this.scene.start('battle'));
  }
}
