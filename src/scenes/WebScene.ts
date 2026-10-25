import Phaser from 'phaser';
import { sfx } from '../audio';
import { DPR, cssSize } from '../display';
import { buyUpgrade, loadSave } from '../save';
import { medalCount, medalSummary } from '../sim/economy';
import type { Point } from '../sim/types';
import { ADJUTANT_LEVELS, UPGRADES } from '../sim/upgrades';
import {
  CENTER,
  NODE_RADIUS,
  tentNodeCost,
  tentNodeState,
  tentWeb,
  type NodeState,
  type WebNode,
} from '../sim/web';
import { COLORS, textStyle } from '../theme';
import { addButton } from './ui';

/** Pointer travel (CSS px) before a press counts as a drag rather than a tap. */
const TAP_SLOP_CSS = 14;
/** Nodes are never drawn smaller than this on screen (CSS px radius), so they stay tappable. */
const MIN_NODE_CSS = 22;
const UI_DESIGN = { width: 1000, height: 560 };
const BACKGROUND = 0x0f150c;

/** How each node state looks: fill, rim, and text colour. */
const LOOK: Record<NodeState, { fill: number; rim: number; text: string }> = {
  owned: { fill: 0xb8902a, rim: 0xffe08a, text: '#1a1408' },
  free: { fill: 0x7a5fc0, rim: 0xd8c8ff, text: '#ffffff' },
  open: { fill: 0x2f5a2f, rim: 0x9dff9d, text: '#ffffff' },
  locked: { fill: 0x23281e, rim: 0x4a5040, text: '#7a806c' },
  honorOnly: { fill: 0x23281e, rim: 0x7a5fc0, text: '#a99ad0' },
};

type Gesture = 'none' | 'pan' | 'pinch';

/**
 * The Command Tent as an upgrade web: a central node with a spoke per upgrade, one node per
 * level running outward, lit gold as you buy them. Pan and pinch like the world map; tap a
 * node to see it in the panel below and buy it.
 */
export class WebScene extends Phaser.Scene {
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private nodes: WebNode[] = [];
  private webObjects: Phaser.GameObjects.GameObject[] = [];
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private selected: string | null = null;
  private minZoom = 0.3;
  private maxZoom = 3;
  private extent = 600;
  private gesture: Gesture = 'none';
  private moved = false;
  private downScreen = { x: 0, y: 0 };
  private lastScreen = { x: 0, y: 0 };
  private pinch = { distance: 1, zoom: 1, worldX: 0, worldY: 0 };

  constructor() {
    super('web');
  }

  create() {
    this.nodes = tentWeb();
    this.selected = null;
    this.webObjects = [];
    this.uiObjects = [];
    this.gesture = 'none';
    this.extent = Math.max(...this.nodes.map((n) => Math.hypot(n.x, n.y))) + 140;
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height).setOrigin(0, 0);

    this.drawWeb();
    this.fitCamera();
    this.buildUi();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
    const relayout = () => {
      this.fitCamera();
      this.buildUi();
    };
    this.scale.on('resize', relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', relayout));
  }

  // ----- Drawing ---------------------------------------------------------------------------

