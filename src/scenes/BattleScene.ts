import Phaser from 'phaser';
import { sfx } from '../audio';
import { addMedals, loadSave, recordRegionBattle } from '../save';
import {
  createAdjutant,
  isWaiting,
  notePlayerOrder,
  updateAdjutant,
  type AdjutantState,
} from '../sim/adjutant';
import { campaignWorldOptions, medalsFor } from '../sim/upgrades';
import { DPR, cssToWorld } from '../display';
import { createAi, updateAi, type AiState } from '../sim/ai';
import { PERSONALITIES, rollPersonality } from '../sim/personality';
import { BASE_STATS, DEFAULT_SEND_FRACTION } from '../sim/config';
import {
  DIFFICULTIES,
  difficultyForStars,
  worldOptionsFor,
  type Difficulty,
  type DifficultyId,
} from '../sim/difficulty';
import { LEVELS } from '../sim/levels';
import { generateFreeForAll, generateLevel, randomMapSeed } from '../sim/mapgen';
import { regionLevel } from '../sim/worldmap';
import type { Base, LevelDef, Point, World } from '../sim/types';
import {
  baseAt,
  basesAlongSegment,
  createWorld,
  damageFactor,
  getBonuses,
  isAlive,
  isShielded,
  previewAttack,
  sendTroops,
  step,
  type AttackOutcome,
} from '../sim/world';
import {
  attackHints,
  isFirstBattle,
  loadDifficulty,
  markBattlePlayed,
  screenShake,
} from '../settings';
import { COLORS, FACTION_COLORS, textStyle } from '../theme';
import { drawBase, drawCapacityRing, drawHospitalRange, drawMapGrid, drawTerrain } from './drawing';
import type { HudScene } from './HudScene';
import { UNIT_TEXTURE, ensureUnitTextures } from './unitTextures';

const MAX_DT = 0.1;
/** The Adjutant's troops are tinted purple so you can tell its orders from yours. */
const ADJUTANT_COLOR = 0xa77bff;
/** How far below a base's centre its troop count sits, as a share of its radius. */
const TROOP_LABEL_DROP = 0.4;
/** Finger-friendly hit area around a base, in CSS pixels. */
const TOUCH_PADDING_CSS = 30;
/** Pointer travel (CSS px) before a press counts as a drag rather than a tap. */
const TAP_SLOP_CSS = 14;

const OUTCOME_STYLE: Record<AttackOutcome, { color: number; word: string }> = {
  reinforce: { color: 0xffffff, word: 'HELP' },
  win: { color: COLORS.good, word: 'ATTACK!' },
  close: { color: COLORS.warn, word: 'CLOSE!' },
  lose: { color: COLORS.bad, word: 'NOT ENOUGH' },
  raid: { color: 0xffa94d, word: 'RAID: NO CAPTURE' },
  shielded: { color: COLORS.shield, word: 'SHIELDED' },
};

export type BattleMode = 'quick' | 'campaign';

export interface BattleData {
  difficulty?: DifficultyId;
  /** Campaign battles earn medals and use upgrades; quick battles are a fair fight. */
  mode?: BattleMode;
  /** Campaign only: the Adjutant plays the whole battle. */
  auto?: boolean;
  /** Map number to play (0 = Boot Camp). Left out: Boot Camp the first time, then random. */
  map?: number;
  /** Campaign: the conquest-map region being fought over (its stars set the difficulty). */
  region?: string;
  /** Quick Battle: three armies, everyone against everyone. */
  ffa?: boolean;
}

type Gesture = 'none' | 'drag' | 'pan' | 'pinch';

interface Effect {
  kind: 'ring' | 'flash' | 'spark';
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
  mode: BattleMode = 'quick';
  auto = false;
  /** Map number being played (0 = Boot Camp), so PLAY AGAIN replays the same map. */
  map = 0;
  /** Three-army Free-for-All (Quick Battle). */
  ffa = false;
  /** Medals earned by this battle (campaign), set when it ends. */
  reward = 0;
  /** Conquest-map region being fought over (campaign). */
  region: string | null = null;
  /** Its star rating when the battle started. */
  stars = 0;
  /** Regions this battle's win revealed, for the world map to animate. */
  private revealed: string[] = [];
  private adjutant: AdjutantState | null = null;
  private adjutantOn = true;

