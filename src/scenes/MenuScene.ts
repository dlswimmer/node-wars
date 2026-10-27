import Phaser from 'phaser';
import { DPR, cssSize } from '../display';
import { loadSave } from '../save';
import { medalSummary } from '../sim/economy';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from '../sim/difficulty';
import { loadDifficulty, loadFreeForAll, saveDifficulty, saveFreeForAll } from '../settings';
import { COLORS, textStyle } from '../theme';
import type { BattleData } from './BattleScene';
import { drawMapGrid } from './drawing';
import { addButton, addMuteButton, makePressable } from './ui';

const DIFFICULTY_COLORS: Record<DifficultyId, number> = {
  recruit: 0x2f6b3a,
  corporal: 0x4f6b2a,
  soldier: 0x6b5a1f,
  general: 0x7a2a2a,
  marshal: 0x5a1f4a,
};

/** The menu is laid out on this design canvas, then zoomed to fit the screen. */
export const MENU_DESIGN = { width: 1000, height: 600 };

export type MenuPage = 'home' | 'quick';

export class MenuScene extends Phaser.Scene {
  private page: MenuPage = 'home';

  constructor() {
    super('menu');
  }

  init(data: { page?: MenuPage }) {
    this.page = data.page ?? 'home';
  }

  create() {
    const grid = this.add.graphics();
    drawMapGrid(grid, MENU_DESIGN.width * 3, MENU_DESIGN.height * 3);
    grid.setPosition(-MENU_DESIGN.width, -MENU_DESIGN.height);

    if (this.page === 'home') this.home();
    else this.rankPicker();

    addMuteButton(this, MENU_DESIGN.width - 30, 30, 76);
    if (this.page === 'home') this.addSettingsButton(MENU_DESIGN.width - 120, 30, 76);
    fitDesign(this);
    const relayout = () => fitDesign(this);
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
  }

  /** A gear button that opens Settings. */
  private addSettingsButton(x: number, y: number, size: number) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(-size / 2, -size / 2, size, size, 16);
    g.lineStyle(3, 0xffffff, 0.35).strokeRoundedRect(-size / 2, -size / 2, size, size, 16);
    // Gear: a toothed ring around a hole.
    const teeth = 8;
    const points: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 < 2 ? 25 : 18;
      points.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    g.fillStyle(0xffffff, 0.95).fillPoints(points, true);
    g.fillStyle(0x000000, 0.8).fillCircle(0, 0, 8);
    const button = this.add.container(x, y, [g]).setSize(size, size);
    makePressable(button, () => this.scene.start('settings'));
  }

  private go(page: MenuPage) {
    this.scene.restart({ page });
  }

  private home() {
    const cx = MENU_DESIGN.width / 2;
    this.add.text(cx, 90, 'NODE WARS', textStyle(110, COLORS.accent)).setOrigin(0.5);
    this.add
      .text(cx, 175, 'Capture bases. Build your army. Win the war!', textStyle(30))
      .setOrigin(0.5);
    this.add
      .text(cx, 235, 'Drag from your BLUE base to send troops. Bigger army wins!', {
        ...textStyle(26, COLORS.textDim),
        align: 'center',
      })
      .setOrigin(0.5);

    const save = loadSave();
    addButton(this, cx - 220, 410, {
      width: 400,
      height: 180,
      label: 'CAMPAIGN',
      sublabel: medalSummary(save.medals, save.medalsEarned),
      color: 0x2f4f7a,
      labelSize: 56,
      onClick: () => this.scene.start('worldmap'),
    });
    addButton(this, cx + 220, 410, {
      width: 400,
      height: 180,
      label: 'QUICK BATTLE',
      sublabel: 'A fair fight, no upgrades',
      labelSize: 50,
      onClick: () => this.go('quick'),
    });
  }

  private rankPicker() {
    const cx = MENU_DESIGN.width / 2;
    this.add.text(cx, 70, 'QUICK BATTLE', textStyle(80, COLORS.accent)).setOrigin(0.5);
    this.add.text(cx, 135, 'A fair fight: no medals, no upgrades', textStyle(28)).setOrigin(0.5);
    this.add.text(cx, 200, 'CHOOSE YOUR RANK', textStyle(30)).setOrigin(0.5);

    const last = loadDifficulty();
    const highlight = last ?? 'recruit';
    const ffa = loadFreeForAll();
    DIFFICULTY_ORDER.forEach((id, i) => {
      const d = DIFFICULTIES[id];
      const x = cx + (i - 1) * 320;
      const y = 320;
      const button = addButton(this, x, y, {
        width: 290,
        height: 150,
        label: d.label,
        sublabel: d.blurb,
        color: DIFFICULTY_COLORS[id],
        labelSize: 48,
        onClick: () => {
          saveDifficulty(id);
          const data: BattleData = { difficulty: id, mode: 'quick', ffa };
          this.scene.start('battle', data);
        },
      });
      if (id === highlight) {
        const tag = last ? 'LAST PLAYED' : 'START HERE';
        this.add.text(x, y - 82, tag, textStyle(24, COLORS.accent)).setOrigin(0.5, 1);
        this.tweens.add({ targets: button, scale: 1.05, duration: 600, yoyo: true, repeat: -1 });
      }
    });

    // One against one, or three armies all fighting each other.
    const modes = [
      { on: false, label: '1 VS 1', sublabel: 'You against red' },
      { on: true, label: 'FREE-FOR-ALL', sublabel: '3 armies, all vs all' },
    ];
    modes.forEach((m, i) => {
      const picked = m.on === ffa;
      addButton(this, cx + (i - 0.5) * 280, 490, {
        width: 260,
        height: 90,
        label: picked ? `✔ ${m.label}` : m.label,
        sublabel: m.sublabel,
        color: picked ? 0x2f5f8a : 0x2a3324,
        labelSize: 34,
        onClick: () => {
          saveFreeForAll(m.on);
          this.go('quick');
        },
      });
    });

    addButton(this, 110, 540, {
      width: 180,
      height: 70,
      label: 'BACK',
      labelSize: 32,
      onClick: () => this.go('home'),
    });
    // Phase 2 prototype, to try out.
    addButton(this, MENU_DESIGN.width - 130, 540, {
      width: 240,
      height: 70,
      label: 'THEATER (TEST)',
      color: 0x4a2f7a,
      labelSize: 26,
      onClick: () => this.scene.start('theater'),
    });
  }
}

/** Zoom a scene's camera so the menu design canvas fits the screen, with a margin. */
export function fitDesign(scene: Phaser.Scene) {
  const { width, height } = cssSize(scene);
  const fit = Math.min(width / (MENU_DESIGN.width + 40), height / (MENU_DESIGN.height + 20));
  const cam = scene.cameras.main;
  cam.setSize(scene.scale.width, scene.scale.height);
  cam.setZoom(Math.min(fit, 1.4) * DPR);
  cam.centerOn(MENU_DESIGN.width / 2, MENU_DESIGN.height / 2);
}
