import Phaser from 'phaser';
import { sfx } from '../audio';
import { buyCollege, buyUpgrade, loadSave, promote, tacticalRetreat } from '../save';
import {
  COLLEGE,
  RETREAT_MIN_STARS,
  canRetreat,
  honorFor,
  insignia,
  nextHonorCost,
  promotionProgress,
} from '../sim/college';
import { medalCount, medalSummary } from '../sim/economy';
import { ADJUTANT_LEVELS, UPGRADES, nextCost, type UpgradeTab } from '../sim/upgrades';
import { COLORS, textStyle } from '../theme';
import { drawMapGrid } from './drawing';
import { MENU_DESIGN, fitDesign } from './MenuScene';
import { addButton, addMuteButton } from './ui';

/**
 * The Command Tent's pages: two of medal upgrades, then the War College's lasting upgrades and
 * commander abilities (both bought with Honor).
 */
type TentTab = UpgradeTab | 'college' | 'abilities';

/** Where the Tactical Retreat button sits; the "no" of its confirm takes the same spot. */
const RETREAT = { x: 640, y: 562 };

/**
 * The Command Tent: spend medals on upgrades for this war, and Honor in the War College on
 * upgrades that last for good. The War College page also holds the Tactical Retreat.
 */
export class TentScene extends Phaser.Scene {
  /** Which page is showing. */
  private tab: TentTab = 'army';
  /** Asking "are you sure?" before a Tactical Retreat. */
  private confirming = false;

  constructor() {
    super('tent');
  }

  init(data: { tab?: TentTab; confirm?: boolean }) {
    this.tab = data.tab ?? 'army';
    this.confirming = !!data.confirm;
  }

  create() {
    const grid = this.add.graphics();
    drawMapGrid(grid, MENU_DESIGN.width * 3, MENU_DESIGN.height * 3);
    grid.setPosition(-MENU_DESIGN.width, -MENU_DESIGN.height);
    addMuteButton(this, MENU_DESIGN.width - 30, 30, 76);

    if (this.confirming) this.confirmRetreat();
    else this.page();

    fitDesign(this);
    const relayout = () => fitDesign(this);
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
  }

  private page() {
    const save = loadSave();
    const cx = MENU_DESIGN.width / 2;
    const college = this.tab === 'college' || this.tab === 'abilities';
    this.add
      .text(cx, 40, college ? 'WAR COLLEGE' : 'COMMAND TENT', textStyle(60, COLORS.accent))
      .setOrigin(0.5);
    const wallet = college
      ? `${insignia(save.retreats)} · ${save.honor} Honor`
      : `You have ${medalSummary(save.medals, save.medalsEarned)}`;
    this.add.text(cx, 88, wallet, textStyle(28)).setOrigin(0.5);

    // Pages, so every upgrade gets a readable row on a phone.
    const tabs: { id: TentTab; label: string }[] = [
      { id: 'army', label: 'ARMY' },
      { id: 'bases', label: 'BASES & GEAR' },
      { id: 'college', label: 'WAR COLLEGE' },
      { id: 'abilities', label: 'ABILITIES' },
    ];
    tabs.forEach((t, i) => {
      addButton(this, cx + (i - 1.5) * 240, 132, {
        width: 228,
        height: 48,
        label: t.label,
        color: t.id === this.tab ? 0x2f5f8a : 0x2a3324,
        labelSize: 26,
        onClick: () => this.scene.restart({ tab: t.id }),
      });
    });

    if (this.tab === 'college') this.collegeRows();
    else if (this.tab === 'abilities') this.abilityRows();
    else this.tentRows(this.tab as UpgradeTab);

    addButton(this, 110, 562, {
      width: 180,
      height: 56,
      label: 'BACK',
      labelSize: 32,
      onClick: () => this.scene.start('worldmap'),
    });
  }

