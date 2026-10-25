import Phaser from 'phaser';
import { unlockAudio } from './audio';
import { DPR, hostSize } from './display';
import { BattleScene } from './scenes/BattleScene';
import { HudScene } from './scenes/HudScene';
import { MenuScene } from './scenes/MenuScene';
import { SettingsScene } from './scenes/SettingsScene';
import { TentScene } from './scenes/TentScene';
import { WebScene } from './scenes/WebScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { COLORS } from './theme';

// The canvas fills the whole screen at device resolution; scenes lay themselves out on resize.
const { width, height } = hostSize();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.background,
  // Phaser turns on pixel-art rendering whenever zoom != 1, which makes text jagged on
  // high-DPI screens. This game is smooth vector art, so keep antialiasing on.
  pixelArt: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.NONE,
    width: width * DPR,
    height: height * DPR,
    zoom: 1 / DPR,
  },
  input: { activePointers: 3 },
  scene: [MenuScene, WorldMapScene, WebScene, TentScene, SettingsScene, BattleScene, HudScene],
});

function fitToScreen() {
  const size = hostSize();
  game.scale.resize(size.width * DPR, size.height * DPR);
}
window.addEventListener('resize', fitToScreen);
window.addEventListener('orientationchange', () => setTimeout(fitToScreen, 200));

// Lets playtest tooling inspect the running game. Dev server only; stripped from production builds.
// Browsers only allow sound after a tap; iOS wants it from touchend specifically.
for (const event of ['pointerdown', 'touchend', 'keydown']) {
  window.addEventListener(event, unlockAudio, { passive: true });
}

if (import.meta.env.DEV) (window as unknown as { nodeWars: Phaser.Game }).nodeWars = game;
