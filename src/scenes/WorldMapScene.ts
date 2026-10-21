import Phaser from 'phaser';
import { sfx } from '../audio';
import { DPR, cssSize } from '../display';
import { canAutoBattle, loadSave, starsUnlocked } from '../save';
import { difficultyForStars } from '../sim/difficulty';
import type { Point } from '../sim/types';
import { medalCount } from '../sim/economy';
import { medalsFor } from '../sim/upgrades';
import {
  START_ID,
  availableRegions,
  unlockMedals,
  fogRegions,
  getRegion,
  type ConquestState,
} from '../sim/worldmap';
import { centroid, insidePolygon } from '../sim/scenery';
import { COLORS, textStyle } from '../theme';
import type { BattleData } from './BattleScene';
import { addButton, addMuteButton } from './ui';

export interface WorldMapData {
  /** Region just fought over; the camera starts there. */
  focus?: string | null;
  /** Regions a win just revealed, to animate in. */
  revealed?: string[];
}

const BACKGROUND = 0x0f150c;
const FOG = { fill: 0x1d2717, line: 0x34452a };
const AVAILABLE = { fill: 0x7a806c, line: 0xe1e5d0 };
/** Available but locked until you've earned more medals. */
const LOCKED = { fill: 0x4a4d42, line: 0x9a9e8a };
const HELD = { fill: 0x2f6fd0, line: 0xa9ccff };
const SELECTED_LINE = 0xf2c94c;
/** Pointer travel (CSS px) before a press counts as a drag rather than a tap. */
const TAP_SLOP_CSS = 14;
/** Zoom (CSS px per map unit) at which region labels are comfortably readable. */
const READABLE_CSS = 1.35;
/** The UI is laid out at this size (then zoomed to fit), like the menus. */
const UI_DESIGN = { width: 1000, height: 560 };

type Gesture = 'none' | 'pan' | 'pinch';

/**
 * The campaign's conquest map: your regions in blue, the ones you can attack in gray with
 * their stars and reward, fog beyond. Pan and zoom it like a battle; tap a region to fight.
 * The world camera zooms over the map; a second camera draws the UI at a fixed size.
 */
export class WorldMapScene extends Phaser.Scene {
  private conquest!: ConquestState;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  /** Outline highlight for the selected region. */
  private selectGfx!: Phaser.GameObjects.Graphics;
  private selected: string | null = null;
  private focus: string | null = null;
  private revealed: string[] = [];
  private animating = false;

  private box = new Phaser.Geom.Rectangle();
  private minZoom = 1;
  private maxZoom = 4;
  private gesture: Gesture = 'none';
  private moved = false;
  private downScreen = { x: 0, y: 0 };
  private lastScreen = { x: 0, y: 0 };
  private pinch = { distance: 1, zoom: 1, worldX: 0, worldY: 0 };

  constructor() {
    super('worldmap');
  }

  init(data: WorldMapData) {
    this.focus = data.focus ?? null;
    this.revealed = data.revealed ?? [];
  }

  create() {
    this.conquest = loadSave().conquest;
    this.selected = null;
    this.uiObjects = [];
    this.gesture = 'none';
    const cam = this.cameras.main;
    cam.setBackgroundColor(BACKGROUND);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height).setOrigin(0, 0);

    const animate = this.revealed.length > 0 && !!this.focus;
    this.drawMap(animate);
    this.selectGfx = this.world(this.add.graphics().setDepth(5));
    this.fitCamera();

    // A new campaign: the first battle is already picked.
    if (this.conquest.held.length === 0) this.selected = START_ID;
    this.buildUi();
    if (animate) this.playReveal();

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

