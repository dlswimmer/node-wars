import Phaser from 'phaser';
import { DPR, cssSize } from '../display';
import { medalCount } from '../sim/economy';
import { countBases, isShielded } from '../sim/world';
import { ARMY_NAMES, COLORS, FACTION_COLORS, textStyle } from '../theme';
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
  'Tip: a Bunker needs twice the troops. Tanks hit it hard!',
  'Tip: fight near your Hospital to get troops back.',
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
  private adjutantButton!: Phaser.GameObjects.Container;
  private adjutantLabel!: Phaser.GameObjects.Text;
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
    this.showPersonalities();
    this.shieldBar = this.add.graphics();
    this.perks = this.add.text(20, 0, '', textStyle(20, COLORS.accent)).setOrigin(0, 1);
    this.pauseButton = this.createPauseButton();
    this.muteButton = addMuteButton(this, 0, 0).setDepth(110);
    this.adjutantButton = this.createAdjutantButton();
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

  /**
   * Announce how each enemy army likes to fight ("RED IS A RUSHER"), in its colour, for a few
   * seconds at the start. Steady enemies (the easy ranks) aren't announced.
   */
  private showPersonalities() {
    const lines = this.battle.ais.filter((ai) => ai.personality.id !== 'steady');
    if (lines.length === 0) return;
    const v = this.view();
    const top = v.height * 0.3;
    const texts: Phaser.GameObjects.GameObject[] = lines.flatMap((ai, i) => {
      const y = top + i * 92;
      const color = '#' + FACTION_COLORS[ai.army].toString(16).padStart(6, '0');
      const name = ARMY_NAMES[ai.army];
      return [
        this.add.text(v.width / 2, y, `${name} IS A ${ai.personality.label}`, textStyle(44, color)),
        this.add.text(v.width / 2, y + 44, ai.personality.blurb, textStyle(26)),
      ].map((t) => t.setOrigin(0.5).setDepth(50));
    });
    // A dark panel behind, so the lines read over a busy battlefield.
    const panel = this.add
      .rectangle(
        v.width / 2,
        top + (lines.length * 92 - 92) / 2 + 20,
        760,
        lines.length * 92 + 30,
        0x000000,
        0.55,
      )
      .setDepth(49);
    texts.push(panel);
    this.tweens.add({
      targets: texts,
      alpha: 0,
      delay: 4500,
      duration: 800,
      onComplete: () => {
        for (const t of texts) t.destroy();
      },
    });
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
    const adj = this.battle.adjutantStatus();
    if (adj === 'auto') lines.push('AUTO-BATTLE');
    else if (adj === 'waiting') lines.push('ADJUTANT: waiting for your orders');
    this.adjutantButton.setVisible(adj !== null && adj !== 'auto');
    if (adj && adj !== 'auto') {
      this.adjutantLabel.setColor(adj === 'off' ? '#777777' : '#c9b3ff');
    }
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
    this.adjutantButton.setPosition(v.width - 282, 62);
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

  /** "OPERATION THUNDER  ·  MAP #48213", so a fun map can be found again. */
  private mapLabel(): string {
    const { name, seed } = this.battle.level;
    return seed === undefined ? name.toUpperCase() : `${name.toUpperCase()}  ·  MAP #${seed}`;
  }

  /** Campaign end-screen text: rank and time, plus medals earned. */
  private endDetail(won: boolean, clock: string): string {
    const line = won ? `${this.battle.rankLabel()}  ·  ${clock}` : this.tip;
    if (this.battle.mode !== 'campaign') return line;
    const r = this.battle.reward;
    const medals = r > 0 ? `+${medalCount(r).toUpperCase()}` : 'No medals this time';
    return `${line}
${medals}`;
  }

  /** "A" button that switches the helping Adjutant on and off. */
  private createAdjutantButton() {
    const size = 96;
    const bg = this.add.graphics();
    bg.fillStyle(0x2a1d4a, 0.8).fillRoundedRect(-size / 2, -size / 2, size, size, 16);
    bg.lineStyle(3, 0xa77bff, 0.8).strokeRoundedRect(-size / 2, -size / 2, size, size, 16);
    this.adjutantLabel = this.add.text(0, 0, 'A', textStyle(52, '#c9b3ff')).setOrigin(0.5);
    const button = this.add
      .container(0, 0, [bg, this.adjutantLabel])
      .setSize(size, size)
      .setDepth(110)
      .setVisible(false);
    makePressable(button, () => this.battle.toggleAdjutant());
    return button;
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
    const subtitle = `${this.mapLabel()}  ·  ${this.battle.rankLabel()}`;
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
        label: this.battle.mode === 'campaign' ? 'WORLD MAP' : 'CHANGE RANK',
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
    this.adjutantButton.setVisible(false);
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
      .text(v.width / 2, titleY + 80, this.endDetail(won, clock), {
        ...textStyle(32),
        align: 'center',
        wordWrap: { width: v.width - 60 },
      })
      .setOrigin(0.5, 0);

    const map = this.add
      .text(v.width / 2, Math.max(30, titleY - 95), this.mapLabel(), textStyle(28, COLORS.textDim))
      .setOrigin(0.5);

    const parts: Phaser.GameObjects.GameObject[] = [shade, map, title, detail];
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
      // In the campaign a win leads back to the world map to see what it revealed.
      const onward = this.battle.mode === 'campaign' && this.won;
      const again = {
        label: this.battle.mode === 'campaign' && !this.won ? 'TRY AGAIN' : 'PLAY AGAIN',
        onClick: () => this.battle.restartBattle(),
      };
      const leave = {
        label:
          this.battle.mode === 'campaign' ? (onward ? 'CONTINUE' : 'WORLD MAP') : 'CHANGE RANK',
        onClick: () => this.battle.toMenu(),
      };
      const [first, second] = onward ? [leave, again] : [again, leave];
      parts.push(
        addButton(this, spots[0][0], spots[0][1], {
          width: buttonW,
          height: 96,
          color: 0x2f6b3a,
          ...first,
        }),
        addButton(this, spots[1][0], spots[1][1], { width: buttonW, height: 96, ...second }),
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
