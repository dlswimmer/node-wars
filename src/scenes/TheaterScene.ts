import Phaser from 'phaser';
import { sfx } from '../audio';
import { DPR, cssSize } from '../display';
import { createRng } from '../sim/rng';
import { insidePolygon } from '../sim/scenery';
import {
  MAX_LEVEL,
  RALLY,
  buyUpgrade,
  newTheater,
  rally,
  updateTheater,
  upgradeCost,
  type Side,
  type TheaterState,
  type Upgrade,
  type Zone,
} from '../sim/theater';
import type { Point } from '../sim/types';
import { COLORS, FACTION_COLORS, textStyle } from '../theme';
import { addButton } from './ui';

const UI_DESIGN = { width: 1000, height: 560 };
const BACKGROUND = 0x0f150c;
const SIDE_COLOR: Record<Side, number> = {
  player: FACTION_COLORS.player,
  enemy: FACTION_COLORS.enemy,
};
/** Dots per zone: the zone fills dot by dot as a side takes it. */
const DOTS = 220;
const UPGRADES: { kind: Upgrade; label: string; what: string }[] = [
  { kind: 'build', label: 'BUILD', what: 'barracks: stronger pushes, more supply' },
  { kind: 'enhance', label: 'ENHANCE', what: 'pushes from here hit harder' },
  { kind: 'fortify', label: 'FORTIFY', what: 'enemy pushes in are weaker' },
];

interface Dot {
  x: number;
  y: number;
  /** Randomness in the order dots change colour, so the front edge is ragged. */
  jitter: number;
}

/** The front stays while the app is open (a prototype: not saved). */
let theater: TheaterState | null = null;

/**
 * Theater (Phase 2 prototype): the front in real time. Every zone you own pushes into its
 * neighbours by itself; you can see each zone fill with colour, dot by dot, from the side
 * pushing in. Spend supply on the zones that matter: build, enhance, fortify.
 */
export class TheaterScene extends Phaser.Scene {
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private state!: TheaterState;
  private dots = new Map<string, Dot[]>();
  private gfx!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private supplyText!: Phaser.GameObjects.Text;
  private selected: string | null = null;
  /** What the panel last showed, so it is only rebuilt when something changes. */
  private panelKey = '';

  constructor() {
    super('theater');
  }