  private web<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiCam.ignore(obj);
    this.webObjects.push(obj);
    return obj;
  }

  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.cameras.main.ignore(obj);
    this.uiObjects.push(obj);
    return obj;
  }

  private stateOf(node: WebNode): NodeState {
    const save = loadSave();
    return tentNodeState(node, save.upgrades, save.honorEarned);
  }

  /** The links, the nodes (coloured by state) and each spoke's name at its tip. */
  private drawWeb() {
    for (const o of this.webObjects) o.destroy();
    this.webObjects = [];
    const g = this.web(this.add.graphics());
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    for (const n of this.nodes) {
      if (!n.parent) continue;
      const p = byId.get(n.parent)!;
      const lit = this.stateOf(n) === 'owned' || this.stateOf(n) === 'free';
      g.lineStyle(lit ? 8 : 5, lit ? 0xf2c94c : 0x3a4232, 1);
      g.lineBetween(p.x, p.y, n.x, n.y);
    }
    for (const n of this.nodes) {
      if (n.id === CENTER) {
        g.fillStyle(0x5a4a1f, 1).fillCircle(0, 0, NODE_RADIUS * 1.6);
        g.lineStyle(4, 0xf2c94c, 1).strokeCircle(0, 0, NODE_RADIUS * 1.6);
        this.web(
          this.add
            .text(0, 0, 'COMMAND\nTENT', { ...textStyle(18, COLORS.accent), align: 'center' })
            .setOrigin(0.5),
        );
        continue;
      }
      const state = this.stateOf(n);
      const look = LOOK[state];
      g.fillStyle(look.fill, 1).fillCircle(n.x, n.y, NODE_RADIUS);
      g.lineStyle(state === 'open' ? 6 : 4, look.rim, 1).strokeCircle(n.x, n.y, NODE_RADIUS);
      if (n.id === this.selected) {
        g.lineStyle(5, 0xffffff, 0.9).strokeCircle(n.x, n.y, NODE_RADIUS + 9);
      }
      this.web(this.add.text(n.x, n.y, String(n.level), textStyle(26, look.text)).setOrigin(0.5));
    }
    // Each spoke's name sits just past its last node.
    for (const u of UPGRADES) {
      const tip = this.nodes.filter((n) => n.upgrade === u.id).at(-1)!;
      const d = Math.hypot(tip.x, tip.y);
      const [x, y] = [tip.x + (tip.x / d) * 74, tip.y + (tip.y / d) * 62];
      this.web(
        this.add
          .text(x, y, u.name.replace(' ', '\n'), { ...textStyle(26), align: 'center' })
          .setOrigin(0.5)
          .setLineSpacing(-4),
      );
    }
  }

  // ----- UI --------------------------------------------------------------------------------

  private uiZoom(): number {
    const { width, height } = cssSize(this);
    const fit = Math.min(width / UI_DESIGN.width, height / UI_DESIGN.height);
    return Phaser.Math.Clamp(fit, 0.55, 1.3) * DPR;
  }

  private buildUi() {
    for (const o of this.uiObjects) o.destroy();
    this.uiObjects = [];
    const zoom = this.uiZoom();
    this.uiCam.setSize(this.scale.width, this.scale.height).setZoom(zoom);
    const w = this.scale.width / zoom;
    const h = this.scale.height / zoom;
    const save = loadSave();

    this.ui(this.add.rectangle(0, 0, w, 132, 0x000000, 0.5).setOrigin(0));
    this.ui(
      addButton(this, 90, 44, {
        width: 150,
        height: 64,
        label: 'BACK',
        labelSize: 30,
        onClick: () => this.scene.start('worldmap'),
      }),
    );
    this.ui(this.add.text(w / 2, 26, 'COMMAND TENT', textStyle(38, COLORS.accent)).setOrigin(0.5));
    this.ui(
      this.add
        .text(w / 2, 62, medalSummary(save.medals, save.medalsEarned), textStyle(22))
        .setOrigin(0.5),
    );
    // The Command Tent web, then the War College's pages.
    const tabs = [
      { label: 'COMMAND TENT', go: () => undefined, active: true },
      { label: 'WAR COLLEGE', go: () => this.scene.start('tent', { tab: 'college' }) },
      { label: 'ABILITIES', go: () => this.scene.start('tent', { tab: 'abilities' }) },
    ];
    tabs.forEach((t, i) => {
      this.ui(
        addButton(this, w / 2 + (i - 1) * 240, 106, {
          width: 228,
          height: 40,
          label: t.label,
          color: t.active ? 0x2f5f8a : 0x2a3324,
          labelSize: 22,
          onClick: t.go,
        }),
      );
    });
    this.panel(w, h);
  }

  /** The bottom panel: the tapped node (what it does, its price, BUY), or a hint. */
  private panel(w: number, h: number) {
    const panelW = Math.min(760, w - 24);
    const panelH = 112;
    const x0 = (w - panelW) / 2;
    const y0 = h - panelH - 10;
    const bg = this.ui(this.add.graphics());
    bg.fillStyle(0x000000, 0.75).fillRoundedRect(x0, y0, panelW, panelH, 14);
    bg.lineStyle(3, 0xf2c94c, 0.7).strokeRoundedRect(x0, y0, panelW, panelH, 14);
    this.ui(this.add.zone(x0, y0, panelW, panelH).setOrigin(0).setInteractive());
    const node = this.nodes.find((n) => n.id === this.selected);
    if (!node?.upgrade || !node.level) {
      this.ui(
        this.add
          .text(
            w / 2,
            y0 + panelH / 2,
            'Tap a green node to upgrade. Each level opens the next one out.',
            {
              ...textStyle(22),
              align: 'center',
              wordWrap: { width: panelW - 40 },
            },
          )
          .setOrigin(0.5),
      );
      return;
    }
    const save = loadSave();
    const def = UPGRADES.find((u) => u.id === node.upgrade)!;
    const state = this.stateOf(node);
    const max = this.nodes.filter((n) => n.upgrade === node.upgrade).length;
    const what =
      node.upgrade === 'adjutant'
        ? (ADJUTANT_LEVELS[node.level - 1] ?? '')
        : `Level ${node.level}: ${def.total(node.level)}`;
    const tx = x0 + 20;
    this.ui(this.add.text(tx, y0 + 12, `${def.name}  ·  ${node.level} of ${max}`, textStyle(28)));
    this.ui(
      this.add.text(tx, y0 + 50, what, {
        ...textStyle(21, COLORS.textDim),
        wordWrap: { width: panelW - 280 },
      }),
    );
    const bx = x0 + panelW - 120;
    const by = y0 + panelH / 2;
    if (state === 'open') {
      const cost = tentNodeCost(node, save.upgrades) ?? 0;
      const affordable = save.medals >= cost;
      this.ui(
        addButton(this, bx, by, {
          width: 210,
          height: 70,
          label: `BUY: ${medalCount(cost).toUpperCase()}`,
          color: affordable ? 0x2f6b3a : 0x3a3a3a,
          labelSize: 24,
          onClick: () => {
            if (buyUpgrade(node.upgrade!)) {
              sfx.capture();
              this.drawWeb();
              this.buildUi();
            } else {
              sfx.failed();
            }
          },
        }),
      );
      return;
    }
    const word: Record<NodeState, string> = {
      owned: 'OWNED',
      free: 'FREE (HONOR)',
      open: '',
      locked: 'BUY THE ONE\nBEFORE IT',
      honorOnly: 'LEARNED\nFROM HONOR',
    };
    this.ui(
      this.add
        .text(bx, by, word[state], { ...textStyle(22, COLORS.accent), align: 'center' })
        .setOrigin(0.5),
    );
  }

  // ----- Camera ----------------------------------------------------------------------------

  private toWorld(screenX: number, screenY: number): Point {
    const cam = this.cameras.main;
    return {
      x: (screenX - cam.width / 2) / cam.zoom + cam.width / 2 + cam.scrollX,
      y: (screenY - cam.height / 2) / cam.zoom + cam.height / 2 + cam.scrollY,
    };
  }

  /** Show as much of the web as fits while keeping nodes big enough to tap. */
  private fitCamera() {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    const tappable = (MIN_NODE_CSS * DPR) / NODE_RADIUS;
    this.maxZoom = Math.max(tappable * 3, 2 * DPR);
    this.minZoom = Math.min(cam.width, cam.height) / (this.extent * 2.2);
    const fit = Math.min(cam.width, cam.height * 0.7) / (this.extent * 2);
    cam.setZoom(Phaser.Math.Clamp(Math.max(fit, tappable), this.minZoom, this.maxZoom));
    // A little below centre, so the top bar covers less of the web.
    cam.centerOn(0, -40 / cam.zoom);
  }

  private zoomAt(zoom: number, screenX: number, screenY: number, world?: Point): number {
    const cam = this.cameras.main;
    const at = world ?? this.toWorld(screenX, screenY);
    const z = Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom);
    cam.setZoom(z);
    cam.scrollX = at.x - (screenX - cam.width / 2) / z - cam.width / 2;
    cam.scrollY = at.y - (screenY - cam.height / 2) / z - cam.height / 2;
    this.clampCamera();
    return z;
  }

  private clampCamera() {
    const cam = this.cameras.main;
    const e = this.extent;
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, -e, e);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, -e, e);
    cam.scrollX = cx - cam.width / 2;
    cam.scrollY = cy - cam.height / 2;
  }

  // ----- Input -----------------------------------------------------------------------------

  private activeTouches() {
    return [this.input.pointer1, this.input.pointer2, this.input.pointer3].filter(
      (p): p is Phaser.Input.Pointer => !!p && p.isDown,
    );
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) {
    this.zoomAt(this.cameras.main.zoom * (dy > 0 ? 0.8 : 1.25), p.x, p.y);
  }

  private onPointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    const touches = this.activeTouches();
    if (touches.length >= 2) {
      this.gesture = 'pinch';
      this.resetPinch(touches[0]!, touches[1]!);
      return;
    }
    // Presses on buttons and the panel belong to the UI.
    if (over.length > 0) {
      this.gesture = 'none';
      return;
    }
    this.gesture = 'pan';
    this.moved = false;
    this.downScreen = { x: p.x, y: p.y };
    this.lastScreen = { x: p.x, y: p.y };
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (this.gesture === 'pinch') {
      this.updatePinch();
      return;
    }
    if (this.gesture !== 'pan') return;
    if (Math.hypot(p.x - this.downScreen.x, p.y - this.downScreen.y) > TAP_SLOP_CSS * DPR) {
      this.moved = true;
    }
    if (this.moved) {
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - this.lastScreen.x) / cam.zoom;
      cam.scrollY -= (p.y - this.lastScreen.y) / cam.zoom;
      this.clampCamera();
    }
    this.lastScreen = { x: p.x, y: p.y };
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    if (this.gesture === 'pinch') {
      const left = this.activeTouches();
      if (left.length === 1) {
        this.gesture = 'pan';
        this.moved = true;
        this.lastScreen = { x: left[0]!.x, y: left[0]!.y };
      } else if (left.length === 0) {
        this.gesture = 'none';
      }
      return;
    }
    const tapped = this.gesture === 'pan' && !this.moved && !p.wasCanceled;
    this.gesture = 'none';
    if (tapped) this.tapAt(this.toWorld(p.x, p.y));
  }

  /** Select the node under a tap (with some slack, for fingers). */
  private tapAt(w: Point) {
    const reach = NODE_RADIUS + 14 / this.cameras.main.zoom;
    const hit = this.nodes
      .filter((n) => n.id !== CENTER)
      .find((n) => Math.hypot(n.x - w.x, n.y - w.y) <= reach);
    this.selected = hit?.id ?? null;
    if (hit) {
      sfx.click();
      // Glide the tapped node into view, clear of the top bar and the panel below.
      this.cameras.main.pan(hit.x, hit.y + 30 / this.cameras.main.zoom, 300, 'Sine.easeInOut');
    }
    this.drawWeb();
    this.buildUi();
  }

  private resetPinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer) {
    const mid = this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.cameras.main.zoom,
      worldX: mid.x,
      worldY: mid.y,
    };
  }

  private updatePinch() {
    const touches = this.activeTouches();
    if (touches.length < 2) return;
    const [a, b] = [touches[0]!, touches[1]!];
    const wanted = this.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.distance);
    const got = this.zoomAt(wanted, (a.x + b.x) / 2, (a.y + b.y) / 2, {
      x: this.pinch.worldX,
      y: this.pinch.worldY,
    });
    if (Math.abs(got - wanted) > 1e-6) this.resetPinch(a, b);
  }
}