  /** One upgrade: name, level pips, what you have and what's next, and its buy button. */
  private row(
    i: number,
    spacing: number,
    name: string,
    level: number,
    max: number,
    detail: string,
    price: { label: string; affordable: boolean } | null,
    buy: () => boolean,
    /** Shown instead of a price once there is nothing left to buy. */
    done = 'MAXED',
  ) {
    const y = 190 + i * spacing;
    const pips = '■'.repeat(level) + '□'.repeat(max - level);
    // Tighter rows (the War College has more of them) get slightly smaller text.
    const tight = spacing < 56;
    this.add.text(40, y - (tight ? 22 : 24), name, textStyle(tight ? 23 : 26)).setOrigin(0, 0);
    this.add.text(310, y - 20, pips, textStyle(tight ? 22 : 24, COLORS.accent)).setOrigin(0, 0);
    this.add
      .text(40, y + (tight ? 2 : 4), detail, textStyle(tight ? 19 : 22, COLORS.text))
      .setOrigin(0, 0);
    if (!price) {
      this.add.text(870, y, done, textStyle(30, COLORS.accent)).setOrigin(0.5);
      return;
    }
    addButton(this, 870, y, {
      width: 220,
      height: Math.min(50, spacing - 6),
      label: price.label,
      color: price.affordable ? 0x2f6b3a : 0x3a3a3a,
      labelSize: 26,
      onClick: () => {
        if (buy()) {
          sfx.capture();
          this.scene.restart({ tab: this.tab });
        } else {
          sfx.failed();
        }
      },
    });
  }

  private tentRows(tab: UpgradeTab) {
    const save = loadSave();
    UPGRADES.filter((u) => u.tab === tab).forEach((u, i) => {
      const level = save.upgrades[u.id];
      const max = u.costs.length;
      const cost = nextCost(save.upgrades, u.id);
      // What you have now and what the next level brings; the Adjutant names its next duty.
      const detail =
        u.id === 'adjutant'
          ? level >= max
            ? 'All duties learned'
            : (ADJUTANT_LEVELS[level] ?? '')
          : nowAndNext(u.total, level, max);
      const price =
        cost === null
          ? null
          : { label: medalCount(cost).toUpperCase(), affordable: save.medals >= cost };
      this.row(i, 56, u.name, level, max, detail, price, () => buyUpgrade(u.id));
    });
  }

  private collegeRows() {
    const save = loadSave();
    COLLEGE.filter((c) => c.page === 'college').forEach((c, i) => {
      const level = save.college[c.id];
      const max = c.costs.length;
      const cost = nextHonorCost(save.college, c.id);
      const price =
        cost === null ? null : { label: `${cost} HONOR`, affordable: save.honor >= cost };
      const detail = nowAndNext(c.total, level, max);
      this.row(i, 44, c.name, level, max, detail, price, () => buyCollege(c.id));
    });

    this.promotionBar();

    // The Tactical Retreat: bank Honor for this war and start a new one.
    const ready = canRetreat(save.conquest);
    const honor = honorFor(save.conquest);
    addButton(this, RETREAT.x, RETREAT.y, {
      width: 560,
      height: 56,
      label: ready
        ? `TACTICAL RETREAT: +${honor} HONOR`
        : `RETREAT: WIN A ${RETREAT_MIN_STARS}★ REGION`,
      color: ready ? 0x7a4a1f : 0x3a3a3a,
      labelSize: 26,
      onClick: () => {
        if (ready) this.scene.restart({ tab: 'college', confirm: true });
        else sfx.failed();
      },
    });
  }

