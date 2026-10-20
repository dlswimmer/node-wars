import Phaser from 'phaser';
import { DPR, cssSize } from '../display';
import { canAutoBattle, loadSave } from '../save';
import { DIFFICULTIES, DIFFICULTY_ORDER, type DifficultyId } from '../sim/difficulty';
import { MASTERY_WINS, formatMedals, medalsFor } from '../sim/upgrades';
import { loadDifficulty, saveDifficulty } from '../settings';
import { COLORS, textStyle } from '../theme';
import type { BattleData } from './BattleScene';
import { drawMapGrid } from './drawing';
import { addButton, addMuteButton } from './ui';

const DIFFICULTY_COLORS: Record<DifficultyId, number> = {
  recruit: 0x2f6b3a,
  soldier: 0x6b5a1f,
  general: 0x7a2a2a,
};

/** The menu is laid out on this design canvas, then zoomed to fit the screen. */
export const MENU_DESIGN = { width: 1000, height: 600 };

export type MenuPage = 'home' | 'quick' | 'campaign';

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
    else this.rankPicker(this.page);

    addMuteButton(this, MENU_DESIGN.width - 30, 30, 76);
    fitDesign(this);
    const relayout = () => fitDesign(this);
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
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

    const medals = formatMedals(loadSave().medals);
    addButton(this, cx - 220, 410, {
      width: 400,
      height: 180,
      label: 'CAMPAIGN',
      sublabel: `Earn medals · You have ${medals}`,
      color: 0x2f4f7a,
      labelSize: 56,
      onClick: () => this.go('campaign'),
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

  private rankPicker(page: 'quick' | 'campaign') {
    const cx = MENU_DESIGN.width / 2;
    const campaign = page === 'campaign';
    const save = loadSave();
    this.add
      .text(cx, 70, campaign ? 'CAMPAIGN' : 'QUICK BATTLE', textStyle(80, COLORS.accent))
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        135,
        campaign
          ? `Win to earn medals · You have ${formatMedals(save.medals)}`
          : 'A fair fight: no medals, no upgrades',
        textStyle(28),
      )
      .setOrigin(0.5);
    this.add.text(cx, 200, 'CHOOSE YOUR RANK', textStyle(30)).setOrigin(0.5);

    const last = loadDifficulty();
    const highlight = last ?? 'recruit';
    DIFFICULTY_ORDER.forEach((id, i) => {
      const d = DIFFICULTIES[id];
      const x = cx + (i - 1) * 320;
      const y = 320;
      const start = (data: BattleData) => {
        saveDifficulty(id);
        this.scene.start('battle', data);
      };
      const button = addButton(this, x, y, {
        width: 290,
        height: 150,
        label: d.label,
        sublabel: campaign ? `+${formatMedals(medalsFor(id, true))} per win` : d.blurb,
        color: DIFFICULTY_COLORS[id],
        labelSize: 48,
        onClick: () => start({ difficulty: id, mode: page }),
      });
      if (id === highlight) {
        const tag = last ? 'LAST PLAYED' : 'START HERE';
        this.add.text(x, y - 82, tag, textStyle(24, COLORS.accent)).setOrigin(0.5, 1);
        this.tweens.add({ targets: button, scale: 1.05, duration: 600, yoyo: true, repeat: -1 });
      }
      if (campaign) {
        const wins = Math.min(save.wins[id], MASTERY_WINS);
        const mastered = wins >= MASTERY_WINS;
        this.add
          .text(
            x,
            y + 92,
            mastered ? 'MASTERED' : `Wins ${wins}/${MASTERY_WINS} to master`,
            textStyle(22, mastered ? COLORS.accent : COLORS.textDim),
          )
          .setOrigin(0.5, 0);
        if (canAutoBattle(id)) {
          addButton(this, x, y + 150, {
            width: 220,
            height: 56,
            label: 'AUTO-BATTLE',
            color: 0x4a2f7a,
            labelSize: 26,
            onClick: () => start({ difficulty: id, mode: 'campaign', auto: true }),
          });
        }
      }
    });

    addButton(this, 110, 540, {
      width: 180,
      height: 70,
      label: 'BACK',
      labelSize: 32,
      onClick: () => this.go('home'),
    });
    if (campaign) {
      addButton(this, MENU_DESIGN.width - 160, 540, {
        width: 280,
        height: 70,
        label: 'COMMAND TENT',
        color: 0x5a4a1f,
        labelSize: 32,
        onClick: () => this.scene.start('tent'),
      });
    }
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
