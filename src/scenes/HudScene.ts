import Phaser from 'phaser';
import { DPR, cssSize } from '../display';
import { countBases, isShielded } from '../sim/world';
import { COLORS, textStyle } from '../theme';
import type { BattleScene } from './BattleScene';
import { addButton, addMuteButton, makePressable, uiZoom } from './ui';

const PERK_WORDS: Record<string, string> = {
  factory: 'FAST BUILD + TANKS',
  radar: 'FAST TROOPS',
  armory: 'STRONG TROOPS',
};

const DEFEAT_TIPS = [
  'Tip: grab the gray bases near you first!',
  'Tip: a green ring means your attack will win.',
  'Tip: drag across two of your bases to attack with both!',
  'Tip: hold the Factory and your army grows faster.',
  'Tip: a red ring around your base means help it fast!',
];

/**
 * Screen-space overlay for a battle: status, pause button, pause menu and the
 * victory/defeat screen. Lives in its own scene so the battlefield camera's zoom never
 * changes its size.
 */
export class HudScene extends Phaser.Scene {
  private battle!: BattleScene;
  private status!: Phaser.GameObjects.Text;
  private perks!: Phaser.GameObjects.Text;
  private shieldBar!: Phaser.GameObjects.Graphics;
  private pauseButton!: Phaser.GameObjects.Container;
  private muteButton!: Phaser.GameObjects.Container;
  private pauseIcon!: Phaser.GameObjects.Graphics;
  private pauseMenu!: Phaser.GameObjects.Container;
  private pauseShade!: Phaser.GameObjects.Rectangle;
  private pauseItems: Phaser.GameObjects.GameObject[] = [];
  private endScreen?: Phaser.GameObjects.Container;
  private endButtonsReady = false;
  private won = false;
  private tip = '';

  constructor() {
    super('hud');
  }