  /**
   * Progress toward a Promotion: Honor banked from past wars (solid) plus what this war would
   * pay now (lighter), toward the goal. Full, it becomes a PROMOTE button.
   */
  private promotionBar() {
    const save = loadSave();
    const cx = MENU_DESIGN.width / 2;
    const y = 515;
    if (save.phase >= 2) {
      this.add
        .text(cx, y, '★ PROMOTED! Phase 2 is coming soon.', textStyle(26, COLORS.accent))
        .setOrigin(0.5);
      return;
    }
    const p = promotionProgress(save.honorEarned, save.conquest);
    if (p.ready) {
      addButton(this, cx, y, {
        width: 560,
        height: 38,
        label: '★ PROMOTE TO PHASE 2',
        color: 0x8a6a1f,
        labelSize: 28,
        onClick: () => {
          if (promote()) {
            sfx.victory();
            this.scene.restart({ tab: 'college' });
          }
        },
      });
      return;
    }
    const [w, h] = [560, 22];
    const x0 = cx - w / 2;
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.55).fillRoundedRect(x0, y - h / 2 + 6, w, h, 8);
    const banked = Math.min(1, p.banked / p.goal);
    const total = Math.min(1, (p.banked + p.pending) / p.goal);
    if (total > 0) bar.fillStyle(0xb08a2a, 0.6).fillRoundedRect(x0, y - h / 2 + 6, w * total, h, 8);
    if (banked > 0) bar.fillStyle(0xf2c94c, 1).fillRoundedRect(x0, y - h / 2 + 6, w * banked, h, 8);
    const thisWar = p.pending > 0 ? ` (+${p.pending} this war)` : '';
    this.add
      .text(cx, y - 8, `PROMOTION: ${p.banked}${thisWar} / ${p.goal} HONOR EARNED`, textStyle(20))
      .setOrigin(0.5, 1);
  }

  /** Commander abilities: each unlocked once with Honor, then usable in campaign battles. */
  private abilityRows() {
    const save = loadSave();
    COLLEGE.filter((c) => c.page === 'abilities').forEach((c, i) => {
      const owned = save.college[c.id] > 0;
      const cost = nextHonorCost(save.college, c.id);
      const price =
        cost === null ? null : { label: `${cost} HONOR`, affordable: save.honor >= cost };
      const detail = `${owned ? 'Yours' : 'Unlock'}: ${c.total(1)}`;
      const buy = () => buyCollege(c.id);
      this.row(i, 70, c.name, save.college[c.id], 1, detail, price, buy, 'OWNED');
    });
    this.add
      .text(
        MENU_DESIGN.width / 2,
        420,
        'Abilities show as buttons in campaign battles: tap one, then tap a base.',
        textStyle(22, COLORS.textDim),
      )
      .setOrigin(0.5);
  }

  /** Ask again before retreating. NO sits where the retreat button was; YES is off to one side. */
  private confirmRetreat() {
    const save = loadSave();
    const cx = MENU_DESIGN.width / 2;
    const honor = honorFor(save.conquest);
    this.add.text(cx, 60, 'TACTICAL RETREAT?', textStyle(64, COLORS.accent)).setOrigin(0.5);
    this.add
      .text(
        cx,
        210,
        [
          `You earn ${honor} Honor and become ${insignia(save.retreats + 1)}.`,
          'Then a new war starts on a new world.',
          '',
          'You keep: Honor, the War College and your rank.',
          'You lose: this map, your medals and Command Tent upgrades.',
        ].join('\n'),
        { ...textStyle(28), align: 'center' },
      )
      .setOrigin(0.5);

    addButton(this, RETREAT.x, RETREAT.y - 20, {
      width: 420,
      height: 96,
      label: 'NO, KEEP FIGHTING',
      color: 0x2f6b3a,
      labelSize: 36,
      onClick: () => this.scene.restart({ tab: 'college' }),
    });
    addButton(this, 230, 420, {
      width: 380,
      height: 90,
      label: 'YES, RETREAT',
      color: 0x7a4a1f,
      labelSize: 36,
      onClick: () => {
        if (tacticalRetreat() > 0) {
          sfx.victory();
          this.scene.start('worldmap');
        }
      },
    });
  }
}

/** "Next: …" at level 0, "Now: … (max)" when maxed, else both. */
function nowAndNext(total: (levels: number) => string, level: number, max: number): string {
  if (level === 0) return `Next: ${total(1)}`;
  if (level >= max) return `Now: ${total(level)} (max)`;
  return `Now: ${total(level)}  ·  Next: ${total(level + 1)}`;
}
