import Phaser from 'phaser';
import { isMuted, setMuted, sfx } from '../audio';
import { newWorld, resetAll } from '../save';
import { COLORS, textStyle } from '../theme';
import { drawMapGrid } from './drawing';
import { MENU_DESIGN, fitDesign } from './MenuScene';
import { addButton } from './ui';

type SettingsPage = 'main' | 'newWorld' | 'resetAll';

/** Seconds to hold the button that erases everything. */
const HOLD_SECONDS = 2;

/**
 * Settings: sound, a new world, and erasing all progress. Both resets ask again on a second
 * screen where the confirm button sits somewhere else (so a double tap lands on NO), and
 * erasing everything also needs the button held down.
 */
export class SettingsScene extends Phaser.Scene {
  private page: SettingsPage = 'main';

  constructor() {
    super('settings');
  }

  init(data: { page?: SettingsPage }) {
    this.page = data.page ?? 'main';
  }

  create() {
    const grid = this.add.graphics();
    drawMapGrid(grid, MENU_DESIGN.width * 3, MENU_DESIGN.height * 3);
    grid.setPosition(-MENU_DESIGN.width, -MENU_DESIGN.height);

    if (this.page === 'main') this.main();
    else this.confirm(this.page);

    fitDesign(this);
    const relayout = () => fitDesign(this);
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
  }

  private go(page: SettingsPage) {
    this.scene.restart({ page });
  }

  private main() {
    const cx = MENU_DESIGN.width / 2;
    this.add.text(cx, 70, 'SETTINGS', textStyle(80, COLORS.accent)).setOrigin(0.5);

    addButton(this, cx, 190, {
      width: 420,
      height: 96,
      label: isMuted() ? 'SOUND: OFF' : 'SOUND: ON',
      labelSize: 40,
      onClick: () => {
        setMuted(!isMuted());
        this.go('main');
      },
    });

    addButton(this, cx, 320, {
      width: 420,
      height: 110,
      label: 'NEW WORLD',
      sublabel: 'Medals and upgrades stay',
      color: 0x2f4f7a,
      labelSize: 42,
      onClick: () => this.go('newWorld'),
    });
    addButton(this, cx, 450, {
      width: 420,
      height: 110,
      label: 'RESET EVERYTHING',
      sublabel: 'Erase all progress',
      color: 0x7a2a2a,
      labelSize: 38,
      onClick: () => this.go('resetAll'),
    });

    addButton(this, 110, 540, {
      width: 180,
      height: 70,
      label: 'BACK',
      labelSize: 32,
      onClick: () => this.scene.start('menu'),
    });
  }

  /** Ask again. NO sits where the button you just pressed was; YES is off to one side. */
  private confirm(page: 'newWorld' | 'resetAll') {
    const cx = MENU_DESIGN.width / 2;
    const erase = page === 'resetAll';
    this.add
      .text(
        cx,
        90,
        erase ? 'ERASE ALL PROGRESS?' : 'START A NEW WORLD?',
        textStyle(64, COLORS.accent),
      )
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        170,
        erase
          ? 'Medals, upgrades and your whole map will be gone.\nThis can’t be undone.'
          : 'You get a brand new map to conquer.\nYour medals and upgrades stay.',
        { ...textStyle(28), align: 'center' },
      )
      .setOrigin(0.5);

    const backY = erase ? 450 : 320;
    addButton(this, cx, backY, {
      width: 420,
      height: 110,
      label: erase ? 'NO, KEEP IT' : 'NO, GO BACK',
      color: 0x2f6b3a,
      labelSize: 42,
      onClick: () => this.go('main'),
    });

    if (erase) {
      this.holdButton(cx, 300, 'HOLD TO ERASE', () => {
        resetAll();
        sfx.defeat();
        this.scene.start('menu');
      });
    } else {
      addButton(this, cx, 470, {
        width: 360,
        height: 90,
        label: 'YES, NEW WORLD',
        color: 0x2f4f7a,
        labelSize: 34,
        onClick: () => {
          newWorld();
          sfx.capture();
          this.scene.start('worldmap');
        },
      });
    }
  }

  /** A button that only fires after being held down; letting go early cancels. */
  private holdButton(x: number, y: number, label: string, onDone: () => void) {
    const width = 420;
    const height = 100;
    const bg = this.add.graphics();
    const fill = this.add.graphics();
    const draw = (progress: number) => {
      bg.clear();
      bg.fillStyle(0x7a2a2a, 0.85).fillRoundedRect(-width / 2, -height / 2, width, height, 16);
      bg.lineStyle(4, 0x000000, 0.5).strokeRoundedRect(-width / 2, -height / 2, width, height, 16);
      fill.clear();
      if (progress > 0) {
        fill.fillStyle(0xff5a5f, 0.9);
        fill.fillRoundedRect(-width / 2, -height / 2, width * progress, height, 16);
      }
    };
    draw(0);
    const text = this.add.text(0, 0, label, textStyle(38)).setOrigin(0.5);
    const button = this.add.container(x, y, [bg, fill, text]).setSize(width, height);
    button.setInteractive({ useHandCursor: true });

    let tween: Phaser.Tweens.Tween | null = null;
    const state = { progress: 0 };
    const cancel = () => {
      tween?.stop();
      tween = null;
      state.progress = 0;
      draw(0);
      text.setText(label);
    };
    button.on('pointerdown', () => {
      cancel();
      text.setText('KEEP HOLDING…');
      tween = this.tweens.add({
        targets: state,
        progress: 1,
        duration: HOLD_SECONDS * 1000,
        onUpdate: () => draw(state.progress),
        onComplete: () => {
          tween = null;
          onDone();
        },
      });
    });
    button.on('pointerup', cancel);
    button.on('pointerout', cancel);
    return button;
  }
}
