import Phaser from 'phaser';
import { sfx } from '../audio';
import { buyUpgrade, loadSave } from '../save';
import { medalCount, medalSummary } from '../sim/economy';
import { ADJUTANT_LEVELS, UPGRADES, nextCost, type UpgradeTab } from '../sim/upgrades';
import { COLORS, textStyle } from '../theme';
import { drawMapGrid } from './drawing';
import { MENU_DESIGN, fitDesign } from './MenuScene';
import { addButton, addMuteButton } from './ui';

/** The Command Tent: spend medals on permanent upgrades for campaign battles. */
export class TentScene extends Phaser.Scene {
  /** Which page of upgrades is showing. */
  private tab: UpgradeTab = 'army';

  constructor() {
    super('tent');
  }

  init(data: { tab?: UpgradeTab }) {
    this.tab = data.tab ?? 'army';
  }

  create() {
    const grid = this.add.graphics();
    drawMapGrid(grid, MENU_DESIGN.width * 3, MENU_DESIGN.height * 3);
    grid.setPosition(-MENU_DESIGN.width, -MENU_DESIGN.height);

    const save = loadSave();
    const cx = MENU_DESIGN.width / 2;
    this.add.text(cx, 40, 'COMMAND TENT', textStyle(60, COLORS.accent)).setOrigin(0.5);
    this.add
      .text(cx, 88, `You have ${medalSummary(save.medals, save.medalsEarned)}`, textStyle(28))
      .setOrigin(0.5);

    // Two pages, so every upgrade gets a readable row on a phone.
    const tabs: { id: UpgradeTab; label: string }[] = [
      { id: 'army', label: 'ARMY' },
      { id: 'bases', label: 'BASES & GEAR' },
    ];
    tabs.forEach((t, i) => {
      addButton(this, cx + (i - 0.5) * 250, 132, {
        width: 230,
        height: 48,
        label: t.label,
        color: t.id === this.tab ? 0x2f5f8a : 0x2a3324,
        labelSize: 26,
        onClick: () => this.scene.restart({ tab: t.id }),
      });
    });

    UPGRADES.filter((u) => u.tab === this.tab).forEach((u, i) => {
      const y = 190 + i * 56;
      const level = save.upgrades[u.id];
      const max = u.costs.length;
      const cost = nextCost(save.upgrades, u.id);
      const pips = '■'.repeat(level) + '□'.repeat(max - level);
      // What you have now and what the next level brings; the Adjutant names its next duty.
      let detail: string;
      if (u.id === 'adjutant') {
        detail = level >= max ? 'All duties learned' : (ADJUTANT_LEVELS[level] ?? '');
      } else if (level === 0) {
        detail = `Next: ${u.total(1)}`;
      } else if (level >= max) {
        detail = `Now: ${u.total(level)} (max)`;
      } else {
        detail = `Now: ${u.total(level)}  ·  Next: ${u.total(level + 1)}`;
      }

      this.add.text(40, y - 24, u.name, textStyle(26)).setOrigin(0, 0);
      this.add.text(290, y - 22, pips, textStyle(24, COLORS.accent)).setOrigin(0, 0);
      this.add.text(40, y + 4, detail, textStyle(22, COLORS.text)).setOrigin(0, 0);

      if (cost === null) {
        this.add.text(870, y, 'MAXED', textStyle(30, COLORS.accent)).setOrigin(0.5);
      } else {
        const affordable = save.medals >= cost;
        addButton(this, 870, y, {
          width: 220,
          height: 50,
          label: medalCount(cost).toUpperCase(),
          color: affordable ? 0x2f6b3a : 0x3a3a3a,
          labelSize: 26,
          onClick: () => {
            if (buyUpgrade(u.id)) {
              sfx.capture();
              this.scene.restart({ tab: this.tab });
            } else {
              sfx.failed();
            }
          },
        });
      }
    });

    addButton(this, 110, 562, {
      width: 180,
      height: 56,
      label: 'BACK',
      labelSize: 32,
      onClick: () => this.scene.start('worldmap'),
    });
    addMuteButton(this, MENU_DESIGN.width - 30, 30, 76);

    fitDesign(this);
    const relayout = () => fitDesign(this);
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
  }
}
