import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { MenuScene } from './scenes/MenuScene';
import { COLORS } from './theme';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  input: { activePointers: 2 },
  scene: [MenuScene, BattleScene],
});

// Lets playtest tooling inspect the running game. Dev server only; stripped from production builds.
if (import.meta.env.DEV) (window as unknown as { nodeWars: Phaser.Game }).nodeWars = game;