  /** One AI for every army but yours. */
  ais: AiState[] = [];
  private baseGfx!: Phaser.GameObjects.Graphics;
  /** Reused unit sprites; one per visible unit, extras hidden. */
  private unitSprites: Phaser.GameObjects.Image[] = [];
  private orderGfx!: Phaser.GameObjects.Graphics;
  private fxGfx!: Phaser.GameObjects.Graphics;
  private troopLabels: Phaser.GameObjects.Text[] = [];
  private previewLabel!: Phaser.GameObjects.Text;
  private armedLabel!: Phaser.GameObjects.Text;
  private effects: Effect[] = [];
  private lastHitFx = new Map<number, number>();
  /** When the last clash spark was drawn in each patch of the map, so big fights don't spam. */
  private lastClashFx = new Map<number, number>();
  /** The floating message currently shown at each base, so a new one replaces it. */
  private hints = new Map<number, Phaser.GameObjects.Text>();
  /** Troops a Field Hospital got back that haven't been shown as a "+N" pop yet. */
  private healed = new Map<number, number>();
  private lastHealPop = new Map<number, number>();
  /** Until when (game clock, ms) a tapped Field Hospital shows its range ring. */
  private rangeUntil = new Map<number, number>();
  /** Bases that were in danger last frame, so the warning sound plays once per new threat. */
  private lastThreats = new Set<number>();
  /** Squads the player sent that are still flying, with their targets. */
  private playerSquads = new Map<number, number>();

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
  private pointerWorld = { x: 0, y: 0 };
  private pinch = { distance: 1, zoom: 1, worldX: 0, worldY: 0 };

  /** Region of the world the camera may show, and the zoom limits for this screen. */
  private box = new Phaser.Geom.Rectangle();
  private minZoom = 1;
  private maxZoom = 2;
  /** Camera size at the last fit; Phaser resizes the camera before our resize handler runs. */
  private camSize = { width: 0, height: 0 };
  /** A non-player base the current press started on (-1 if none). */
  private downBaseId = -1;

  constructor() {
    super('battle');
  }

  init(data: BattleData) {
    this.difficulty = DIFFICULTIES[data.difficulty ?? loadDifficulty() ?? 'soldier'];
    this.mode = data.mode ?? 'quick';
    this.auto = this.mode === 'campaign' && !!data.auto;
    this.ffa = this.mode === 'quick' && !!data.ffa;
    this.map = data.map ?? (isFirstBattle() && !this.ffa ? 0 : randomMapSeed());
    this.region = this.mode === 'campaign' ? (data.region ?? null) : null;
    if (this.region) {
      this.stars = loadSave().conquest.regions[this.region]?.stars ?? 1;
      this.difficulty = difficultyForStars(this.stars);
    }
  }

