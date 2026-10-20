import Phaser from 'phaser';
import { DPR, cssToWorld } from '../display';
import { createAi, updateAi, type AiState } from '../sim/ai';
import { BASE_STATS, DEFAULT_SEND_FRACTION } from '../sim/config';
import {
  DIFFICULTIES,
  worldOptionsFor,
  type Difficulty,
  type DifficultyId,
} from '../sim/difficulty';
import { LEVELS } from '../sim/levels';
import type { Base, LevelDef, World } from '../sim/types';
import {
  baseAt,
  basesAlongSegment,
  createWorld,
  getBonuses,
  isShielded,
  previewAttack,
  sendTroops,
  step,
} from '../sim/world';
import { loadDifficulty } from '../settings';
import { COLORS, FACTION_COLORS, textStyle } from '../theme';
import { drawBase, drawCapacityRing, drawMapGrid } from './drawing';
import type { HudScene } from './HudScene';

const MAX_DT = 0.1;
/** Finger-friendly hit area around a base, in CSS pixels. */
const TOUCH_PADDING_CSS = 30;
/** Pointer travel (CSS px) before a press counts as a drag rather than a tap. */
const TAP_SLOP_CSS = 14;

export interface BattleData {
  difficulty?: DifficultyId;
}

type Gesture = 'none' | 'drag' | 'pan' | 'pinch';

interface Effect {
  kind: 'ring' | 'flash';
  x: number;
  y: number;
  radius: number;
  color: number;
  age: number;
  duration: number;
}

export class BattleScene extends Phaser.Scene {
  world!: World;
  difficulty: Difficulty = DIFFICULTIES.soldier;
  level!: LevelDef;
  paused = false;
  gameOver = false;

  private ai!: AiState;
  private baseGfx!: Phaser.GameObjects.Graphics;
  private unitGfx!: Phaser.GameObjects.Graphics;
  private orderGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private troopLabels: Phaser.GameObjects.Text[] = [];
  private previewLabel!: Phaser.GameObjects.Text;
  private effects: Effect[] = [];
  private lastHitFx = new Map<number, number>();

  /** Bases picked during the current drag. */
  private selected = new Set<number>();
  /** Bases picked by a tap, waiting for a second tap on the target. */
  private armed = new Set<number>();
  private gesture: Gesture = 'none';
  private dragStartId = -1;
  /** The current press started on another of your bases while one was armed. */
  private tapMightReinforce = false;
  private moved = false;
  private downScreen = { x: 0, y: 0 };
  private lastScreen = { x: 0, y: 0 };
  private lastWorld = { x: 0, y: 0 };
  private pinch = { distance: 1, zoom: 1, worldX: 0, worldY: 0 };

  /** Region of the world the camera may show, and the zoom limits for this screen. */
  private box = new Phaser.Geom.Rectangle();
  private minZoom = 1;
  private maxZoom = 2;

  constructor() {
    super('battle');
  }

  init(data: BattleData) {
    this.difficulty = DIFFICULTIES[data.difficulty ?? loadDifficulty() ?? 'soldier'];
  }

