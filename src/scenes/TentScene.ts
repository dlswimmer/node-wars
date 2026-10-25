import Phaser from 'phaser';
import { sfx } from '../audio';
import { loadSave, promote, tacticalRetreat } from '../save';
import { ABILITIES } from '../sim/abilities';
import {
  RETREAT_MIN_STARS,
  canRetreat,
  honorFor,
  insignia,
  promotionProgress,
} from '../sim/college';
import { collegeEffects, themeText, type Theme } from '../sim/collegeweb';
import { ADJUTANT_LEVELS, adjutantLevel, nextAdjutantMilestone } from '../sim/upgrades';
import { COLORS, textStyle } from '../theme';
import { drawMapGrid } from './drawing';
import { MENU_DESIGN, fitDesign } from './MenuScene';
import { addButton, addMuteButton } from './ui';

/** Where the Tactical Retreat button sits; the "no" of its confirm takes the same spot. */
const RETREAT = { x: 640, y: 562 };

/**
 * Rank & Retreat: your insignia, what the War College gives you, the Adjutant's free duties,
 * progress toward a Promotion, and the Tactical Retreat. (The Command Tent and the War College
 * themselves are upgrade webs; see WebScene.)
 */
export class TentScene extends Phaser.Scene {
  /** Asking "are you sure?" before a Tactical Retreat. */
  private confirming = false;

  constructor() {
    super('tent');
  }

  init(data: { confirm?: boolean }) {
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
    this.add.text(cx, 40, 'RANK & RETREAT', textStyle(60, COLORS.accent)).setOrigin(0.5);
    const wallet = `${insignia(save.retreats)} · ${save.honor} Honor`;
    this.add.text(cx, 88, wallet, textStyle(28)).setOrigin(0.5);

    // The two upgrade webs, then this page.
    const tabs = [
      { label: 'COMMAND TENT', go: () => this.scene.start('web', { web: 'tent' }) },
      { label: 'WAR COLLEGE', go: () => this.scene.start('web', { web: 'college' }) },
      { label: 'RANK & RETREAT', go: () => undefined, active: true },
    ];
    tabs.forEach((t, i) => {
      addButton(this, cx + (i - 1) * 250, 132, {
        width: 236,
        height: 48,
        label: t.label,
        color: t.active ? 0x2f5f8a : 0x2a3324,
        labelSize: 22,
        onClick: t.go,
      });
    });

    this.collegeSummary();
    this.adjutantLine();
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
        if (ready) this.scene.restart({ confirm: true });
        else sfx.failed();
      },
    });

    addButton(this, 110, 562, {
      width: 180,
      height: 56,
      label: 'BACK',
      labelSize: 32,
      onClick: () => this.scene.start('worldmap'),
    });
  }

  /** What the War College web gives you, summed up. */
  private collegeSummary() {
    const save = loadSave();
    const cx = MENU_DESIGN.width / 2;
    const e = collegeEffects(save.college);
    const order: Theme[] = ['attack', 'production', 'speed', 'capacity', 'medals', 'startMedals'];
    const edges = order.filter((t) => e.steps[t] > 0).map((t) => themeText(t, e.steps[t]));
    const powers = e.abilities.map((a) => ABILITIES[a].name);
    const lines =
      edges.length + powers.length === 0
        ? ['Nothing yet: spend Honor in the WAR COLLEGE web.']
        : [...edges, ...(powers.length ? [`Abilities: ${powers.join(', ')}`] : [])];
    this.add.text(cx, 186, 'YOUR WAR COLLEGE', textStyle(26, COLORS.accent)).setOrigin(0.5, 0);
    this.add
      .text(cx, 222, lines.join('\n'), { ...textStyle(22), align: 'center' })
      .setOrigin(0.5, 0)
      .setLineSpacing(2);
  }

  /** The Adjutant learns duties for free as Honor adds up, the last one using your abilities. */
  private adjutantLine() {
    const save = loadSave();
    const next = nextAdjutantMilestone(save.honorEarned);
    const learned = adjutantLevel(0, save.honorEarned);
    const line =
      next === null
        ? 'ADJUTANT: every duty learned, including GUNNER (uses your abilities for you)'
        : `ADJUTANT: next free duty at ${next} Honor earned (you have ${save.honorEarned})\n` +
          `${ADJUTANT_LEVELS[learned] ?? ''}`;
    this.add
      .text(MENU_DESIGN.width / 2, 440, line, { ...textStyle(21, COLORS.accent), align: 'center' })
      .setOrigin(0.5);
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
            this.scene.restart();
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
          'Then spend your Honor and start a new war on a new world.',
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
      onClick: () => this.scene.restart({}),
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
          this.scene.start('web', { web: 'college' });
        }
      },
    });
  }
}
