import Phaser from 'phaser';
import { sfx } from '../audio';
import { DPR, cssSize } from '../display';
import { insidePolygon } from '../sim/scenery';
import {
  MIN_ATTACK,
  attackSize,
  battleLevel,
  targetsFrom,
  theaterRank,
  type Order,
  type Zone,
} from '../sim/theater';
import type { Point } from '../sim/types';
import { COLORS, FACTION_COLORS, textStyle } from '../theme';
import type { BattleData } from './BattleScene';
import { newTheaterRun, nextFight, startRound, theaterRun, type TheaterRun } from './theaterRun';
import { addButton } from './ui';

const UI_DESIGN = { width: 1000, height: 560 };
const BACKGROUND = 0x0f150c;
const FILL: Record<Zone['owner'], number> = {
  player: FACTION_COLORS.player,
  enemy: FACTION_COLORS.enemy,
  neutral: 0x6b7360,
};

/**
 * Theater (Phase 2 prototype): the front as a map of zones. Tap one of your zones, then a
 * neighbour, to order an attack (one per general). Each order is fought by your general
 * (AUTO) or by you (I'LL FIGHT). GO sends them all, then the enemy answers.
 */
export class TheaterScene extends Phaser.Scene {
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private run!: TheaterRun;
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private selected: string | null = null;

  /** Back from a fight you played: carry on with the round. */
  private resuming = false;

  constructor() {
    super('theater');
  }

  init(data: { resume?: boolean }) {
    this.resuming = !!data.resume;
    // Phaser keeps a scene's last data when started without any; use it once.
    this.sys.settings.data = {};
  }