  create() {
    this.level = LEVELS[0]!;
    this.world = createWorld(this.level, worldOptionsFor(this.difficulty, Date.now() & 0xffff));
    this.ai = createAi('enemy', this.difficulty);
    this.selected.clear();
    this.armed.clear();
    this.effects = [];
    this.lastHitFx.clear();
    this.gesture = 'none';
    this.paused = false;
    this.gameOver = false;

    this.box = contentBox(this.world);
    const grid = this.add.graphics();
    drawMapGrid(grid, this.box.width + 2000, this.box.height + 2000);
    grid.setPosition(this.box.x - 1000, this.box.y - 1000);

    this.orderGfx = this.add.graphics();
    this.fxGfx = this.add.graphics();
    this.baseGfx = this.add.graphics();
    this.unitGfx = this.add.graphics();

    this.troopLabels = this.world.bases.map((b) => {
      this.add
        .text(
          b.x,
          b.y + BASE_STATS[b.kind].radius + 12,
          BASE_STATS[b.kind].label,
          textStyle(22, COLORS.textDim),
        )
        .setOrigin(0.5, 0);
      return this.add.text(b.x, b.y, '', textStyle(b.kind === 'hq' ? 34 : 30)).setOrigin(0.5);
    });
    this.previewLabel = this.add
      .text(0, 0, '', { ...textStyle(30), align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(10)
      .setVisible(false);

    this.fitCamera(true);
    this.scale.on('resize', this.onResize, this);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUpOutside, this);
    this.input.on('wheel', this.onWheel, this);
    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    // Switching apps on a phone or iPad shouldn't cost the battle.
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.pauseIfPlaying, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.pauseIfPlaying, this);
      this.scale.off('resize', this.onResize, this);
      this.scene.stop('hud');
    });
    this.scene.launch('hud');
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, MAX_DT);
    if (!this.gameOver && !this.paused) {
      updateAi(this.world, this.ai, dt);
      step(this.world, dt);
      this.handleEvents();
      // Captured bases can no longer be ordered around.
      for (const set of [this.selected, this.armed]) {
        for (const id of set) if (this.world.bases[id]?.owner !== 'player') set.delete(id);
      }
      if (this.world.winner) this.endBattle();
    }
    if (!this.paused) this.ageEffects(dt);
    this.render();
  }

  // ----- Commands used by the HUD ---------------------------------------------------------

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    this.cancelGesture();
    this.armed.clear();
    this.events.emit('pause-changed', this.paused);
  }

  restartBattle() {
    this.scene.restart({ difficulty: this.difficulty.id });
  }

  toMenu() {
    this.scene.start('menu');
  }

  // ----- Camera --------------------------------------------------------------------------

  private onResize() {
    this.fitCamera(false);
  }

  /** Recompute zoom limits for the screen size; optionally reset to show the whole map. */
  private fitCamera(reset: boolean) {
    const cam = this.cameras.main;
    const relative = cam.zoom / this.minZoom;
    cam.setSize(this.scale.width, this.scale.height);
    this.minZoom = Math.min(cam.width / this.box.width, cam.height / this.box.height);
    this.maxZoom = Math.max(this.minZoom * 2.5, DPR * 1.3);
    this.setZoomAt(reset ? this.minZoom : this.minZoom * relative, cam.width / 2, cam.height / 2);
  }

  private hud(): HudScene | undefined {
    return this.scene.get('hud') as HudScene | undefined;
  }

  /** Zoom so the world point under (screenX, screenY) stays put. */
  private setZoomAt(
    zoom: number,
    screenX: number,
    screenY: number,
    worldX?: number,
    worldY?: number,
  ) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(screenX, screenY);
    const wx = worldX ?? before.x;
    const wy = worldY ?? before.y;
    const z = Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom);
    cam.setZoom(z);
    // With the default 0.5 origin: world = (screen - w/2) / zoom + w/2 + scroll.
    cam.scrollX = wx - (screenX - cam.width / 2) / z - cam.width / 2;
    cam.scrollY = wy - (screenY - cam.height / 2) / z - cam.height / 2;
    this.clampCamera();
  }

  /** Keep the map on screen; when the view is bigger than the map, center it. */
  private clampCamera() {
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const clampAxis = (center: number, view: number, start: number, size: number) =>
      view >= size
        ? start + size / 2
        : Phaser.Math.Clamp(center, start + view / 2, start + size - view / 2);
    const cx = clampAxis(cam.scrollX + cam.width / 2, viewW, this.box.x, this.box.width);
    const cy = clampAxis(cam.scrollY + cam.height / 2, viewH, this.box.y, this.box.height);
    cam.scrollX = cx - cam.width / 2;
    cam.scrollY = cy - cam.height / 2;
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) {
    if (this.paused || this.gameOver) return;
    this.setZoomAt(this.cameras.main.zoom * (dy > 0 ? 0.88 : 1.12), p.x, p.y);
  }

  // ----- Input ---------------------------------------------------------------------------

  private touchPadding() {
    return cssToWorld(TOUCH_PADDING_CSS, this.cameras.main.zoom);
  }

  private activeTouches() {
    return [this.input.pointer1, this.input.pointer2, this.input.pointer3].filter(
      (p): p is Phaser.Input.Pointer => !!p && p.isDown,
    );
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    if (this.gameOver || this.paused || this.hud()?.isOverUi(p)) return;

    const touches = this.activeTouches();
    if (touches.length >= 2) {
      this.startPinch(touches[0]!, touches[1]!);
      return;
    }
    if (this.gesture !== 'none') return;

    this.downScreen = { x: p.x, y: p.y };
    this.lastScreen = { x: p.x, y: p.y };
    this.lastWorld = { x: p.worldX, y: p.worldY };
    this.moved = false;
    const base = baseAt(this.world, p.worldX, p.worldY, this.touchPadding());

    if (base?.owner === 'player') {
      this.tapMightReinforce = this.armed.size > 0 && !this.armed.has(base.id);
      this.gesture = 'drag';
      this.selected = new Set([base.id]);
      this.dragStartId = base.id;
      return;
    }
    if (base && this.armed.size > 0) {
      this.issueOrder([...this.armed], base.id);
      this.armed.clear();
      return;
    }
    if (base) this.hint(base.x, base.y - 50, 'Drag from a BLUE base!', COLORS.textDim);
    // Tapping empty ground cancels a pending tap order; dragging it scrolls the map.
    this.armed.clear();
    this.gesture = 'pan';
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (this.gesture === 'pinch') {
      this.updatePinch();
      return;
    }
    if (this.gesture === 'none') return;
    const slop = TAP_SLOP_CSS * DPR;
    if (Math.hypot(p.x - this.downScreen.x, p.y - this.downScreen.y) > slop) this.moved = true;

    if (this.gesture === 'pan' && this.moved) {
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - this.lastScreen.x) / cam.zoom;
      cam.scrollY -= (p.y - this.lastScreen.y) / cam.zoom;
      this.clampCamera();
    } else if (this.gesture === 'drag') {
      const swept = basesAlongSegment(
        this.world,
        this.lastWorld.x,
        this.lastWorld.y,
        p.worldX,
        p.worldY,
        this.touchPadding() * 0.4,
      );
      for (const b of swept) if (b.owner === 'player') this.selected.add(b.id);
    }
    this.lastScreen = { x: p.x, y: p.y };
    this.lastWorld = { x: p.worldX, y: p.worldY };
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    if (this.gesture === 'pinch') {
      if (this.activeTouches().length === 0) this.gesture = 'none';
      return;
    }
    if (this.gesture === 'drag') this.finishDrag(p);
    this.gesture = 'none';
  }

  private onPointerUpOutside() {
    // Letting go off the edge of the screen cancels the order.
    this.cancelGesture();
  }

  private finishDrag(p: Phaser.Input.Pointer) {
    if (!this.moved) {
      // A tap on one of your bases.
      if (this.tapMightReinforce) {
        this.issueOrder([...this.armed], this.dragStartId);
        this.armed.clear();
      } else {
        this.armed = new Set([this.dragStartId]);
      }
    } else {
      this.armed.clear();
      const target = baseAt(this.world, p.worldX, p.worldY, this.touchPadding());
      if (target) {
        const sources = [...this.selected].filter((id) => id !== target.id);
        if (sources.length > 0) this.issueOrder(sources, target.id);
      }
    }
    this.selected.clear();
  }

  private cancelGesture() {
    this.gesture = 'none';
    this.selected.clear();
  }

  private startPinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer) {
    this.cancelGesture();
    this.armed.clear();
    const cam = this.cameras.main;
    const mid = cam.getWorldPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: cam.zoom,
      worldX: mid.x,
      worldY: mid.y,
    };
    this.gesture = 'pinch';
  }

  private updatePinch() {
    const touches = this.activeTouches();
    if (touches.length < 2) return;
    const [a, b] = [touches[0]!, touches[1]!];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const zoom = this.pinch.zoom * (distance / this.pinch.distance);
    this.setZoomAt(zoom, (a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.worldX, this.pinch.worldY);
  }

  private issueOrder(sourceIds: number[], targetId: number) {
    let sent = 0;
    for (const id of sourceIds) {
      sent += sendTroops(this.world, 'player', id, targetId, DEFAULT_SEND_FRACTION);
    }
    if (sent === 0) {
      const src = this.world.bases[sourceIds[0]!];
      if (src) this.hint(src.x, src.y - 50, 'Need more troops!', COLORS.accent);
    }
  }

  private pauseIfPlaying() {
    if (!this.paused && !this.gameOver) this.togglePause();
  }

  // ----- Effects -------------------------------------------------------------------------

  private handleEvents() {
    for (const e of this.world.events) {
      const base = this.world.bases[e.baseId];
      if (!base) continue;
      const r = BASE_STATS[base.kind].radius;
      if (e.type === 'capture') {
        this.addEffect('ring', base.x, base.y, r, FACTION_COLORS[e.to], 0.7);
        this.addEffect('flash', base.x, base.y, r + 10, 0xffffff, 0.35);
        if (e.to === 'player') {
          this.hint(base.x, base.y - r - 10, 'CAPTURED!', '#7dff9a');
        } else if (e.from === 'player') {
          this.hint(base.x, base.y - r - 10, 'LOST!', '#ff8a8a');
          this.cameras.main.shake(180, 0.006);
        }
        if (base.kind === 'hq') this.cameras.main.shake(300, 0.01);
      } else if (e.type === 'hit') {
        const last = this.lastHitFx.get(base.id) ?? -1;
        if (this.world.time - last > 0.12) {
          this.lastHitFx.set(base.id, this.world.time);
          this.addEffect('flash', base.x, base.y, r + 4, FACTION_COLORS[e.by], 0.2);
        }
      } else if (e.type === 'blocked') {
        const last = this.lastHitFx.get(base.id) ?? -1;
        if (this.world.time - last > 0.15) {
          this.lastHitFx.set(base.id, this.world.time);
          this.addEffect('ring', base.x, base.y, r + 6, COLORS.shield, 0.4);
        }
      }
    }
  }

  private addEffect(
    kind: Effect['kind'],
    x: number,
    y: number,
    radius: number,
    color: number,
    duration: number,
  ) {
    this.effects.push({ kind, x, y, radius, color, age: 0, duration });
  }

  private ageEffects(dt: number) {
    for (const fx of this.effects) fx.age += dt;
    this.effects = this.effects.filter((fx) => fx.age < fx.duration);
  }

  /** Floating text that rises and fades; sized to stay readable at any zoom. */
  private hint(x: number, y: number, message: string, color: string) {
    const size = Math.max(26, cssToWorld(20, this.cameras.main.zoom));
    const text = this.add.text(x, y, message, textStyle(size, color)).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: text,
      y: y - size * 1.5,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  // ----- Rendering -----------------------------------------------------------------------

  private render() {
    const { bases, units } = this.world;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 140);
    const shielded = isShielded(this.world, 'player');
    const threats = this.incomingThreats();

    this.baseGfx.clear();
    for (const b of bases) {
      const color = FACTION_COLORS[b.owner];
      const r = BASE_STATS[b.kind].radius;
      if (this.selected.has(b.id) || this.armed.has(b.id)) {
        this.baseGfx.fillStyle(0xffffff, 0.2 + pulse * 0.25);
        this.baseGfx.fillCircle(b.x, b.y, r + 20);
      }
      if (threats.has(b.id)) {
        this.baseGfx.lineStyle(5, COLORS.bad, 0.4 + pulse * 0.6);
        this.baseGfx.strokeCircle(b.x, b.y, r + 16);
      }
      if (shielded && b.owner === 'player') {
        this.baseGfx.lineStyle(3, COLORS.shield, 0.35 + pulse * 0.3);
        this.baseGfx.strokeCircle(b.x, b.y, r + 14);
      }
      drawCapacityRing(this.baseGfx, b, color);
      drawBase(this.baseGfx, b, color);
      this.troopLabels[b.id]!.setText(String(Math.floor(b.troops)));
    }

    this.unitGfx.clear();
    if (!this.gameOver) {
      const unitR = Math.max(5, cssToWorld(2.8, this.cameras.main.zoom));
      for (const u of units) {
        if (u.delay > 0) continue;
        this.unitGfx.fillStyle(FACTION_COLORS[u.owner], 1);
        this.unitGfx.fillCircle(u.x, u.y, unitR);
      }
    }

    this.fxGfx.clear();
    for (const fx of this.effects) {
      const t = fx.age / fx.duration;
      if (fx.kind === 'ring') {
        this.fxGfx.lineStyle(6 * (1 - t) + 1, fx.color, 1 - t);
        this.fxGfx.strokeCircle(fx.x, fx.y, fx.radius + 60 * t);
      } else {
        this.fxGfx.fillStyle(fx.color, 0.55 * (1 - t));
        this.fxGfx.fillCircle(fx.x, fx.y, fx.radius);
      }
    }

    this.renderOrder();
  }

  /** Lines from the selected bases plus a preview of whether the attack would win. */
  private renderOrder() {
    this.orderGfx.clear();
    this.previewLabel.setVisible(false);
    if (this.gesture !== 'drag' || !this.moved) return;

    const p = this.input.activePointer;
    const target = baseAt(this.world, p.worldX, p.worldY, this.touchPadding());
    const sources = [...this.selected].filter((id) => id !== target?.id);
    this.orderGfx.lineStyle(cssToWorld(3, this.cameras.main.zoom), 0xffffff, 0.55);
    for (const id of this.selected) {
      const b = this.world.bases[id]!;
      this.orderGfx.lineBetween(b.x, b.y, p.worldX, p.worldY);
    }
    if (!target || sources.length === 0) return;

    const preview = previewAttack(this.world, 'player', sources, target.id, DEFAULT_SEND_FRACTION);
    const color = preview.friendly ? 0xffffff : preview.wins ? COLORS.good : COLORS.bad;
    const r = BASE_STATS[target.kind].radius;
    this.orderGfx.lineStyle(6, color, 0.95);
    this.orderGfx.strokeCircle(target.x, target.y, r + 18);

    const word = preview.friendly ? 'HELP' : preview.wins ? 'ATTACK!' : 'NOT ENOUGH';
    const size = Math.max(30, cssToWorld(22, this.cameras.main.zoom));
    this.previewLabel
      .setText(`${preview.friendly ? '+' : ''}${preview.count}\n${word}`)
      .setStyle(textStyle(size, '#' + color.toString(16).padStart(6, '0')))
      .setPosition(target.x, target.y - r - 22)
      .setVisible(true);
  }

  /** Player bases that enemy troops already on the way would capture. */
  private incomingThreats(): Set<number> {
    const incoming = new Map<number, number>();
    for (const u of this.world.units) {
      if (u.owner === 'enemy') incoming.set(u.targetId, (incoming.get(u.targetId) ?? 0) + 1);
    }
    const attack = getBonuses(this.world, 'enemy').attack;
    const threats = new Set<number>();
    for (const [id, count] of incoming) {
      const b: Base | undefined = this.world.bases[id];
      if (
        b?.owner === 'player' &&
        count * attack >= b.troops &&
        !isShielded(this.world, 'player')
      ) {
        threats.add(id);
      }
    }
    return threats;
  }

  private endBattle() {
    this.gameOver = true;
    this.cancelGesture();
    this.armed.clear();
    const won = this.world.winner === 'player';
    if (won) {
      for (const b of this.world.bases) {
        this.addEffect('ring', b.x, b.y, BASE_STATS[b.kind].radius, FACTION_COLORS.player, 1.2);
      }
    }
    this.events.emit('game-over', won);
  }
}

/** Area around the bases (with room for labels and effects) that the camera should show. */
function contentBox(world: World): Phaser.Geom.Rectangle {
  // Kept tight (labels hang below bases, so the bottom gets more room) to make the most of
  // short phone screens held sideways.
  const pad = { side: 80, top: 55, bottom: 75 };
  const xs = world.bases.map((b) => b.x);
  const ys = world.bases.map((b) => b.y);
  const minX = Math.min(...xs) - pad.side;
  const minY = Math.min(...ys) - pad.top;
  return new Phaser.Geom.Rectangle(
    minX,
    minY,
    Math.max(...xs) + pad.side - minX,
    Math.max(...ys) + pad.bottom - minY,
  );
}