  create() {
    this.battle = this.scene.get('battle') as BattleScene;
    this.endScreen = undefined;
    this.endButtonsReady = false;
    this.cameras.main.setOrigin(0, 0);

    this.status = this.add.text(20, 14, '', textStyle(28)).setLineSpacing(2);
    this.shieldBar = this.add.graphics();
    this.perks = this.add.text(20, 0, '', textStyle(20, COLORS.accent)).setOrigin(0, 1);
    this.pauseButton = this.createPauseButton();
    this.muteButton = addMuteButton(this, 0, 0).setDepth(110);
    this.pauseMenu = this.createPauseMenu();

    const onPause = (paused: boolean) => {
      this.pauseMenu.setVisible(paused);
      this.drawPauseIcon(paused);
    };
    const onGameOver = (won: boolean) => this.showEndScreen(won);
    this.battle.events.on('pause-changed', onPause);
    this.battle.events.on('game-over', onGameOver);
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.battle.events.off('pause-changed', onPause);
      this.battle.events.off('game-over', onGameOver);
      this.scale.off('resize', this.layout, this);
    });
    this.layout();
  }

  /** True if the pointer is over a HUD control, so the battlefield should ignore it. */
  isOverUi(pointer: Phaser.Input.Pointer): boolean {
    return this.scene.isActive() && this.input.hitTestPointer(pointer).length > 0;
  }

  update() {
    const w = this.battle.world;
    if (!w) return;
    const playing = !this.battle.gameOver;
    this.status.setVisible(playing);
    this.perks.setVisible(playing);
    this.shieldBar.clear();
    if (!playing) return;

    const shieldLeft = isShielded(w, 'player') ? w.shieldUntil.player - w.time : 0;
    const lines = [`BASES ${countBases(w, 'player')} / ${w.bases.length}`];
    if (shieldLeft > 0) lines.push(`SHIELD ${Math.ceil(shieldLeft)}`);
    this.status.setText(lines.join('\n'));

    if (shieldLeft > 0) {
      const fraction = shieldLeft / w.shieldUntil.player;
      const y = this.status.y + this.status.height + 4;
      this.shieldBar.fillStyle(0x000000, 0.5).fillRoundedRect(20, y, 180, 12, 6);
      this.shieldBar.fillStyle(COLORS.shield, 1).fillRoundedRect(20, y, 180 * fraction, 12, 6);
    }

    const held = new Set<string>(w.bases.filter((b) => b.owner === 'player').map((b) => b.kind));
    this.perks.setText(
      Object.entries(PERK_WORDS)
        .filter(([kind]) => held.has(kind))
        .map(([, words]) => words)
        .join('   '),
    );
  }

  /** Virtual canvas size for the HUD (screen size divided by the HUD zoom). */
  private view() {
    const css = cssSize(this);
    const zoom = uiZoom(css.width, css.height);
    return { zoom, width: css.width / zoom, height: css.height / zoom };
  }

  private layout() {
    const v = this.view();
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(v.zoom * DPR);
    cam.setScroll(0, 0);

    this.pauseButton.setPosition(v.width - 62, 62);
    this.muteButton.setPosition(v.width - 172, 62);
    // One short line hugging the bottom edge, below the bottom-row base labels.
    this.perks.setPosition(20, v.height - 6);
    this.pauseShade.setSize(v.width, v.height);
    this.layoutColumn(this.pauseItems, v);
    if (this.endScreen) this.buildEndScreen();
  }

  /** Stack items down the middle of the screen. */
  private layoutColumn(
    items: Phaser.GameObjects.GameObject[],
    v: { width: number; height: number },
  ) {
    const gap = Math.min(105, (v.height - 60) / (items.length + 0.5));
    const top = v.height / 2 - (gap * (items.length - 1)) / 2;
    items.forEach((item, i) => {
      (item as Phaser.GameObjects.Container).setPosition(v.width / 2, top + i * gap);
    });
  }

  private createPauseButton() {
    const size = 96;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.5);
    bg.fillRoundedRect(-size / 2, -size / 2, size, size, 16);
    bg.lineStyle(3, 0xffffff, 0.35);
    bg.strokeRoundedRect(-size / 2, -size / 2, size, size, 16);
    this.pauseIcon = this.add.graphics();
    this.drawPauseIcon(false);
    const button = this.add.container(0, 0, [bg, this.pauseIcon]).setSize(size, size).setDepth(110);
    makePressable(button, () => this.battle.togglePause());
    return button;
  }

  /** Two bars while playing; a "play" triangle while paused. */
  private drawPauseIcon(paused: boolean) {
    const g = this.pauseIcon;
    g.clear();
    g.fillStyle(0xffffff, 0.95);
    if (paused) {
      g.fillTriangle(-14, -24, -14, 24, 24, 0);
    } else {
      g.fillRect(-20, -24, 14, 48);
      g.fillRect(6, -24, 14, 48);
    }
  }

  private createPauseMenu() {
    // The shade swallows taps so nothing reaches the battlefield while paused.
    this.pauseShade = this.add
      .rectangle(0, 0, 10, 10, 0x000000, 0.65)
      .setOrigin(0)
      .setInteractive();
    const opts = { width: 380, height: 88, labelSize: 40 };
    const subtitle = `${this.battle.level.name.toUpperCase()}  ·  ${this.battle.difficulty.label}`;
    this.pauseItems = [
      this.add.text(0, 0, 'PAUSED', textStyle(80)).setOrigin(0.5),
      this.add.text(0, 0, subtitle, textStyle(28, COLORS.textDim)).setOrigin(0.5),
      addButton(this, 0, 0, {
        ...opts,
        label: 'RESUME',
        color: 0x2f6b3a,
        onClick: () => this.battle.togglePause(),
      }),
      addButton(this, 0, 0, {
        ...opts,
        label: 'RESTART',
        onClick: () => this.battle.restartBattle(),
      }),
      addButton(this, 0, 0, {
        ...opts,
        label: 'CHANGE RANK',
        onClick: () => this.battle.toMenu(),
      }),
    ];
    return this.add
      .container(0, 0, [this.pauseShade, ...this.pauseItems])
      .setDepth(100)
      .setVisible(false);
  }

  private showEndScreen(won: boolean) {
    this.won = won;
    this.tip = DEFEAT_TIPS[Math.floor(Math.random() * DEFEAT_TIPS.length)]!;
    this.pauseButton.setVisible(false);
    this.muteButton.setVisible(false);
    this.pauseMenu.setVisible(false);
    this.buildEndScreen(true);
    if (won) this.confetti();
    // Short delay so a tap that was already in progress can't hit a button by accident.
    this.time.delayedCall(900, () => {
      this.endButtonsReady = true;
      this.buildEndScreen();
    });
  }

  /** (Re)build the end screen for the current screen size. */
  private buildEndScreen(animate = false) {
    this.endScreen?.destroy();
    const v = this.view();
    const won = this.won;
    const shade = this.add.rectangle(0, 0, v.width, v.height, 0x000000, 0.6).setOrigin(0);
    shade.setInteractive();
    const titleY = v.height * 0.24;
    const title = this.add
      .text(
        v.width / 2,
        titleY,
        won ? 'VICTORY!' : 'DEFEAT',
        textStyle(120, won ? COLORS.accent : '#ff6b6b'),
      )
      .setOrigin(0.5);
    const time = Math.round(this.battle.world.time);
    const clock = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
    const detail = this.add
      .text(
        v.width / 2,
        titleY + 80,
        won ? `${this.battle.difficulty.label}  ·  ${clock}` : this.tip,
        {
          ...textStyle(32),
          align: 'center',
          wordWrap: { width: v.width - 60 },
        },
      )
      .setOrigin(0.5, 0);

    const parts: Phaser.GameObjects.GameObject[] = [shade, title, detail];
    if (this.endButtonsReady) {
      // Side by side when there's room, stacked on narrow (portrait) screens.
      const narrow = v.width < 820;
      const buttonW = Math.min(360, v.width - 60);
      const y = narrow
        ? Math.min(titleY + 230, v.height - 180)
        : Math.min(titleY + 250, v.height - 70);
      const spots: [[number, number], [number, number]] = narrow
        ? [
            [v.width / 2, y],
            [v.width / 2, y + 110],
          ]
        : [
            [v.width / 2 - 200, y],
            [v.width / 2 + 200, y],
          ];
      parts.push(
        addButton(this, spots[0][0], spots[0][1], {
          width: buttonW,
          height: 96,
          label: 'PLAY AGAIN',
          color: 0x2f6b3a,
          onClick: () => this.battle.restartBattle(),
        }),
        addButton(this, spots[1][0], spots[1][1], {
          width: buttonW,
          height: 96,
          label: 'CHANGE RANK',
          onClick: () => this.battle.toMenu(),
        }),
      );
    }
    this.endScreen = this.add.container(0, 0, parts).setDepth(120);
    if (animate) {
      title.setScale(0.3);
      this.tweens.add({ targets: title, scale: 1, duration: 450, ease: 'Back.easeOut' });
    }
  }

  private confetti() {
    const v = this.view();
    const colors = [0x3d8bfd, 0xf2c94c, 0x4cd964, 0xffffff, 0xff8a3d];
    for (let i = 0; i < 90; i++) {
      const piece = this.add
        .rectangle(
          Math.random() * v.width,
          -20 - Math.random() * v.height * 0.5,
          10 + Math.random() * 8,
          6 + Math.random() * 6,
          colors[i % colors.length],
        )
        .setDepth(130)
        .setAngle(Math.random() * 360);
      this.tweens.add({
        targets: piece,
        y: v.height + 40,
        x: piece.x + (Math.random() - 0.5) * 200,
        angle: piece.angle + 360 + Math.random() * 360,
        duration: 1800 + Math.random() * 1600,
        ease: 'Sine.easeIn',
        onComplete: () => piece.destroy(),
      });
    }
  }
}