  create() {
    const save = loadSave();
    this.level = this.region
      ? regionLevel(save.conquest.seed, this.region)
      : this.ffa
        ? generateFreeForAll(this.map)
        : this.map === 0
          ? LEVELS[0]!
          : generateLevel(this.map);
    const seed = Date.now() & 0xffff;
    this.revealed = [];
    this.world = createWorld(
      this.level,
      this.mode === 'campaign'
        ? campaignWorldOptions(this.difficulty, seed, save.upgrades)
        : worldOptionsFor(this.difficulty, seed),
    );
    // Each enemy army rolls a personality (steady at the easy ranks), announced by the HUD.
    const roll = Math.floor(Math.random() * 1000);
    this.ais = this.world.armies
      .filter((a) => a !== 'player')
      .map((a, k) => {
        const p = PERSONALITIES[rollPersonality(this.difficulty.id, roll, k)];
        this.world.handicap[a] *= p.production;
        return createAi(a, this.difficulty, p);
      });
    const adjutantLevel = this.mode === 'campaign' ? save.upgrades.adjutant : 0;
    this.adjutant = adjutantLevel > 0 ? createAdjutant(adjutantLevel, this.auto) : null;
    this.adjutantOn = true;
    this.reward = 0;
    this.selected.clear();
    this.armed.clear();
    this.effects = [];
    this.lastHitFx.clear();
    this.hints.clear();
    this.healed.clear();
    this.lastHealPop.clear();
    this.rangeUntil.clear();
    this.playerSquads.clear();
    this.gesture = 'none';
    this.paused = false;
    this.gameOver = false;

    this.box = contentBox(this.world, this.level.outline);
    const ground = this.add.graphics();
    if (this.level.outline) {
      drawTerrain(ground, { ...this.level, outline: this.level.outline }, this.box);
    } else {
      drawMapGrid(ground, this.box.width + 2000, this.box.height + 2000);
      ground.setPosition(this.box.x - 1000, this.box.y - 1000);
    }

    this.orderGfx = this.add.graphics();
    this.fxGfx = this.add.graphics();
    this.baseGfx = this.add.graphics();
    ensureUnitTextures(this);
    this.unitSprites = [];

    this.troopLabels = this.world.bases.map((b) => {
      this.add
        .text(
          b.x,
          b.y + BASE_STATS[b.kind].radius + 12,
          BASE_STATS[b.kind].label,
          textStyle(22, COLORS.textDim),
        )
        .setOrigin(0.5, 0);
      // The count sits on the front of the building, leaving its roof in view.
      const y = b.y + BASE_STATS[b.kind].radius * TROOP_LABEL_DROP;
      return this.add.text(b.x, y, '', textStyle(b.kind === 'hq' ? 34 : 30)).setOrigin(0.5);
    });
    this.previewLabel = this.add
      .text(0, 0, '', { ...textStyle(30), align: 'center' })
      .setOrigin(0.5, 1)
      .setDepth(10)
      .setVisible(false);
    this.armedLabel = this.add
      .text(0, 0, 'Now tap a target!', textStyle(26, COLORS.accent))
      .setOrigin(0.5, 1)
      .setDepth(10)
      .setVisible(false);

    this.fitCamera(true);
    this.scale.on('resize', this.onResize, this);

    // Let the battlefield hear every pointer event, even ones that land on HUD buttons, so a
    // drag that ends on a button still finishes here instead of getting stuck.
    this.input.manager.globalTopOnly = false;
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
      for (const ai of this.ais) updateAi(this.world, ai, dt);
      if (this.adjutant && (this.adjutantOn || this.auto)) {
        updateAdjutant(this.world, this.adjutant, dt);
      }
      step(this.world, dt);
      this.handleEvents();
      this.popHeals();
      this.checkFinishedSquads();
      // Captured bases can no longer be ordered around.
      for (const set of [this.selected, this.armed]) {
        for (const id of set) if (this.world.bases[id]?.owner !== 'player') set.delete(id);
      }
      // With three armies you can be knocked out while the other two fight on.
      if (this.world.winner || !isAlive(this.world, 'player')) this.endBattle();
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
    this.scene.restart({
      difficulty: this.difficulty.id,
      mode: this.mode,
      auto: this.auto,
      map: this.map,
      region: this.region ?? undefined,
      ffa: this.ffa,
    });
  }

  /** Turn the helping Adjutant on or off (campaign). */
  toggleAdjutant() {
    this.adjutantOn = !this.adjutantOn;
    if (this.adjutant) notePlayerOrder(this.world, this.adjutant);
  }

  /** What the HUD shows about the Adjutant: null if there isn't one. */
  adjutantStatus(): 'auto' | 'on' | 'off' | 'waiting' | null {
    if (!this.adjutant) return null;
    if (this.auto) return 'auto';
    if (!this.adjutantOn) return 'off';
    return isWaiting(this.world, this.adjutant) ? 'waiting' : 'on';
  }

  toMenu() {
    if (this.mode === 'campaign') {
      this.scene.start('worldmap', { focus: this.region, revealed: this.revealed });
    } else {
      this.scene.start('menu', { page: 'quick' });
    }
  }

  /** The difficulty as players see it: stars in the campaign, the rank in Quick Battle. */
  rankLabel(): string {
    return this.region
      ? `${'★'.repeat(this.stars)} ${this.difficulty.label}`
      : this.difficulty.label;
  }

  // ----- Camera --------------------------------------------------------------------------

  /** Screen (canvas) pixels to world coordinates, using the battle camera's current state. */
  private toWorld(screenX: number, screenY: number) {
    const cam = this.cameras.main;
    return {
      x: (screenX - cam.width / 2) / cam.zoom + cam.width / 2 + cam.scrollX,
      y: (screenY - cam.height / 2) / cam.zoom + cam.height / 2 + cam.scrollY,
    };
  }

