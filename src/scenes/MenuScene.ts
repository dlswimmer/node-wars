import Phaser from 'phaser';
import { DPR, cssSize } from '../display';
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

/** The menu is laid out on this design canvas, then zoomed to fit the screen. */
const DESIGN = { width: 1000, height: 600 };

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create() {
    const grid = this.add.graphics();
    drawMapGrid(grid, DESIGN.width * 3, DESIGN.height * 3);
    grid.setPosition(-DESIGN.width, -DESIGN.height);

    const cx = DESIGN.width / 2;
    this.add.text(cx, 80, 'NODE WARS', textStyle(104, COLORS.accent)).setOrigin(0.5);
    this.add
      .text(cx, 160, 'Capture bases. Build your army. Win the war!', textStyle(30))
      .setOrigin(0.5);
    this.add
      .text(cx, 225, 'Drag from your BLUE base to send troops.\nBigger army wins the fight!', {
        ...textStyle(28, COLORS.textDim),
        align: 'center',
      })
      .setOrigin(0.5)
      .setLineSpacing(6);

    this.add.text(cx, 320, 'CHOOSE YOUR RANK', textStyle(32)).setOrigin(0.5);

    const last = loadDifficulty();
    // First-timers get pointed at Recruit; returning players at what they played last.
    const highlight = last ?? 'recruit';
    DIFFICULTY_ORDER.forEach((id, i) => {
      const d = DIFFICULTIES[id];
      const x = cx + (i - 1) * 320;
      const y = 450;
      const button = addButton(this, x, y, {
        width: 290,
        height: 150,
        label: d.label,
        sublabel: d.blurb,
        color: DIFFICULTY_COLORS[id],
        labelSize: 48,
        onClick: () => {
          saveDifficulty(id);
          this.scene.start('battle', { difficulty: id });
        },
      });
      if (id === highlight) {
        const tag = last ? 'LAST PLAYED' : 'START HERE';
        this.add.text(x, y - 82, tag, textStyle(24, COLORS.accent)).setOrigin(0.5, 1);
        this.tweens.add({ targets: button, scale: 1.05, duration: 600, yoyo: true, repeat: -1 });
      }
    });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off('resize', this.layout, this),
    );
  }

  /** Zoom the design canvas to fit the screen, with a margin. */
  private layout() {
    const { width, height } = cssSize(this);
    const fit = Math.min(width / (DESIGN.width + 40), height / (DESIGN.height + 20));
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(Math.min(fit, 1.4) * DPR);
    cam.centerOn(DESIGN.width / 2, DESIGN.height / 2);
  }
}
