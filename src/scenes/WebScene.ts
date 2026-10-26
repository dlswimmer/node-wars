import Phaser from 'phaser';
import { sfx } from '../audio';
import { DPR, cssSize } from '../display';
import { buyCollege, buyUpgrade, loadSave } from '../save';
import type { AbilityId } from '../sim/abilities';
import { insignia } from '../sim/college';
import {
  COLLEGE_CENTER,
  COLLEGE_LINES,
  THEME_NAMES,
  collegeCost,
  collegeEffects,
  collegeLabel,
  collegeNodeAt,
  collegeState,
  collegeWeb,
  themeText,
  visibleRings,
  type CollegeNode,
  type CollegeState,
  type Theme,
} from '../sim/collegeweb';
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

/** A node's look: its state, or 'dear' for one you could buy but can't afford yet. */
type Look = NodeState | 'dear';

/** How each look is drawn: fill, rim, and text colour. */
const LOOK: Record<Look, { fill: number; rim: number; text: string }> = {
  owned: { fill: 0xb8902a, rim: 0xffe08a, text: '#1a1408' },
  free: { fill: 0x7a5fc0, rim: 0xd8c8ff, text: '#ffffff' },
  open: { fill: 0x2f5a2f, rim: 0x9dff9d, text: '#ffffff' },
  dear: { fill: 0x3a3020, rim: 0xb07a3a, text: '#d8b880' },
  locked: { fill: 0x23281e, rim: 0x4a5040, text: '#7a806c' },
  honorOnly: { fill: 0x23281e, rim: 0x7a5fc0, text: '#a99ad0' },
};

/** Each War College direction's colour, for its nodes' labels before they're bought. */
const THEME_COLOR: Record<Theme, string> = {
  attack: '#ff8a7a',
  production: '#9dff9d',
  speed: '#8ad8ff',
  startMedals: '#ffd27a',
  capacity: '#c8b0ff',
  medals: '#f2c94c',
};
/** Short words inside small War College nodes. */
const THEME_SHORT: Record<Theme, string> = {
  attack: 'HIT',
  production: 'BUILD',
  speed: 'SPEED',
  startMedals: 'START',
  capacity: 'BASE',
  medals: 'PAY',
};
const ABILITY_SHORT: Record<AbilityId, string> = {
  airStrike: 'AIR',
  supplyDrop: 'DROP',
  charge: 'GO!',
};

/** Which web is showing: the Command Tent (medals, this war) or the War College (Honor). */
type WebKind = 'tent' | 'college';

type Gesture = 'none' | 'pan' | 'pinch';

/**
 * The upgrade webs. The Command Tent: a central node with a spoke per upgrade, one node per
 * level running outward. The War College: an endless hex web where any node touching one you
 * own can be bought. Pan and pinch like the world map; tap a node to see it in the panel below
 * and buy it.
 */
export class WebScene extends Phaser.Scene {
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private kind: WebKind = 'tent';
  private nodes: WebNode[] = [];
  private hexes: CollegeNode[] = [];
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

  init(data: { web?: WebKind }) {
    this.kind = data.web ?? 'tent';
  }

  create() {
    this.selected = null;
    this.webObjects = [];
    this.uiObjects = [];
    this.gesture = 'none';
    this.layoutNodes();
    this.cameras.main.setBackgroundColor(BACKGROUND);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height).setOrigin(0, 0);