  private onResize() {
    this.fitCamera(false);
  }

  /**
   * Recompute zoom limits for the screen size. On reset show the whole map; otherwise keep
   * looking at the same spot at the same zoom (within the new limits).
   */
  private fitCamera(reset: boolean) {
    const cam = this.cameras.main;
    const centerX = cam.scrollX + (this.camSize.width || cam.width) / 2;
    const centerY = cam.scrollY + (this.camSize.height || cam.height) / 2;
    const zoom = cam.zoom;
    cam.setSize(this.scale.width, this.scale.height);
    this.camSize = { width: cam.width, height: cam.height };
    this.minZoom = Math.min(cam.width / this.box.width, cam.height / this.box.height);
    this.maxZoom = Math.max(this.minZoom * 2.5, DPR * 1.3);
    if (reset) {
      this.setZoomAt(
        this.minZoom,
        cam.width / 2,
        cam.height / 2,
        this.box.centerX,
        this.box.centerY,
      );
    } else {
      this.setZoomAt(zoom, cam.width / 2, cam.height / 2, centerX, centerY);
    }
  }

  private hud(): HudScene | undefined {
    return this.scene.get('hud') as HudScene | undefined;
  }

  /** Zoom so the given world point (default: the one under the screen point) stays put. */
  private setZoomAt(
    zoom: number,
    screenX: number,
    screenY: number,
    worldX?: number,
    worldY?: number,
  ): number {
    const cam = this.cameras.main;
    const before = this.toWorld(screenX, screenY);
    const wx = worldX ?? before.x;
    const wy = worldY ?? before.y;
    const z = Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom);
    cam.setZoom(z);
    cam.scrollX = wx - (screenX - cam.width / 2) / z - cam.width / 2;
    cam.scrollY = wy - (screenY - cam.height / 2) / z - cam.height / 2;
    this.clampCamera();
    return z;
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

  /** World rectangle currently visible. */
  private viewRect() {
    const cam = this.cameras.main;
    const tl = this.toWorld(0, 0);
    return new Phaser.Geom.Rectangle(tl.x, tl.y, cam.width / cam.zoom, cam.height / cam.zoom);
  }

