import Phaser from 'phaser';
import { createAi, updateAi, type AiState } from '../sim/ai';
import { BASE_STATS, DEFAULT_SEND_FRACTION } from '../sim/config';
import { LEVELS } from '../sim/levels';
import type { Base, World } from '../sim/types';
import { baseAt, createWorld, getBonuses, sendTroops, step } from '../sim/world';
import { COLORS, FACTION_COLORS, textStyle } from '../theme';
import { drawBase, drawCapacityRing, drawMapGrid } from './drawing';

const MAX_DT = 0.1;

export class BattleScene extends Phaser.Scene {
  private world!: World;
  private ai!: AiState;
  private baseGfx!: Phaser.GameObjects.Graphics;
  private unitGfx!: Phaser.GameObjects.Graphics;
  private orderGfx!: Phaser.GameObjects.Graphics;
  private troopLabels: Phaser.GameObjects.Text[] = [];
  private hud!: Phaser.GameObjects.Text;

  /** Bases picked during the current drag. */
  private selected = new Set<number>();
  /** Bases picked by a tap, waiting for a second tap on the target. */
  private armed = new Set<number>();
  private dragging = false;
  private dragStartId = -1;
  private pointer = { x: 0, y: 0 };
  private gameOver = false;

  constructor() {
    super('battle');
  }

  create() {
    const level = LEVELS[0]!;
    this.world = createWorld(level, Date.now() & 0xffff);
    this.ai = createAi('enemy');
    this.selected.clear();
    this.armed.clear();
    this.dragging = false;
    this.gameOver = false;

    drawMapGrid(this.add.graphics(), level.width, level.height);
    this.orderGfx = this.add.graphics();
    this.baseGfx = this.add.graphics();
    this.unitGfx = this.add.graphics();

    this.troopLabels = this.world.bases.map((b) => {
      this.add
        .text(
          b.x,
          b.y + BASE_STATS[b.kind].radius + 14,
          BASE_STATS[b.kind].label,
          textStyle(16, COLORS.textDim),
        )
        .setOrigin(0.5, 0);
      return this.add.text(b.x, b.y, '', textStyle(b.kind === 'hq' ? 30 : 24)).setOrigin(0.5);
    });

    this.hud = this.add.text(16, 12, '', textStyle(20)).setLineSpacing(4);
    this.add
      .text(level.width - 16, 12, level.name.toUpperCase(), textStyle(22, COLORS.accent))
      .setOrigin(1, 0);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.input.on('pointerupoutside', this.onPointerUp, this);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, MAX_DT);
    if (!this.gameOver) {
      updateAi(this.world, this.ai, dt);
      step(this.world, dt);
      // Captured bases can no longer be ordered around.
      for (const set of [this.selected, this.armed]) {
        for (const id of set) if (this.world.bases[id]?.owner !== 'player') set.delete(id);
      }
      if (this.world.winner) this.showGameOver();
    }
    this.render();
  }

  private onPointerDown(p: Phaser.Input.Pointer) {
    if (this.gameOver) return;
    this.pointer = { x: p.worldX, y: p.worldY };
    const base = baseAt(this.world, p.worldX, p.worldY);

    if (this.armed.size > 0) {
      if (base && !this.armed.has(base.id)) this.issueOrder([...this.armed], base.id);
      this.armed.clear();
      return;
    }
    if (base?.owner === 'player') {
      this.selected = new Set([base.id]);
      this.dragging = true;
      this.dragStartId = base.id;
    }
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    this.pointer = { x: p.worldX, y: p.worldY };
    if (!this.dragging) return;
    const base = baseAt(this.world, p.worldX, p.worldY, 8);
    if (base?.owner === 'player') this.selected.add(base.id);
  }

  private onPointerUp(p: Phaser.Input.Pointer) {
    if (!this.dragging) return;
    this.dragging = false;
    const target = baseAt(this.world, p.worldX, p.worldY);
    if (target) {
      const sources = [...this.selected].filter((id) => id !== target.id);
      if (sources.length > 0) {
        this.issueOrder(sources, target.id);
      } else if (target.id === this.dragStartId) {
        this.armed = new Set(this.selected);
      }
    }
    this.selected.clear();
  }

  private issueOrder(sourceIds: number[], targetId: number) {
    for (const id of sourceIds) {
      sendTroops(this.world, 'player', id, targetId, DEFAULT_SEND_FRACTION);
    }
  }

  private render() {
    const { bases, units } = this.world;

    this.baseGfx.clear();
    for (const b of bases) {
      const color = FACTION_COLORS[b.owner];
      if (this.selected.has(b.id) || this.armed.has(b.id)) this.drawSelection(b);
      drawCapacityRing(this.baseGfx, b, color);
      drawBase(this.baseGfx, b, color);
      this.troopLabels[b.id]!.setText(String(Math.floor(b.troops)));
    }

    this.unitGfx.clear();
    for (const u of units) {
      if (u.delay > 0) continue;
      this.unitGfx.fillStyle(FACTION_COLORS[u.owner], 1);
      this.unitGfx.fillCircle(u.x, u.y, 3.5);
    }

    this.orderGfx.clear();
    if (this.dragging) {
      this.orderGfx.lineStyle(4, 0xffffff, 0.5);
      for (const id of this.selected) {
        const b = bases[id]!;
        this.orderGfx.lineBetween(b.x, b.y, this.pointer.x, this.pointer.y);
      }
      const hover = baseAt(this.world, this.pointer.x, this.pointer.y);
      if (hover) {
        this.orderGfx.lineStyle(3, 0xffffff, 0.8);
        this.orderGfx.strokeCircle(hover.x, hover.y, BASE_STATS[hover.kind].radius + 16);
      }
    }

    this.hud.setText(this.hudText());
  }

  private drawSelection(b: Base) {
    const pulse = 0.5 + 0.3 * Math.sin(this.time.now / 150);
    this.baseGfx.fillStyle(0xffffff, pulse * 0.35);
    this.baseGfx.fillCircle(b.x, b.y, BASE_STATS[b.kind].radius + 18);
  }

  private hudText() {
    const bonus = getBonuses(this.world, 'player');
    const pct = (m: number) => `+${Math.round((m - 1) * 100)}%`;
    const owned = this.world.bases.filter((b) => b.owner === 'player').length;
    return [
      `BASES ${owned}/${this.world.bases.length}`,
      `Build ${pct(bonus.production)}   Speed ${pct(bonus.speed)}   Attack ${pct(bonus.attack)}`,
    ].join('\n');
  }

  private showGameOver() {
    this.gameOver = true;
    this.selected.clear();
    this.armed.clear();
    this.dragging = false;
    const { width, height } = this.scale.gameSize;
    const won = this.world.winner === 'player';

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.55);
    this.add
      .text(
        width / 2,
        height / 2 - 50,
        won ? 'VICTORY!' : 'DEFEAT',
        textStyle(120, won ? COLORS.accent : '#e5484d'),
      )
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 60, `Time: ${Math.round(this.world.time)}s`, textStyle(32))
      .setOrigin(0.5);
    const again = this.add
      .text(width / 2, height / 2 + 130, 'TAP TO PLAY AGAIN', textStyle(40))
      .setOrigin(0.5);
    this.tweens.add({ targets: again, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    // Short delay so a tap that was mid-flight doesn't instantly restart.
    this.time.delayedCall(800, () => this.input.once('pointerdown', () => this.scene.restart()));
  }
}