  /** Mark an object as part of the map (the UI camera skips it). */
  private world<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiCam.ignore(obj);
    return obj;
  }

  /** Mark an object as UI (the map camera skips it). */
  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.cameras.main.ignore(obj);
    this.uiObjects.push(obj);
    return obj;
  }

  private polygon(id: string): Point[] {
    return getRegion(this.conquest.seed, id).polygon;
  }

  private fillRegion(id: string, style: { fill: number; line: number }, alpha = 1) {
    const g = this.world(this.add.graphics());
    const poly = this.polygon(id);
    g.fillStyle(style.fill, alpha).fillPoints(poly, true);
    g.lineStyle(1.6, style.line, 0.9 * alpha).strokePoints(poly, true, true);
    return g;
  }

  private drawMap(animate: boolean) {
    const held = this.conquest.held;
    const fresh = new Set(this.revealed);
    for (const id of fogRegions(this.conquest)) this.fillRegion(id, FOG);
    // Newly revealed regions start as fog and fade in during the reveal.
    for (const id of fresh) if (animate) this.fillRegion(id, FOG).setName(`fog:${id}`);

    for (const id of availableRegions(this.conquest)) {
      const locked = !starsUnlocked(this.conquest.regions[id]!.stars);
      const g = this.fillRegion(id, locked ? LOCKED : AVAILABLE).setName(`region:${id}`);
      const labels = this.regionLabels(id, false);
      if (animate && fresh.has(id)) {
        g.setAlpha(0);
        for (const l of labels) l.setAlpha(0).setName(`label:${id}`);
      }
    }
    for (const id of held) {
      const g = this.fillRegion(id, HELD).setName(`region:${id}`);
      this.regionLabels(id, true);
      if (animate && id === this.focus) {
        g.setAlpha(0);
        // The region you just won starts gray and turns blue.
        this.fillRegion(id, AVAILABLE).setName(`was:${id}`).setDepth(1);
      }
    }
  }

  private regionLabels(id: string, held: boolean): Phaser.GameObjects.Text[] {
    const region = getRegion(this.conquest.seed, id);
    const c = centroid(region.polygon);
    // Two short lines fit inside a region better than one long one.
    const title = region.name.toUpperCase().replace(' ', '\n');
    const name = this.world(
      this.add
        .text(c.x, c.y - (held ? 0 : 20), title, { ...textStyle(12), align: 'center' })
        .setLineSpacing(-3)
        .setOrigin(0.5)
        .setDepth(3),
    );
    if (held) return [name];
    const stars = this.conquest.regions[id]!.stars;
    const first = id === START_ID && this.conquest.held.length === 0;
    const badge = this.world(
      this.add
        .text(c.x, c.y + 6, first ? 'FIRST\nBATTLE' : '★'.repeat(stars), {
          ...textStyle(first ? 13 : 16),
          align: 'center',
        })
        .setColor(COLORS.accent)
        .setOrigin(0.5, first ? 0.2 : 0.5)
        .setDepth(3),
    );
    const pay = medalsFor(stars, true);
    const locked = !starsUnlocked(stars);
    const reward = this.world(
      this.add
        .text(
          c.x,
          c.y + (first ? 38 : 22),
          locked ? `LOCKED: ${unlockMedals(stars)} MEDALS` : `+${medalCount(pay).toUpperCase()}`,
          textStyle(10, locked ? '#ff9a9e' : COLORS.text),
        )
        .setOrigin(0.5)
        .setDepth(3),
    );
    return [name, badge, reward];
  }

  private drawSelection() {
    this.selectGfx.clear();
    if (!this.selected) return;
    this.selectGfx.lineStyle(4, SELECTED_LINE, 1).strokePoints(this.polygon(this.selected), true);
  }

  /** After a win: the region turns blue, the camera pulls back and the new neighbours appear. */
  private playReveal() {
    this.animating = true;
    const focus = this.focus!;
    const c = centroid(this.polygon(focus));
    const end = this.fitView();
    this.setView(Math.min(this.maxZoom, end.zoom * 1.8), c.x, c.y);
    const find = (name: string) => this.children.getByName(name) as Phaser.GameObjects.Graphics;

    this.tweens.add({
      targets: find(`region:${focus}`),
      alpha: 1,
      delay: 350,
      duration: 450,
      onStart: () => sfx.capture(),
    });
    this.tweens.add({ targets: find(`was:${focus}`), alpha: 0, delay: 350, duration: 450 });

    const view = { zoom: this.cameras.main.zoom, x: c.x, y: c.y };
    this.tweens.add({
      targets: view,
      zoom: end.zoom,
      x: end.x,
      y: end.y,
      delay: 900,
      duration: 900,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.setView(view.zoom, view.x, view.y),
    });

    this.revealed.forEach((id, i) => {
      const delay = 1500 + i * 160;
      this.tweens.add({ targets: find(`region:${id}`), alpha: 1, delay, duration: 350 });
      this.tweens.add({ targets: find(`fog:${id}`), alpha: 0, delay, duration: 350 });
      const labels = this.children.list.filter((o) => o.name === `label:${id}`);
      for (const l of labels as Phaser.GameObjects.Text[]) {
        l.setScale(0.3);
        this.tweens.add({
          targets: l,
          alpha: 1,
          scale: 1,
          delay: delay + 120,
          duration: 300,
          ease: 'Back.easeOut',
          onStart: i === 0 && l === labels[0] ? () => sfx.send() : undefined,
        });
      }
    });
    this.time.delayedCall(1700 + this.revealed.length * 160, () => {
      this.animating = false;
    });
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

    // A dark strip behind the top bar keeps it readable over the map.
    this.ui(this.add.rectangle(0, 0, w, 84, 0x000000, 0.45).setOrigin(0));
    this.ui(
      addButton(this, 90, 44, {
        width: 150,
        height: 64,
        label: 'BACK',
        labelSize: 30,
        onClick: () => this.scene.start('menu'),
      }),
    );
    this.ui(
      this.add.text(w / 2, 26, 'WORLD MAP', textStyle(38, COLORS.accent)).setOrigin(0.5, 0.5),
    );
    this.ui(this.add.text(w / 2, 60, medalCount(save.medals), textStyle(22)).setOrigin(0.5, 0.5));
    this.ui(
      addButton(this, w - 230, 44, {
        width: 240,
        height: 64,
        label: 'COMMAND TENT',
        color: 0x5a4a1f,
        labelSize: 26,
        onClick: () => this.scene.start('tent'),
      }),
    );
    this.ui(addMuteButton(this, w - 48, 44, 64));

    if (this.selected) this.regionPanel(this.selected, w, h);
    else {
      const tip =
        this.conquest.held.length > 0
          ? 'Tap a gray region to pick your next battle'
          : 'Tap the gray region to start';
      this.ui(
        this.add.text(w / 2, h - 30, tip, { ...textStyle(26), align: 'center' }).setOrigin(0.5, 1),
      );
    }
    this.drawSelection();
  }

  /** Bottom panel for the selected region: what it is, what it pays, and FIGHT. */
  private regionPanel(id: string, w: number, h: number) {
    const region = getRegion(this.conquest.seed, id);
    const progress = this.conquest.regions[id];
    const held = this.conquest.held.includes(id);
    const panelW = Math.min(720, w - 24);
    const panelH = 140;
    const x0 = (w - panelW) / 2;
    const y0 = h - panelH - 12;
    const bg = this.ui(this.add.graphics());
    bg.fillStyle(0x000000, 0.72).fillRoundedRect(x0, y0, panelW, panelH, 16);
    bg.lineStyle(3, held ? HELD.line : SELECTED_LINE, 0.8);
    bg.strokeRoundedRect(x0, y0, panelW, panelH, 16);
    // Swallow taps on the panel so they don't select what's underneath.
    this.ui(this.add.zone(x0, y0, panelW, panelH).setOrigin(0).setInteractive());

    const textX = x0 + 22;
    this.ui(this.add.text(textX, y0 + 14, region.name.toUpperCase(), textStyle(32)));
    let line2 = '';
    let line3 = '';
    let locked = false;
    if (!progress) {
      line2 = 'Unknown land';
      line3 = 'Win a region next to it to explore';
    } else {
      const d = difficultyForStars(progress.stars);
      const pay = `+${medalCount(medalsFor(progress.stars, true))}`;
      const first = id === START_ID && !held;
      locked = !held && !starsUnlocked(progress.stars);
      const need = unlockMedals(progress.stars) - loadSave().medalsEarned;
      line2 = first ? 'FIRST BATTLE' : `${'★'.repeat(progress.stars)}  ${d.label}`;
      line3 = held
        ? `Yours · won ${progress.wins} time${progress.wins === 1 ? '' : 's'} · ${pay} a win`
        : locked
          ? `LOCKED · earn ${medalCount(need)} more to unlock`
          : first
            ? `An easy one to learn · ${pay}`
            : `Win it for ${pay}`;
    }
    this.ui(this.add.text(textX, y0 + 56, line2, textStyle(26, COLORS.accent)));
    this.ui(
      this.add.text(textX, y0 + 94, line3, textStyle(21, locked ? '#ff9a9e' : COLORS.textDim)),
    );
    if (!progress || locked) return;

    const fight = (auto: boolean) => {
      const data: BattleData = { mode: 'campaign', region: id, auto };
      this.scene.start('battle', data);
    };
    const buttonX = x0 + panelW - 110;
    const auto = held && canAutoBattle(id);
    this.ui(
      addButton(this, buttonX, y0 + (auto ? 42 : panelH / 2), {
        width: 190,
        height: auto ? 64 : 96,
        label: held ? 'REPLAY' : 'FIGHT!',
        color: 0x2f6b3a,
        labelSize: auto ? 30 : 44,
        onClick: () => fight(false),
      }),
    );
    if (auto) {
      this.ui(
        addButton(this, buttonX, y0 + 104, {
          width: 190,
          height: 52,
          label: 'AUTO-BATTLE',
          color: 0x4a2f7a,
          labelSize: 24,
          onClick: () => fight(true),
        }),
      );
    }
  }

  // ----- Camera ----------------------------------------------------------------------------

  /** Screen (canvas) pixels to map coordinates. */
  private toWorld(screenX: number, screenY: number): Point {
    const cam = this.cameras.main;
    return {
      x: (screenX - cam.width / 2) / cam.zoom + cam.width / 2 + cam.scrollX,
      y: (screenY - cam.height / 2) / cam.zoom + cam.height / 2 + cam.scrollY,
    };
  }

  /** Every region on the map (yours, available and fog), as one bounding box. */
  private bounds(ids: string[]): Phaser.Geom.Rectangle {
    const pts = ids.flatMap((id) => this.polygon(id));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
    return new Phaser.Geom.Rectangle(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0);
  }

  /** The view that shows all your regions and the ones you can attack. */
  private fitView() {
    const cam = this.cameras.main;
    const known = this.bounds([...this.conquest.held, ...availableRegions(this.conquest)]);
    // Leave room for the top bar and the region panel.
    const fit = Math.min(cam.width / (known.width + 60), cam.height / (known.height * 1.35 + 60));
    const readable = Math.min(READABLE_CSS * DPR, this.maxZoom);
    if (fit >= readable) {
      // Nudged so the region panel at the bottom covers less of it.
      const zoom = Math.min(fit, this.maxZoom);
      return { zoom, x: known.centerX, y: known.centerY + known.height * 0.1 };
    }
    // Too much to show at a readable size (phones): stay close to the last battle and let the
    // player pan or pinch out for the rest.
    const c = this.focus
      ? centroid(this.polygon(this.focus))
      : { x: known.centerX, y: known.centerY };
    return { zoom: readable, x: c.x, y: c.y + 20 };
  }

  private fitCamera() {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    const all = [
      ...this.conquest.held,
      ...availableRegions(this.conquest),
      ...fogRegions(this.conquest),
    ];
    this.box = this.bounds(all);
    Phaser.Geom.Rectangle.Inflate(this.box, 40, 40);
    // Zoom in until a region fills about half the screen's height; out to see everything.
    this.maxZoom = cam.height / 220;
    this.minZoom = Math.min(
      cam.width / this.box.width,
      cam.height / this.box.height,
      this.maxZoom * 0.9,
    );
    const view = this.fitView();
    this.setView(view.zoom, view.x, view.y);
  }

  private setView(zoom: number, x: number, y: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom));
    cam.centerOn(
      Phaser.Math.Clamp(x, this.box.left, this.box.right),
      Phaser.Math.Clamp(y, this.box.top, this.box.bottom),
    );
  }

  /** Zoom so the map point under a screen point stays put. */
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
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, this.box.left, this.box.right);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, this.box.top, this.box.bottom);
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
    if (this.animating) return;
    this.zoomAt(this.cameras.main.zoom * (dy > 0 ? 0.8 : 1.25), p.x, p.y);
  }

  private onPointerDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (this.animating) return;
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

  private tapAt(w: Point) {
    const candidates = [
      ...this.conquest.held,
      ...availableRegions(this.conquest),
      ...fogRegions(this.conquest),
    ];
    const hit = candidates.find((id) => insidePolygon(w, this.polygon(id))) ?? null;
    if (hit === this.selected) return;
    this.selected = hit;
    if (hit) sfx.click();
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
    // At a zoom limit, start measuring again so pinching back responds immediately.
    if (Math.abs(got - wanted) > 1e-6) this.resetPinch(a, b);
  }
}