  private onWheel(p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) {
    if (this.paused || this.gameOver) return;
    this.setZoomAt(this.cameras.main.zoom * (dy > 0 ? 0.8 : 1.25), p.x, p.y);
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
    // A release we never heard about (e.g. lost to the OS) must not leave a gesture stuck.
    if (this.gesture !== 'none') this.cancelGesture();

    const w = this.toWorld(p.x, p.y);
    this.downScreen = { x: p.x, y: p.y };
    this.lastScreen = { x: p.x, y: p.y };
    this.lastWorld = w;
    this.pointerWorld = w;
    this.moved = false;
    this.downBaseId = -1;
    // During an auto-battle the Adjutant gives the orders; the player can still look around.
    if (this.auto) {
      this.gesture = 'pan';
      return;
    }
    const base = baseAt(this.world, w.x, w.y, this.touchPadding());
    if (base?.kind === 'hospital') this.rangeUntil.set(base.id, this.time.now + 2500);

    if (base?.owner === 'player') {
      this.tapMightReinforce = this.armed.size > 0 && !this.armed.has(base.id);
      this.gesture = 'drag';
      this.selected = new Set([base.id]);
      this.dragStartId = base.id;
      return;
    }
    // Empty ground or a base that isn't yours: dragging scrolls the map. What a plain tap
    // does (send an armed order, show a hint, or cancel) is decided on release, so starting
    // a scroll never fires an order by accident.
    this.downBaseId = base?.id ?? -1;
    this.gesture = 'pan';
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (this.gesture === 'pinch') {
      this.updatePinch();
      return;
    }
    const w = this.toWorld(p.x, p.y);
    this.pointerWorld = w;
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
        w.x,
        w.y,
        this.touchPadding() * 0.4,
      );
      for (const b of swept) if (b.owner === 'player') this.selected.add(b.id);
    }
    this.lastScreen = { x: p.x, y: p.y };
    this.lastWorld = this.toWorld(p.x, p.y);
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    if (this.gesture === 'pinch') {
      const left = this.activeTouches();
      if (left.length === 0) {
        this.gesture = 'none';
      } else if (left.length === 1) {
        // One finger lifted: carry on scrolling with the other.
        this.gesture = 'pan';
        this.moved = true;
        this.lastScreen = { x: left[0]!.x, y: left[0]!.y };
      }
      return;
    }
    // iOS cancels touches for system gestures and notifications; never act on those. And a
    // drag released on a HUD button is a cancel, not an order to whatever is underneath.
    if (p.wasCanceled || (this.gesture === 'drag' && this.hud()?.isOverUi(p))) {
      this.cancelGesture();
      return;
    }
    if (this.gesture === 'drag') this.finishDrag(p);
    else if (this.gesture === 'pan' && !this.moved) this.finishTap();
    this.gesture = 'none';
  }

  /** A tap that didn't start on one of your bases. */
  private finishTap() {
    const base = this.world.bases[this.downBaseId];
    if (base && this.armed.size > 0) {
      this.issueOrder([...this.armed], base.id);
    } else if (base && base.owner !== 'player') {
      // Say what the base is good for, so a kid knows why it's worth taking.
      const { label, perk } = BASE_STATS[base.kind];
      this.hint(
        base,
        `${label.toUpperCase()}: ${perk}
Drag from a BLUE base!`,
        COLORS.textDim,
      );
    }
    this.armed.clear();
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
      const w = this.toWorld(p.x, p.y);
      const target = baseAt(this.world, w.x, w.y, this.touchPadding());
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
    this.resetPinch(a, b);
    this.gesture = 'pinch';
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
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const wanted = this.pinch.zoom * (distance / this.pinch.distance);
    const got = this.setZoomAt(
      wanted,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      this.pinch.worldX,
      this.pinch.worldY,
    );
    // At a zoom limit, start measuring again so pinching back responds immediately.
    if (Math.abs(got - wanted) > 1e-6) this.resetPinch(a, b);
  }

  private issueOrder(sourceIds: number[], targetId: number) {
    if (this.adjutant) notePlayerOrder(this.world, this.adjutant);
    let sent = 0;
    for (const id of sourceIds) {
      const n = sendTroops(this.world, 'player', id, targetId, DEFAULT_SEND_FRACTION);
      if (n > 0) this.playerSquads.set(this.world.nextSquadId - 1, targetId);
      sent += n;
    }
    if (sent > 0) sfx.send();
    if (sent === 0) {
      const src = this.world.bases[sourceIds[0]!];
      if (src) this.hint(src, 'Need more troops!', COLORS.accent);
    }
  }

  private pauseIfPlaying() {
    if (!this.paused && !this.gameOver) this.togglePause();
  }

  // ----- Effects -------------------------------------------------------------------------

  private handleEvents() {
    for (const e of this.world.events) {
      if (e.type === 'clash') {
        this.clashEffect(e.x, e.y);
        continue;
      }
      if (e.type === 'heal') {
        this.healed.set(e.baseId, (this.healed.get(e.baseId) ?? 0) + e.amount);
        continue;
      }
      const base = this.world.bases[e.baseId];
      if (!base) continue;
      const r = BASE_STATS[base.kind].radius;
      if (e.type === 'capture') {
        this.addEffect('ring', base.x, base.y, r, FACTION_COLORS[e.to], 0.7);
        this.addEffect('flash', base.x, base.y, r + 10, 0xffffff, 0.35);
        if (e.to === 'player') {
          this.hint(base, 'CAPTURED!', '#7dff9a');
          sfx.capture();
        } else if (e.from === 'player') {
          this.hint(base, 'LOST!', '#ff8a8a');
          sfx.lost();
          if (screenShake()) this.cameras.main.shake(180, 0.006);
        }
        if (base.kind === 'hq' && screenShake()) this.cameras.main.shake(300, 0.01);
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

  /** A small "+N" over a Field Hospital as saved troops come back, at most a few a second. */
  private popHeals() {
    for (const [id, amount] of this.healed) {
      const base = this.world.bases[id];
      const whole = Math.floor(amount + 1e-6);
      const last = this.lastHealPop.get(id) ?? -Infinity;
      if (!base || whole < 1 || this.world.time - last < 0.5) continue;
      this.healed.set(id, amount - whole);
      this.lastHealPop.set(id, this.world.time);
      const size = Math.max(22, cssToWorld(15, this.cameras.main.zoom));
      const r = BASE_STATS[base.kind].radius;
      const text = this.add
        .text(base.x + r * 0.9, base.y - r * 0.6, `+${whole}`, textStyle(size, '#7dff9a'))
        .setOrigin(0, 1)
        .setDepth(19);
      this.tweens.add({
        targets: text,
        y: text.y - size,
        alpha: 0,
        duration: 900,
        ease: 'Quad.easeOut',
        onComplete: () => text.destroy(),
      });
    }
  }

  /** A spark where swarms meet: at most one per patch of the map every so often. */
  private clashEffect(x: number, y: number) {
    const patch = Math.floor(x / 40) * 65536 + Math.floor(y / 40);
    const last = this.lastClashFx.get(patch) ?? -1;
    if (this.world.time - last < 0.1) return;
    this.lastClashFx.set(patch, this.world.time);
    if (this.lastClashFx.size > 200) this.lastClashFx.clear();
    if (this.effects.length < 120) {
      const size = Math.max(18, cssToWorld(12, this.cameras.main.zoom));
      this.addEffect('spark', x, y, size, 0xffc94d, 0.3);
    }
    sfx.clash();
  }

  /** Tell the player when one of their attacks has fully landed without taking the base. */
  private checkFinishedSquads() {
    if (this.playerSquads.size === 0) return;
    const flying = new Set(this.world.units.map((u) => u.squad));
    for (const [squad, targetId] of this.playerSquads) {
      if (flying.has(squad)) continue;
      this.playerSquads.delete(squad);
      const target = this.world.bases[targetId];
      const stillFlyingThere = [...this.playerSquads.values()].includes(targetId);
      if (target && target.owner !== 'player' && !stillFlyingThere) {
        this.hint(target, 'FAILED!', '#ffb36b');
        sfx.failed();
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

  /** A floating message over a base that rises and fades; replaces that base's last one. */
  private hint(base: Base, message: string, color: string) {
    this.hints.get(base.id)?.destroy();
    const size = Math.max(26, cssToWorld(20, this.cameras.main.zoom));
    const view = this.viewRect();
    const r = BASE_STATS[base.kind].radius;
    // Prefer above the base; near the top edge, drop below its name label instead.
    const above = base.y - r - 14;
    const fitsAbove = above - size >= view.top;
    const y = fitsAbove ? above : base.y + r + 44;
    const text = this.add
      .text(base.x, y, message, { ...textStyle(size, color), align: 'center' })
      .setOrigin(0.5, fitsAbove ? 1 : 0)
      .setDepth(20);
    const half = text.width / 2 + 8;
    text.setX(
      Phaser.Math.Clamp(base.x, view.left + half, Math.max(view.left + half, view.right - half)),
    );
    this.hints.set(base.id, text);
    this.tweens.add({
      targets: text,
      y: y - size * 0.6,
      alpha: 0,
      delay: 350,
      duration: 900,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        text.destroy();
        if (this.hints.get(base.id) === text) this.hints.delete(base.id);
      },
    });
  }

  // ----- Rendering -----------------------------------------------------------------------

  private render() {
    const { bases } = this.world;
    const zoom = this.cameras.main.zoom;
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 140);
    const shielded = isShielded(this.world, 'player');
    const threats = this.incomingThreats();
    for (const id of threats) if (!this.lastThreats.has(id) && !this.paused) sfx.danger();
    this.lastThreats = threats;

    this.baseGfx.clear();
    // Field Hospitals show how far they reach while picked, and for a moment after a tap.
    for (const b of bases) {
      if (b.kind !== 'hospital') continue;
      const picked = this.selected.has(b.id) || this.armed.has(b.id);
      const left = (this.rangeUntil.get(b.id) ?? 0) - this.time.now;
      const strength = picked ? 1 : Math.min(1, left / 600);
      if (strength > 0) drawHospitalRange(this.baseGfx, b, FACTION_COLORS[b.owner], strength);
    }
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
      drawBase(this.baseGfx, b, color, this.world.time);
      this.troopLabels[b.id]!.setText(String(Math.floor(b.troops)));
    }

    this.renderUnits(zoom);

    this.fxGfx.clear();
    for (const fx of this.effects) {
      const t = fx.age / fx.duration;
      if (fx.kind === 'ring') {
        this.fxGfx.lineStyle(8 * (1 - t) + 1, fx.color, 1 - t);
        this.fxGfx.strokeCircle(fx.x, fx.y, fx.radius + 70 * t);
      } else if (fx.kind === 'spark') {
        // A white-hot dot with four short streaks flying out.
        const r = fx.radius * (0.6 + t);
        this.fxGfx.fillStyle(0xffffff, 0.9 * (1 - t));
        this.fxGfx.fillCircle(fx.x, fx.y, fx.radius * 0.5 * (1 - t * 0.6));
        this.fxGfx.lineStyle(fx.radius * 0.22, fx.color, 1 - t);
        for (let i = 0; i < 4; i++) {
          const a = i * (Math.PI / 2) + Math.PI / 4 + fx.x;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          this.fxGfx.lineBetween(
            fx.x + c * r * 0.4,
            fx.y + sn * r * 0.4,
            fx.x + c * r,
            fx.y + sn * r,
          );
        }
      } else {
        this.fxGfx.fillStyle(fx.color, 0.55 * (1 - t));
        this.fxGfx.fillCircle(fx.x, fx.y, fx.radius);
      }
    }

    this.renderOrder();
    this.renderArmed();
  }

  /** Draw every unit as a sprite facing where it's going, sized to stay visible at any zoom. */
  private renderUnits(zoom: number) {
    // World size of each kind: never smaller than a few CSS pixels on screen.
    const size = {
      soldier: Math.max(18, cssToWorld(10, zoom)),
      tank: Math.max(30, cssToWorld(17, zoom)),
      jet: Math.max(26, cssToWorld(15, zoom)),
    };
    let n = 0;
    if (!this.gameOver) {
      for (const u of this.world.units) {
        if (u.delay > 0) continue;
        let sprite = this.unitSprites[n];
        if (!sprite) {
          sprite = this.add.image(0, 0, UNIT_TEXTURE.soldier.key).setDepth(1);
          this.unitSprites.push(sprite);
        }
        const tex = UNIT_TEXTURE[u.kind];
        sprite
          .setTexture(tex.key)
          .setPosition(u.x, u.y)
          .setRotation(Math.atan2(u.ty - u.y, u.tx - u.x))
          .setScale(size[u.kind] / tex.width)
          .setTint(this.adjutant?.squads.has(u.squad) ? ADJUTANT_COLOR : FACTION_COLORS[u.owner])
          .setVisible(true);
        n++;
      }
    }
    for (let i = n; i < this.unitSprites.length; i++) this.unitSprites[i]!.setVisible(false);
  }

  /** Lines from the selected bases plus a preview of whether the attack would win. */
  private renderOrder() {
    this.orderGfx.clear();
    this.previewLabel.setVisible(false);
    if (this.gesture !== 'drag' || !this.moved) return;

    const p = this.pointerWorld;
    const target = baseAt(this.world, p.x, p.y, this.touchPadding());
    const sources = [...this.selected].filter((id) => id !== target?.id);
    this.orderGfx.lineStyle(cssToWorld(3, this.cameras.main.zoom), 0xffffff, 0.55);
    for (const id of this.selected) {
      const b = this.world.bases[id]!;
      // Over a target, the line follows the road the troops will really take.
      const road = target && id !== target.id ? this.world.routes[id]![target.id]!.points : null;
      if (road && road.length > 2) this.orderGfx.strokePoints(road, false);
      else this.orderGfx.lineBetween(b.x, b.y, p.x, p.y);
    }
    if (!target || sources.length === 0) return;

    const preview = previewAttack(this.world, 'player', sources, target.id, DEFAULT_SEND_FRACTION);
    const style = OUTCOME_STYLE[preview.outcome];
    const r = BASE_STATS[target.kind].radius;
    this.orderGfx.lineStyle(6, style.color, 0.95);
    this.orderGfx.strokeCircle(target.x, target.y, r + 18);

    const size = Math.max(30, cssToWorld(22, this.cameras.main.zoom));
    const sign = preview.outcome === 'reinforce' ? '+' : '';
    // Show troops already on the way too, so a two-wave attack reads as one.
    const onTheWay = preview.enRoute > 0 ? ` + ${preview.enRoute}` : '';
    const label = `${sign}${preview.count}${onTheWay}\n${style.word}`;
    // The coloured ring always shows; the numbers can be turned off in Settings.
    if (!attackHints()) return;
    this.previewLabel
      .setText(label)
      .setStyle(textStyle(size, hexColor(style.color)))
      .setVisible(true);
    this.placeAbove(this.previewLabel, target, r + 24);
  }

  /** While a base is armed by a tap, show which targets the attack would win. */
  private renderArmed() {
    this.armedLabel.setVisible(false);
    if (this.armed.size === 0 || this.gesture !== 'none') return;
    const sources = [...this.armed];
    for (const b of this.world.bases) {
      if (this.armed.has(b.id)) continue;
      const { outcome } = previewAttack(this.world, 'player', sources, b.id, DEFAULT_SEND_FRACTION);
      this.orderGfx.lineStyle(4, OUTCOME_STYLE[outcome].color, 0.7);
      this.orderGfx.strokeCircle(b.x, b.y, BASE_STATS[b.kind].radius + 14);
    }
    const first = this.world.bases[sources[0]!];
    if (!first) return;
    const size = Math.max(26, cssToWorld(18, this.cameras.main.zoom));
    this.armedLabel.setFontSize(size).setVisible(true);
    this.placeAbove(this.armedLabel, first, BASE_STATS[first.kind].radius + 24);
  }

  /** Put a label above a base, or below it if that would go off the top of the screen. */
  private placeAbove(label: Phaser.GameObjects.Text, base: Base, gap: number) {
    const view = this.viewRect();
    const above = base.y - gap;
    if (above - label.height < view.top) {
      label.setOrigin(0.5, 0).setPosition(base.x, base.y + gap + 30);
    } else {
      label.setOrigin(0.5, 1).setPosition(base.x, above);
    }
    const half = label.width / 2;
    label.setX(Phaser.Math.Clamp(label.x, view.left + half, view.right - half));
  }

  /** Player bases that enemy troops already on the way would capture. */
  private incomingThreats(): Set<number> {
    const threats = new Set<number>();
    if (isShielded(this.world, 'player')) return threats;
    // How hard the troops on their way will hit each of our bases (a Bunker halves soldiers).
    const incoming = new Map<number, number>();
    for (const u of this.world.units) {
      const b = this.world.bases[u.targetId];
      if (u.owner === 'player' || b?.owner !== 'player') continue;
      const hit = u.power * getBonuses(this.world, u.owner).attack * damageFactor(b.kind, u.kind);
      incoming.set(b.id, (incoming.get(b.id) ?? 0) + hit);
    }
    for (const [id, hit] of incoming) {
      if (hit >= this.world.bases[id]!.troops) threats.add(id);
    }
    return threats;
  }

  private endBattle() {
    this.gameOver = true;
    markBattlePlayed();
    this.cancelGesture();
    this.armed.clear();
    for (const t of this.hints.values()) t.destroy();
    this.hints.clear();
    const won = this.world.winner === 'player';
    if (won) {
      for (const b of this.world.bases) {
        this.addEffect('ring', b.x, b.y, BASE_STATS[b.kind].radius, FACTION_COLORS.player, 1.2);
      }
    }
    if (won) sfx.victory();
    else sfx.defeat();
    if (this.mode === 'campaign') {
      this.reward = medalsFor(this.stars, won, this.auto);
      if (this.reward > 0) addMedals(this.reward);
      if (this.region) this.revealed = recordRegionBattle(this.region, won, this.auto);
    }
    this.events.emit('game-over', won);
  }
}

function hexColor(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/**
 * Area around the bases (with room for labels and effects) and the map's outline that the
 * camera should show.
 */
function contentBox(world: World, outline: Point[] = []): Phaser.Geom.Rectangle {
  // Kept tight (labels hang below bases, so the bottom gets more room) to make the most of
  // short phone screens held sideways.
  const pad = { side: 80, top: 55, bottom: 75 };
  const xs = world.bases.map((b) => b.x);
  const ys = world.bases.map((b) => b.y);
  const edge = 6;
  const minX = Math.min(Math.min(...xs) - pad.side, ...outline.map((p) => p.x - edge));
  const minY = Math.min(Math.min(...ys) - pad.top, ...outline.map((p) => p.y - edge));
  const maxX = Math.max(Math.max(...xs) + pad.side, ...outline.map((p) => p.x + edge));
  const maxY = Math.max(Math.max(...ys) + pad.bottom, ...outline.map((p) => p.y + edge));
  return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
}
