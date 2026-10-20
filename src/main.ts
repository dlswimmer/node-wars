import Phaser from 'phaser';
import { BattleScene } from './scenes/BattleScene';
import { MenuScene } from './scenes/MenuScene';
import { COLORS } from './theme';

new Phaser.Game({
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