    this.drawWeb();
    this.fitCamera();
    this.buildUi();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('wheel', this.onWheel, this);
    // A resize keeps what you're looking at (iPad Safari resizes as its toolbars come and go,
    // which used to snap the view back mid-drag).
    const relayout = () => {
      this.fitCamera(true);
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

  /** The nodes to show (the War College shows more rings as you buy further out). */
  private layoutNodes() {
    if (this.kind === 'college') {
      this.nodes = [];
      this.hexes = collegeWeb(visibleRings(loadSave().college));
    } else {
      this.nodes = tentWeb();
      this.hexes = [];
    }
    const all: Point[] = [...this.nodes, ...this.hexes];
    this.extent = Math.max(...all.map((n) => Math.hypot(n.x, n.y))) + 160;
  }

  private stateOf(node: WebNode): NodeState {
    const save = loadSave();
    return tentNodeState(node, save.upgrades, save.honorEarned);
  }

  private hexState(node: CollegeNode): CollegeState {
    return collegeState(node, loadSave().college);
  }

  /** War College nodes: notables and abilities are bigger. */
  private hexRadius(node: CollegeNode): number {
    return node.kind === 'small' ? NODE_RADIUS : NODE_RADIUS * 1.3;
  }

  private drawWeb() {
    for (const o of this.webObjects) o.destroy();
    this.webObjects = [];
    if (this.kind === 'college') this.drawCollege();
    else this.drawTent();
  }

  /** The War College: links between touching nodes, the nodes, and each direction's name. */
  private drawCollege() {
    const save = loadSave();
    const g = this.web(this.add.graphics());
    const byId = new Map(this.hexes.map((n) => [n.id, n]));
    const owned = (n: CollegeNode) => this.hexState(n) === 'owned';
    for (const n of this.hexes) {
      // Half the directions, so each link is drawn once.
      for (const d of COLLEGE_LINES.slice(0, 3)) {
        const m = byId.get(collegeNodeAt(n.q + d.q, n.r + d.r).id);
        if (!m) continue;
        const lit = owned(n) && owned(m);
        g.lineStyle(lit ? 8 : 4, lit ? 0xf2c94c : 0x2e3528, 1);
        g.lineBetween(n.x, n.y, m.x, m.y);
      }
    }
    for (const n of this.hexes) {
      if (n.id === COLLEGE_CENTER) {
        g.fillStyle(0x5a4a1f, 1).fillCircle(0, 0, NODE_RADIUS * 1.5);
        g.lineStyle(4, 0xf2c94c, 1).strokeCircle(0, 0, NODE_RADIUS * 1.5);
        this.web(
          this.add
            .text(0, 0, 'WAR\nCOLLEGE', { ...textStyle(17, COLORS.accent), align: 'center' })
            .setOrigin(0.5),
        );
        continue;
      }
      const state = this.hexState(n);
      // Open but too dear: a dull amber rim instead of bright green.
      const dear = state === 'open' && save.honor < collegeCost(n);
      const look = LOOK[dear ? 'dear' : state];
      const r = this.hexRadius(n);
      // Abilities glow purple until bought, so they stand out as goals.
      const fill = n.ability && state !== 'owned' ? 0x3a2f5a : look.fill;
      g.fillStyle(fill, 1).fillCircle(n.x, n.y, r);
      g.lineStyle(state === 'open' && !dear ? 6 : 4, look.rim, 1).strokeCircle(n.x, n.y, r);
      if (n.id === this.selected) g.lineStyle(5, 0xffffff, 0.9).strokeCircle(n.x, n.y, r + 9);
      const label = n.ability
        ? ABILITY_SHORT[n.ability]
        : n.kind === 'notable'
          ? '★'
          : THEME_SHORT[n.theme];
      const color = state === 'owned' ? '#ffffff' : THEME_COLOR[n.theme];
      const size = n.kind === 'notable' ? 36 : n.ability ? 21 : 17;
      this.web(this.add.text(n.x, n.y, label, textStyle(size, color)).setOrigin(0.5));
    }
    // Each direction's name, just past the edge of the web along its main line.
    const rings = Math.max(...this.hexes.map((n) => n.ring));
    for (const line of COLLEGE_LINES) {
      const step = collegeNodeAt(line.q, line.r);
      const k = rings + 0.85;
      this.web(
        this.add
          .text(step.x * k, step.y * k, THEME_NAMES[line.theme].replace(' ', '\n'), {
            ...textStyle(26, THEME_COLOR[line.theme]),
            align: 'center',
          })
          .setOrigin(0.5)
          .setLineSpacing(-4),
      );
    }
  }

  /** The Command Tent: the links, the nodes (coloured by state) and each spoke's name. */
  private drawTent() {
    const save = loadSave();
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
      const dear = state === 'open' && save.medals < (tentNodeCost(n, save.upgrades) ?? 0);
      const look = LOOK[dear ? 'dear' : state];
      g.fillStyle(look.fill, 1).fillCircle(n.x, n.y, NODE_RADIUS);
      const rim = state === 'open' && !dear ? 6 : 4;
      g.lineStyle(rim, look.rim, 1).strokeCircle(n.x, n.y, NODE_RADIUS);
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
    const college = this.kind === 'college';
    const title = college ? 'WAR COLLEGE' : 'COMMAND TENT';
    const wallet = college
      ? `${insignia(save.retreats)} · ${save.honor} Honor`
      : medalSummary(save.medals, save.medalsEarned);
    this.ui(this.add.text(w / 2, 26, title, textStyle(38, COLORS.accent)).setOrigin(0.5));
    this.ui(this.add.text(w / 2, 62, wallet, textStyle(22)).setOrigin(0.5));
    // The two webs, then the stats and the rank and retreat pages.
    const tabs = [
      { label: 'COMMAND TENT', active: !college, go: () => this.scene.restart({ web: 'tent' }) },
      { label: 'WAR COLLEGE', active: college, go: () => this.scene.restart({ web: 'college' }) },
      { label: 'STATS', active: false, go: () => this.scene.start('tent', { page: 'stats' }) },
      {
        label: 'RANK & RETREAT',
        active: false,
        go: () => this.scene.start('tent', { page: 'rank' }),
      },
    ];
    tabs.forEach((t, i) => {
      this.ui(
        addButton(this, w / 2 + (i - 1.5) * 214, 106, {
          width: 204,
          height: 40,
          label: t.label,
          color: t.active ? 0x2f5f8a : 0x2a3324,
          labelSize: 19,
          onClick: t.active ? () => undefined : t.go,
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
    const box = { w, x0, y0, panelW, panelH };
    if (this.kind === 'college') this.collegePanel(box);
    else this.tentPanel(box);
  }

  private hint(box: PanelBox, text: string) {
    this.ui(
      this.add
        .text(box.w / 2, box.y0 + box.panelH / 2, text, {
          ...textStyle(22),
          align: 'center',
          wordWrap: { width: box.panelW - 40 },
        })
        .setOrigin(0.5),
    );
  }

  /** The node's name and what it does, on the left of the panel. */
  private describe(box: PanelBox, title: string, what: string) {
    const tx = box.x0 + 20;
    this.ui(this.add.text(tx, box.y0 + 12, title, textStyle(28)));
    this.ui(
      this.add.text(tx, box.y0 + 50, what, {
        ...textStyle(20, COLORS.textDim),
        wordWrap: { width: box.panelW - 280 },
      }),
    );
  }

  /** The BUY button on the right of the panel. */
  private buyButton(box: PanelBox, label: string, affordable: boolean, buy: () => boolean) {
    this.ui(
      addButton(this, box.x0 + box.panelW - 120, box.y0 + box.panelH / 2, {
        width: 210,
        height: 70,
        label,
        color: affordable ? 0x2f6b3a : 0x3a3a3a,
        labelSize: 24,
        onClick: () => {
          if (buy()) {
            sfx.capture();
            this.layoutNodes();
            this.drawWeb();
            this.buildUi();
          } else {
            sfx.failed();
          }
        },
      }),
    );
  }

  /** A word in place of the BUY button (OWNED, locked, ...). */
  private stateWord(box: PanelBox, word: string) {
    const [bx, by] = [box.x0 + box.panelW - 120, box.y0 + box.panelH / 2];
    this.ui(
      this.add
        .text(bx, by, word, { ...textStyle(22, COLORS.accent), align: 'center' })
        .setOrigin(0.5),
    );
  }

  private tentPanel(box: PanelBox) {
    const node = this.nodes.find((n) => n.id === this.selected);
    if (!node?.upgrade || !node.level) {
      this.hint(
        box,
        'Green nodes you can buy now; brown ones need more medals. Each level opens the next one out.',
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
    this.describe(box, `${def.name}  ·  ${node.level} of ${max}`, what);
    if (state === 'open') {
      const cost = tentNodeCost(node, save.upgrades) ?? 0;
      const short = Math.ceil(cost - save.medals - 1e-9);
      const label = short > 0 ? `NEED ${short} MORE` : `BUY: ${medalCount(cost).toUpperCase()}`;
      this.buyButton(box, label, short <= 0, () => buyUpgrade(node.upgrade!));
      return;
    }
    const word: Record<NodeState, string> = {
      owned: 'OWNED',
      free: 'FREE (HONOR)',
      open: '',
      locked: 'BUY THE ONE\nBEFORE IT',
      honorOnly: 'LEARNED\nFROM HONOR',
    };
    this.stateWord(box, word[state]);
  }

  /** The War College panel: the node, what it gives, what you have of it already, and BUY. */
  private collegePanel(box: PanelBox) {
    const node = this.hexes.find((n) => n.id === this.selected);
    if (!node || node.id === COLLEGE_CENTER) {
      // Right after a Tactical Retreat: spend before the first battle (starting medals count).
      const save = loadSave();
      const fresh = save.retreats > 0 && save.conquest.battles === 0;
      this.hint(
        box,
        fresh
          ? 'New war! Spend your Honor before you fight: STARTING MEDALS pay out right away.'
          : 'Honor buys upgrades for good. Green nodes you can buy now; brown ones need more Honor.',
      );
      return;
    }
    const save = loadSave();
    const { name, text } = collegeLabel(node);
    const state = this.hexState(node);
    const kind = node.ability ? 'ABILITY' : node.kind === 'notable' ? '★ BIG ONE' : 'SMALL';
    const steps = collegeEffects(save.college).steps[node.theme];
    const have = !node.ability && steps > 0 ? `\nYou have: ${themeText(node.theme, steps)}` : '';
    this.describe(box, `${name}  ·  ${kind}`, `${node.ability ? text : `Gives: ${text}`}${have}`);
    if (state === 'open') {
      const cost = collegeCost(node);
      const short = cost - save.honor;
      const label = short > 0 ? `NEED ${short} MORE` : `BUY: ${cost} HONOR`;
      this.buyButton(box, label, short <= 0, () => buyCollege(node.id));
      return;
    }
    this.stateWord(box, state === 'owned' ? 'OWNED' : 'BUY ONE\nNEXT TO IT');
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
  private fitCamera(keepView = false) {
    const cam = this.cameras.main;
    const was = {
      zoom: cam.zoom,
      x: cam.scrollX + cam.width / 2,
      y: cam.scrollY + cam.height / 2,
    };
    cam.setSize(this.scale.width, this.scale.height);
    const tappable = (MIN_NODE_CSS * DPR) / NODE_RADIUS;
    this.maxZoom = Math.max(tappable * 3, 2 * DPR);
    this.minZoom = Math.min(cam.width, cam.height) / (this.extent * 2.2);
    if (keepView) {
      cam.setZoom(Phaser.Math.Clamp(was.zoom, this.minZoom, this.maxZoom));
      cam.centerOn(was.x, was.y);
      this.clampCamera();
      return;
    }
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
    const slack = 14 / this.cameras.main.zoom;
    const near = (n: Point, r: number) => Math.hypot(n.x - w.x, n.y - w.y) <= r + slack;
    const hit =
      this.kind === 'college'
        ? this.hexes.find((n) => n.id !== COLLEGE_CENTER && near(n, this.hexRadius(n)))
        : this.nodes.find((n) => n.id !== CENTER && near(n, NODE_RADIUS));
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

/** Where the bottom panel sits, in UI units. */
interface PanelBox {
  w: number;
  x0: number;
  y0: number;
  panelW: number;
  panelH: number;
}