  create() {
    theater ??= newTheater(1 + Math.floor(Math.random() * 999_999));
    this.state = theater;
    this.selected = null;
    this.panelKey = '';
    this.uiObjects = [];
    this.labels = [];
    this.makeDots();
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height).setOrigin(0, 0);
    this.gfx = this.add.graphics();
    this.uiCam.ignore(this.gfx);
    this.layout();
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: unknown[]) => {
      if (over.length === 0) this.tap(this.cameras.main.getWorldPoint(p.x, p.y));
    });
    const relayout = () => this.layout();
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
  }

  update(_time: number, deltaMs: number) {
    const before = this.state.log.join('|');
    updateTheater(this.state, Math.min(deltaMs / 1000, 0.1));
    if (this.state.log.join('|') !== before) sfx.capture();
    if (this.selected && this.state.zones[this.selected]!.owner !== 'player') this.selected = null;
    this.drawZones();
    this.supplyText.setText(`SUPPLY ${Math.floor(this.state.supply.player)}`);
    this.refreshPanel();
  }

  /** Scatter each zone's dots inside its outline (the same every time for a zone). */
  private makeDots() {
    this.dots.clear();
    for (const z of Object.values(this.state.zones)) {
      const rng = createRng(this.state.seed ^ hash(z.id));
      const xs = z.polygon.map((p) => p.x);
      const ys = z.polygon.map((p) => p.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const dots: Dot[] = [];
      for (let tries = 0; dots.length < DOTS && tries < DOTS * 20; tries++) {
        const p = { x: x0 + rng() * (x1 - x0), y: y0 + rng() * (y1 - y0) };
        if (insidePolygon(p, z.polygon)) dots.push({ ...p, jitter: rng() });
      }
      this.dots.set(z.id, dots);
    }
  }

  private layout() {
    this.fitCamera();
    this.buildLabels();
    this.panelKey = '';
    this.buildUi();
  }

  private uiZoom(): number {
    const { width, height } = cssSize(this);
    const fit = Math.min(width / UI_DESIGN.width, height / UI_DESIGN.height);
    return Phaser.Math.Clamp(fit, 0.55, 1.3) * DPR;
  }

  /** Fit every zone between the top bar and the bottom panel. */
  private fitCamera() {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    const pts = Object.values(this.state.zones).flatMap((z) => z.polygon);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const ui = this.uiZoom();
    const top = 96 * ui;
    const bottom = 132 * ui;
    const zoom = Math.min(
      (cam.width - 40 * DPR) / (x1 - x0),
      (cam.height - top - bottom) / (y1 - y0),
    );
    cam.setZoom(zoom);
    const midY = (top + cam.height - bottom) / 2;
    cam.centerOn((x0 + x1) / 2, (y0 + y1) / 2 - (midY - cam.height / 2) / zoom);
  }

  // ----- The front -------------------------------------------------------------------------

  /** Where a side's colour comes into a zone from: the middle of its zones pushing in. */
  private sourceOf(zone: Zone, side: Side): Point | null {
    const from = this.state.pushes.filter((p) => p.side === side && p.to === zone.id);
    if (from.length === 0) return null;
    const pts = from.map((p) => this.state.zones[p.from]!.centre);
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
  }

  private drawZones() {
    const g = this.gfx.clear();
    const zoom = this.cameras.main.zoom;
    // Dots about 5 CSS px across, drawn as squares (circles cost too much to redraw each frame).
    const dotR = (3 * DPR) / zoom;
    for (const z of Object.values(this.state.zones)) {
      const tint = z.owner ? SIDE_COLOR[z.owner] : 0x3a4232;
      g.fillStyle(tint, z.owner ? 0.35 : 0.6).fillPoints(z.polygon, true);
      this.drawDots(g, z, Math.max(dotR, 0));
    }
    // Pushes: a soft arrow from each pushing zone toward the zone it pushes into.
    for (const p of this.state.pushes) {
      const a = this.state.zones[p.from]!.centre;
      const b = this.state.zones[p.to]!.centre;
      const [mx, my] = [a.x + (b.x - a.x) * 0.62, a.y + (b.y - a.y) * 0.62];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const [sx, sy] = [a.x + (b.x - a.x) * 0.38, a.y + (b.y - a.y) * 0.38];
      // A dark outline first, so the arrow shows over a zone full of its own colour.
      for (const [color, grow] of [
        [0x000000, 2.2],
        [SIDE_COLOR[p.side], 0],
      ] as const) {
        // Sized to the zones (not the screen), so the arrows fit a small map on a phone.
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const s = len * (0.09 + grow * 0.012);
        g.lineStyle(len * (0.025 + grow * 0.012), color, 1).lineBetween(sx, sy, mx, my);
        g.fillStyle(color, 1).fillTriangle(
          mx + Math.cos(ang) * s,
          my + Math.sin(ang) * s,
          mx + Math.cos(ang + 2.4) * s,
          my + Math.sin(ang + 2.4) * s,
          mx + Math.cos(ang - 2.4) * s,
          my + Math.sin(ang - 2.4) * s,
        );
      }
    }
    for (const z of Object.values(this.state.zones)) {
      g.lineStyle(3 / zoom, 0x101510, 1).strokePoints(z.polygon, true);
    }
    // A rallying zone glows, pulsing in its side's colour.
    const pulse = 0.55 + 0.45 * Math.sin(this.state.time * 8);
    for (const z of Object.values(this.state.zones)) {
      if (!z.owner || this.state.time >= z.rallyUntil) continue;
      g.lineStyle(10 / zoom, 0xffe08a, pulse).strokePoints(z.polygon, true);
    }
    if (this.selected) {
      g.lineStyle(6 / zoom, 0xffffff, 1).strokePoints(
        this.state.zones[this.selected]!.polygon,
        true,
      );
    }
  }

  /**
   * Colour a zone's dots: each side's share, starting from the side it pushes in from, with
   * a ragged edge. The rest stay grey.
   */
  private drawDots(g: Phaser.GameObjects.Graphics, z: Zone, r: number) {
    const dots = this.dots.get(z.id)!;
    const n = dots.length;
    const taken = new Uint8Array(n);
    for (const side of ['player', 'enemy'] as const) {
      const count = Math.round(z.share[side] * n);
      if (count === 0) continue;
      const from = this.sourceOf(z, side) ?? z.centre;
      const spread = 220;
      const order = dots
        .map((d, i) => ({ i, key: Math.hypot(d.x - from.x, d.y - from.y) + d.jitter * spread }))
        .filter((o) => !taken[o.i])
        .sort((a, b) => a.key - b.key);
      g.fillStyle(SIDE_COLOR[side], 1);
      for (const o of order.slice(0, count)) {
        taken[o.i] = 1;
        g.fillRect(dots[o.i]!.x - r, dots[o.i]!.y - r, r * 2, r * 2);
      }
    }
    g.fillStyle(0x6b7360, 0.7);
    const q = r * 0.75;
    for (let i = 0; i < n; i++)
      if (!taken[i]) g.fillRect(dots[i]!.x - q, dots[i]!.y - q, q * 2, q * 2);
  }

  /** Zone names (when there's room) and homes. */
  private buildLabels() {
    for (const l of this.labels) l.destroy();
    this.labels = [];
    const zoom = this.cameras.main.zoom;
    for (const z of Object.values(this.state.zones)) {
      const xs = z.polygon.map((p) => p.x);
      const widthCss = ((Math.max(...xs) - Math.min(...xs)) * zoom) / DPR;
      const text = `${z.home ? '★ ' : ''}${widthCss >= 85 ? z.name.toUpperCase().replace(' ', '\n') : ''}`;
      if (!text.trim()) continue;
      const label = this.add
        .text(z.centre.x, z.centre.y, text, { ...textStyle(14), align: 'center' })
        .setScale(DPR / zoom)
        .setOrigin(0.5)
        .setDepth(5);
      this.uiCam.ignore(label);
      this.labels.push(label);
    }
  }

  private tap(w: Point) {
    if (this.state.winner) return;
    const hit = Object.values(this.state.zones).find((z) => insidePolygon(w, z.polygon));
    this.selected = hit && hit.owner === 'player' && hit.id !== this.selected ? hit.id : null;
    if (this.selected) sfx.click();
  }

  // ----- UI --------------------------------------------------------------------------------

  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.cameras.main.ignore(obj);
    this.uiObjects.push(obj);
    return obj;
  }

  private buildUi() {
    for (const o of this.uiObjects) o.destroy();
    this.uiObjects = [];
    const zoom = this.uiZoom();
    this.uiCam.setSize(this.scale.width, this.scale.height).setZoom(zoom);
    const w = this.scale.width / zoom;
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
    this.ui(this.add.text(w / 2, 28, 'THEATER', textStyle(36, COLORS.accent)).setOrigin(0.5));
    this.supplyText = this.ui(this.add.text(w / 2, 66, '', textStyle(22)).setOrigin(0.5));
    this.ui(
      addButton(this, w - 100, 48, {
        width: 170,
        height: 64,
        label: 'NEW',
        labelSize: 28,
        onClick: () => {
          theater = null;
          this.scene.restart();
        },
      }),
    );
  }

  /** Rebuild the bottom panel only when what it shows has changed. */
  private refreshPanel() {
    const s = this.state;
    const z = this.selected ? s.zones[this.selected]! : null;
    const key = [
      s.winner,
      z?.id,
      z && JSON.stringify(z.levels),
      z && UPGRADES.map((u) => s.supply.player >= (upgradeCost(z, u.kind) ?? Infinity)).join(),
      z && s.supply.player >= RALLY.cost,
      z && Math.max(0, Math.ceil(z.rallyUntil - s.time)),
      s.log.at(-1),
    ].join('|');
    if (key === this.panelKey) return;
    this.panelKey = key;
    this.buildUi();
    const zoom = this.uiZoom();
    const w = this.scale.width / zoom;
    const h = this.scale.height / zoom;
    if (s.winner) {
      this.endPanel(w, h);
      return;
    }
    const panelW = Math.min(900, w - 24);
    const panelH = 120;
    const x0 = (w - panelW) / 2;
    const y0 = h - panelH - 8;
    const bg = this.ui(this.add.graphics());
    bg.fillStyle(0x000000, 0.75).fillRoundedRect(x0, y0, panelW, panelH, 14);
    this.ui(this.add.zone(x0, y0, panelW, panelH).setOrigin(0).setInteractive());
    if (!z) {
      const news = s.log.at(-1) ?? 'Your zones push into their neighbours by themselves.';
      this.ui(this.add.text(x0 + 20, y0 + 16, news, textStyle(24, COLORS.accent)));
      this.ui(
        this.add.text(
          x0 + 20,
          y0 + 56,
          'Tap one of your zones to spend supply: BUILD, ENHANCE, FORTIFY, or RALLY it for a burst. Take the enemy ★.',
          { ...textStyle(20), wordWrap: { width: panelW - 40 } },
        ),
      );
      return;
    }
    this.ui(this.add.text(x0 + 20, y0 + 12, z.name.toUpperCase(), textStyle(26)));
    // Four buttons across: the three upgrades, then RALLY.
    const slot = (panelW - 50) / 4;
    const bx = (i: number) => x0 + 25 + (i + 0.5) * slot;
    const by = y0 + 76;
    UPGRADES.forEach((u, i) => {
      const level = z.levels[u.kind];
      const cost = upgradeCost(z, u.kind);
      const pips = '■'.repeat(level) + '□'.repeat(MAX_LEVEL - level);
      const can = cost !== null && s.supply.player >= cost;
      this.ui(
        addButton(this, bx(i), by, {
          width: slot - 12,
          height: 64,
          label: cost === null ? `${u.label} ${pips}` : `${u.label} · ${cost}`,
          sublabel: cost === null ? 'MAXED' : pips,
          color: cost === null ? 0x3a3a3a : can ? 0x2f6b3a : 0x3a3020,
          labelSize: 22,
          onClick: () => {
            if (buyUpgrade(s, 'player', z.id, u.kind)) sfx.capture();
            else sfx.failed();
          },
        }),
      );
    });
    const left = Math.ceil(z.rallyUntil - s.time);
    const canRally = left <= 0 && s.supply.player >= RALLY.cost;
    this.ui(
      addButton(this, bx(3), by, {
        width: slot - 12,
        height: 64,
        label: left > 0 ? 'RALLYING!' : `RALLY · ${RALLY.cost}`,
        sublabel: left > 0 ? `${left} s left` : `${RALLY.power}× for ${RALLY.seconds} s`,
        color: left > 0 ? 0xb8902a : canRally ? 0x8a4a1f : 0x3a3020,
        labelSize: 22,
        onClick: () => {
          if (rally(s, 'player', z.id)) sfx.capture();
          else sfx.failed();
        },
      }),
    );
    this.ui(
      this.add
        .text(x0 + panelW - 20, y0 + 16, 'tap again to close', textStyle(16, COLORS.textDim))
        .setOrigin(1, 0),
    );
  }

  private endPanel(w: number, h: number) {
    const won = this.state.winner === 'player';
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
    const minutes = Math.round(this.state.time / 60);
    this.ui(
      this.add.text(w / 2, h / 2 + 4, `in about ${minutes} min`, textStyle(28)).setOrigin(0.5),
    );
    this.ui(
      addButton(this, w / 2, h / 2 + 90, {
        width: 320,
        height: 90,
        label: 'NEW THEATER',
        color: 0x2f6b3a,
        labelSize: 34,
        onClick: () => {
          theater = null;
          this.scene.restart();
        },
      }),
    );
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
