import Phaser from 'phaser';
import { DPR, cssSize } from '../display';
import { BONUS_PER_BASE } from '../sim/config';
import { countBases, isShielded } from '../sim/world';
import { COLORS, textStyle } from '../theme';
import type { BattleScene } from './BattleScene';
import { addButton, makePressable, uiZoom } from './ui';

/**
 * Screen-space overlay for a battle: status text, pause button, pause menu and the
 * victory/defeat screen. Lives in its own scene so the battlefield camera's zoom never
 * changes its size.
 */
export class HudScene extends Phaser.Scene {
  private battle!: BattleScene;
  private status!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Container;
  private pauseMenu!: Phaser.GameObjects.Container;
  private pauseShade!: Phaser.GameObjects.Rectangle;
  private pauseItems: Phaser.GameObjects.GameObject[] = [];
  private endScreen?: Phaser.GameObjects.Container;
  private won = false;

  constructor() {
    super('hud');
  }

  create() {
    this.battle = this.scene.get('battle') as BattleScene;
    this.endScreen = undefined;
    const cam = this.cameras.main;
    cam.setOrigin(0, 0);

    this.status = this.add.text(20, 14, '', textStyle(26)).setLineSpacing(4);
    this.shieldText = this.add.text(20, 0, '', textStyle(26, '#7fd6ff'));
    this.pauseButton = this.createPauseButton();
    this.pauseMenu = this.createPauseMenu();

    const onPause = (paused: boolean) => this.pauseMenu.setVisible(paused);
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
    const lines = [
      `${this.battle.level.name.toUpperCase()}  ·  ${this.battle.difficulty.label}`,
      `BASES ${countBases(w, 'player')} / ${w.bases.length}`,
    ];
    const perks = heldPerks(w.bases.filter((b) => b.owner === 'player').map((b) => b.kind));
    if (perks) lines.push(perks);
    this.status.setText(lines.join('\n'));

    const shield = isShielded(w, 'player') ? Math.ceil(w.shieldUntil.player - w.time) : 0;
    this.shieldText.setText(shield > 0 ? `YOUR SHIELD: ${shield}` : '');
    this.shieldText.setY(this.status.y + this.status.height + 2);
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
    this.pauseShade.setSize(v.width, v.height);
    this.layoutColumn(this.pauseItems, v);
    if (this.endScreen) this.showEndScreen(this.won);
  }

  /** Stack a title and buttons down the middle of the screen. */
  private layoutColumn(
    items: Phaser.GameObjects.GameObject[],
    v: { width: number; height: number },
  ) {
    const gap = Math.min(110, (v.height - 60) / (items.length + 0.5));
    const top = v.height / 2 - (gap * (items.length - 1)) / 2;
    items.forEach((item, i) => {
      (item as Phaser.GameObjects.Container).setPosition(v.width / 2, top + i * gap);
    });
  }

  private createPauseButton() {
    const size = 96;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(-size / 2, -size / 2, size, size, 16);
    g.lineStyle(3, 0xffffff, 0.35);
    g.strokeRoundedRect(-size / 2, -size / 2, size, size, 16);
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(-20, -24, 14, 48);
    g.fillRect(6, -24, 14, 48);
    const button = this.add.container(0, 0, [g]).setSize(size, size).setDepth(110);
    makePressable(button, () => this.battle.togglePause());
    return button;
  }

  private createPauseMenu() {
    // The shade swallows taps so nothing reaches the battlefield while paused.
    this.pauseShade = this.add
      .rectangle(0, 0, 10, 10, 0x000000, 0.65)
      .setOrigin(0)
      .setInteractive();
    const opts = { width: 380, height: 92, labelSize: 40 };
    this.pauseItems = [
      this.add.text(0, 0, 'PAUSED', textStyle(84)).setOrigin(0.5),
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
    const firstTime = !this.endScreen;
    this.endScreen?.destroy();
    this.pauseButton.setVisible(false);
    const v = this.view();
    const shade = this.add.rectangle(0, 0, v.width, v.height, 0x000000, 0.6).setOrigin(0);
    shade.setInteractive();
    const title = this.add
      .text(
        v.width / 2,
        v.height * 0.28,
        won ? 'VICTORY!' : 'DEFEAT',
        textStyle(120, won ? COLORS.accent : '#ff6b6b'),
      )
      .setOrigin(0.5);
    const time = Math.round(this.battle.world.time);
    const detail = this.add
      .text(
        v.width / 2,
        v.height * 0.28 + 92,
        `${this.battle.difficulty.label}  ·  ${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`,
        textStyle(34),
      )
      .setOrigin(0.5);
    const buttons = this.add.container(0, 0).setVisible(false);
    const y = Math.min(v.height - 70, v.height * 0.28 + 230);
    buttons.add([
      addButton(this, v.width / 2 - 200, y, {
        width: 360,
        height: 96,
        label: 'PLAY AGAIN',
        color: 0x2f6b3a,
        onClick: () => this.battle.restartBattle(),
      }),
      addButton(this, v.width / 2 + 200, y, {
        width: 360,
        height: 96,
        label: 'CHANGE RANK',
        onClick: () => this.battle.toMenu(),
      }),
    ]);
    this.endScreen = this.add.container(0, 0, [shade, title, detail, buttons]).setDepth(120);

    if (firstTime) {
      title.setScale(0.3);
      this.tweens.add({ targets: title, scale: 1, duration: 450, ease: 'Back.easeOut' });
      // Short delay so a tap that was already in progress can't hit a button by accident.
      this.time.delayedCall(900, () => buttons.setVisible(true));
    } else {
      buttons.setVisible(true);
    }
  }
}

/** Plain-words summary of the bonuses from special bases the player holds. */
function heldPerks(kinds: string[]): string {
  const count = (k: string) => kinds.filter((x) => x === k).length;
  const parts: string[] = [];
  const f = count('factory');
  const r = count('radar');
  const a = count('armory');
  if (f) parts.push(`BUILD +${Math.round(f * BONUS_PER_BASE.factory * 100)}%`);
  if (r) parts.push(`SPEED +${Math.round(r * BONUS_PER_BASE.radar * 100)}%`);
  if (a) parts.push(`ATTACK +${Math.round(a * BONUS_PER_BASE.armory * 100)}%`);
  return parts.join('   ');
}
