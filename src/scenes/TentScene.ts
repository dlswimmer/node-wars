import Phaser from 'phaser';
import { sfx } from '../audio';
import { buyUpgrade, loadSave } from '../save';
import { ADJUTANT_LEVELS, UPGRADES, formatMedals, nextCost } from '../sim/upgrades';
import { COLORS, textStyle } from '../theme';
import { drawMapGrid } from './drawing';
import { MENU_DESIGN, fitDesign } from './MenuScene';
import { addButton, addMuteButton } from './ui';

/** The Command Tent: spend medals on permanent upgrades for campaign battles. */
export class TentScene extends Phaser.Scene {
  constructor() {
    super('tent');
  }

  create() {
    const grid = this.add.graphics();
    drawMapGrid(grid, MENU_DESIGN.width * 3, MENU_DESIGN.height * 3);
    grid.setPosition(-MENU_DESIGN.width, -MENU_DESIGN.height);

    const save = loadSave();
    const cx = MENU_DESIGN.width / 2;
    this.add.text(cx, 45, 'COMMAND TENT', textStyle(64, COLORS.accent)).setOrigin(0.5);
    this.add
      .text(cx, 95, `You have ${formatMedals(save.medals)} medals`, textStyle(28))
      .setOrigin(0.5);

    UPGRADES.forEach((u, i) => {
      const y = 150 + i * 66;
      const level = save.upgrades[u.id];
      const max = u.costs.length;
      const cost = nextCost(save.upgrades, u.id);
      const pips = '■'.repeat(level) + '□'.repeat(max - level);
      // The Adjutant describes the duty its next level adds; others describe one level.
      const detail =
        u.id === 'adjutant'
          ? (ADJUTANT_LEVELS[Math.min(level, max - 1)] ?? '')
          : `${u.perLevel} per level`;

      this.add.text(40, y - 20, u.name, textStyle(30)).setOrigin(0, 0);
      this.add.text(290, y - 18, pips, textStyle(26, COLORS.accent)).setOrigin(0, 0);
      this.add
        .text(40, y + 12, u.id === 'adjutant' && level >= max ? 'All duties learned' : detail, {
          ...textStyle(20, COLORS.textDim),
        })
        .setOrigin(0, 0);

      if (cost === null) {
        this.add.text(870, y, 'MAXED', textStyle(30, COLORS.accent)).setOrigin(0.5);
      } else {
        const affordable = save.medals >= cost - 1e-9;
        addButton(this, 870, y, {
          width: 220,
          height: 54,
          label: `${formatMedals(cost)} MEDAL${cost > 1 ? 'S' : ''}`,
          color: affordable ? 0x2f6b3a : 0x3a3a3a,
          labelSize: 26,
          onClick: () => {
            if (buyUpgrade(u.id)) {
              sfx.capture();
              this.scene.restart();
            } else {
              sfx.failed();
            }
          },
        });
      }
    });

    addButton(this, 110, 560, {
      width: 180,
      height: 64,
      label: 'BACK',
      labelSize: 32,
      onClick: () => this.scene.start('menu', { page: 'campaign' }),
    });
    addMuteButton(this, MENU_DESIGN.width - 30, 30, 76);

    fitDesign(this);
    const relayout = () => fitDesign(this);
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
  }
}
