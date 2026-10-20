import Phaser from 'phaser';
import { DPR, hostSize } from './display';
import { BattleScene } from './scenes/BattleScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { COLORS } from './theme';

// The canvas fills the whole screen at device resolution; scenes lay themselves out on resize.
const { width, height } = hostSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.NONE,
    width: width * DPR,
    height: height * DPR,
    zoom: 1 / DPR,
  },
  input: { activePointers: 3 },
  scene: [MenuScene, BattleScene, HudScene],
});

function fitToScreen() {
  const size = hostSize();
  game.scale.resize(size.width * DPR, size.height * DPR);
}
window.addEventListener('resize', fitToScreen);
window.addEventListener('orientationchange', () => setTimeout(fitToScreen, 200));

// Lets playtest tooling inspect the running game. Dev server only; stripped from production builds.
if (import.meta.env.DEV) (window as unknown as { nodeWars: Phaser.Game }).nodeWars = game;