  create() {
    this.run = theaterRun();
    this.selected = null;
    this.mapObjects = [];
    this.uiObjects = [];
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height).setOrigin(0, 0);
    this.redraw();
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over.length === 0) this.tap(this.cameras.main.getWorldPoint(p.x, p.y));
    });
    const relayout = () => this.redraw();
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
    if (this.resuming) this.resume();
  }

  private map<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiCam.ignore(obj);
    this.mapObjects.push(obj);
    return obj;
  }

  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.cameras.main.ignore(obj);
    this.uiObjects.push(obj);
    return obj;
  }

  private redraw() {
    for (const o of [...this.mapObjects, ...this.uiObjects]) o.destroy();
    this.mapObjects = [];
    this.uiObjects = [];
    this.fitCamera();
    this.drawMap();
    this.buildUi();
  }

  // ----- Map -------------------------------------------------------------------------------

  private zones(): Zone[] {
    return Object.values(this.run.state.zones);
  }

  /** Fit every zone between the top bar and the bottom panel. */
  private fitCamera() {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    const pts = this.zones().flatMap((z) => z.polygon);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const uiZoom = this.uiZoom();
    const top = 132 * uiZoom;
    const bottom = 150 * uiZoom;
    const room = { w: cam.width - 40 * DPR, h: cam.height - top - bottom };
    const zoom = Math.min(room.w / (x1 - x0), room.h / (y1 - y0));
    cam.setZoom(zoom);
    // Centre the map in the space between the bars.
    const midY = (top + (cam.height - bottom)) / 2;
    cam.centerOn((x0 + x1) / 2, (y0 + y1) / 2 - (midY - cam.height / 2) / zoom);
  }

  private drawMap() {
    const g = this.map(this.add.graphics());
    const sel = this.selected ? this.run.state.zones[this.selected] : null;
    const targets = new Set(sel ? targetsFrom(this.run.state, sel.id) : []);
    const ordered = new Set(this.run.orders.map((o) => o.from));
    const zoom = this.cameras.main.zoom;
    for (const z of this.zones()) {
      g.fillStyle(FILL[z.owner], z.owner === 'neutral' ? 0.55 : 0.8).fillPoints(z.polygon, true);
      g.lineStyle(3 / zoom, 0x1b2416, 1).strokePoints(z.polygon, true);
    }
    // Where you can attack from the selected zone, then the selection on top.
    for (const id of targets) {
      g.lineStyle(6 / zoom, 0x9dff9d, 1).strokePoints(this.run.state.zones[id]!.polygon, true);
    }
    if (sel) g.lineStyle(7 / zoom, 0xffffff, 1).strokePoints(sel.polygon, true);
    // Orders as arrows from zone to zone.
    for (const o of this.run.orders) {
      const a = this.run.state.zones[o.from]!.centre;
      const b = this.run.state.zones[o.to]!.centre;
      g.lineStyle(8 / zoom, o.auto ? 0xc9b3ff : 0xf2c94c, 1).lineBetween(a.x, a.y, b.x, b.y);
      g.fillStyle(o.auto ? 0xc9b3ff : 0xf2c94c, 1).fillCircle(b.x, b.y, 14 / zoom);
    }
    for (const z of this.zones()) {
      const s = 1 / zoom;
      // On a small screen zones are small: drop the names and fit the troop count inside.
      const xs = z.polygon.map((p) => p.x);
      const widthCss = ((Math.max(...xs) - Math.min(...xs)) * zoom) / DPR;
      const roomy = widthCss >= 85;
      if (roomy) {
        const name = z.name.toUpperCase().replace(' ', '\n');
        this.map(
          this.add
            .text(z.centre.x, z.centre.y - 22 * s, name, { ...textStyle(13), align: 'center' })
            .setScale(s * DPR)
            .setOrigin(0.5)
            .setLineSpacing(-3),
        );
      }
      const label = `${z.home ? '★' : ''}${z.troops}${ordered.has(z.id) ? '*' : ''}`;
      const size = Phaser.Math.Clamp(Math.round(widthCss / 3.4), 14, 24);
      this.map(
        this.add
          .text(z.centre.x, z.centre.y + (roomy ? 14 * s : 0), label, textStyle(size))
          .setScale(s * DPR)
          .setOrigin(0.5),
      );
    }
  }

  private tap(w: Point) {
    const s = this.run.state;
    if (s.winner) return;
    const hit = this.zones().find((z) => insidePolygon(w, z.polygon));
    if (!hit) {
      this.selected = null;
    } else if (this.selected && targetsFrom(s, this.selected).includes(hit.id)) {
      this.addOrder(this.selected, hit.id);
      this.selected = null;
    } else if (hit.owner === 'player' && hit.troops >= MIN_ATTACK) {
      this.selected = this.run.orders.some((o) => o.from === hit.id) ? null : hit.id;
      sfx.click();
    } else {
      this.selected = null;
    }
    this.redraw();
  }

  private addOrder(from: string, to: string) {
    if (this.run.orders.length >= this.run.state.generals) {
      sfx.failed();
      return;
    }
    const troops = attackSize(this.run.state.zones[from]!);
    this.run.orders.push({ from, to, troops, auto: true });
    sfx.capture();
  }

  // ----- UI --------------------------------------------------------------------------------

  private uiZoom(): number {
    const { width, height } = cssSize(this);
    const fit = Math.min(width / UI_DESIGN.width, height / UI_DESIGN.height);
    return Phaser.Math.Clamp(fit, 0.55, 1.3) * DPR;
  }

  private buildUi() {
    const zoom = this.uiZoom();
    this.uiCam.setSize(this.scale.width, this.scale.height).setZoom(zoom);
    const w = this.scale.width / zoom;
    const h = this.scale.height / zoom;
    const s = this.run.state;

    this.ui(this.add.rectangle(0, 0, w, 96, 0x000000, 0.5).setOrigin(0));
    this.ui(
      addButton(this, 90, 48, {
        width: 150,
        height: 64,
        label: 'BACK',
        labelSize: 30,
        onClick: () => this.scene.start('menu', { page: 'quick' }),
      }),
    );
    this.ui(
      this.add
        .text(w / 2, 28, `THEATER · ROUND ${s.round}`, textStyle(36, COLORS.accent))
        .setOrigin(0.5),
    );
    const left = s.generals - this.run.orders.length;
    this.ui(
      this.add
        .text(
          w / 2,
          66,
          `${left} general${left === 1 ? '' : 's'} free · tap your zone, then a neighbour`,
          textStyle(20),
        )
        .setOrigin(0.5),
    );
    this.ui(
      addButton(this, w - 100, 48, {
        width: 170,
        height: 64,
        label: 'NEW',
        labelSize: 28,
        onClick: () => {
          newTheaterRun();
          this.scene.restart();
        },
      }),
    );
    if (s.winner) this.endPanel(w, h);
    else this.ordersPanel(w, h);
  }

  /** This round's orders (AUTO / I'LL FIGHT, remove), last round's news, and GO. */
  private ordersPanel(w: number, h: number) {
    const panelW = Math.min(900, w - 24);
    const panelH = 140;
    const x0 = (w - panelW) / 2;
    const y0 = h - panelH - 8;
    const bg = this.ui(this.add.graphics());
    bg.fillStyle(0x000000, 0.75).fillRoundedRect(x0, y0, panelW, panelH, 14);
    this.ui(this.add.zone(x0, y0, panelW, panelH).setOrigin(0).setInteractive());
    const zones = this.run.state.zones;
    if (this.run.orders.length === 0) {
      const news = this.run.state.log.length
        ? this.run.state.log.join('\n')
        : 'Take the enemy home (★ on the right). Your generals fight AUTO battles; or fight one yourself.';
      this.ui(
        this.add.text(x0 + 20, y0 + 14, news, {
          ...textStyle(20),
          wordWrap: { width: panelW - 260 },
        }),
      );
    }
    this.run.orders.forEach((o, i) => {
      const y = y0 + 34 + i * 62;
      const line = `${zones[o.from]!.name} → ${zones[o.to]!.name} · ${o.troops} troops`;
      this.ui(this.add.text(x0 + 20, y - 14, line, textStyle(20)));
      this.ui(
        addButton(this, x0 + panelW - 420, y, {
          width: 190,
          height: 52,
          label: o.auto ? 'GENERAL' : "I'LL FIGHT",
          color: o.auto ? 0x4a2f7a : 0x7a5a1f,
          labelSize: 22,
          onClick: () => {
            o.auto = !o.auto;
            this.redraw();
          },
        }),
      );
      this.ui(
        addButton(this, x0 + panelW - 290, y, {
          width: 52,
          height: 52,
          label: '✕',
          labelSize: 24,
          onClick: () => {
            this.run.orders.splice(i, 1);
            this.redraw();
          },
        }),
      );
    });
    this.ui(
      addButton(this, x0 + panelW - 110, y0 + panelH / 2, {
        width: 190,
        height: 100,
        label: 'GO!',
        color: 0x2f6b3a,
        labelSize: 44,
        onClick: () => this.go(),
      }),
    );
  }

  private endPanel(w: number, h: number) {
    const won = this.run.state.winner === 'player';
    this.ui(this.add.rectangle(0, 0, w, h, 0x000000, 0.55).setOrigin(0).setInteractive());
    this.ui(
      this.add
        .text(
          w / 2,
          h / 2 - 60,
          won ? 'FRONT WON!' : 'FRONT LOST',
          textStyle(72, won ? COLORS.accent : '#ff9a9e'),
        )
        .setOrigin(0.5),
    );
    this.ui(
      this.add
        .text(w / 2, h / 2 + 4, `in ${this.run.state.round} rounds`, textStyle(28))
        .setOrigin(0.5),
    );
    this.ui(
      addButton(this, w / 2, h / 2 + 90, {
        width: 320,
        height: 90,
        label: 'NEW THEATER',
        color: 0x2f6b3a,
        labelSize: 34,
        onClick: () => {
          newTheaterRun();
          this.scene.restart();
        },
      }),
    );
  }

  /** Send the orders; play your own fights one by one, then the enemy answers. */
  private go() {
    sfx.click();
    const fight = startRound(this.run);
    if (fight) this.playFight(fight);
    else this.redraw();
  }

  private playFight(o: Order) {
    const s = this.run.state;
    const target = s.zones[o.to]!;
    const data: BattleData = {
      mode: 'theater',
      difficulty: theaterRank(s, target.owner).id,
      theaterLevel: battleLevel(s, o.to, o.troops, target.troops),
    };
    this.scene.start('battle', data);
  }

  /** Back from a fight you played: on to the next one, or show the round's results. */
  resume() {
    const next = nextFight(this.run);
    if (next) this.playFight(next);
    else this.redraw();
  }
}
