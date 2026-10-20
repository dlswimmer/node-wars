import type { Faction } from './sim/types';

export const COLORS = {
  background: '#1b2416',
  grid: 0x2c3a24,
  gridMajor: 0x34452a,
  text: '#e8ecd8',
  textDim: '#b5c29f',
  accent: '#f2c94c',
  good: 0x4cd964,
  warn: 0xffd23f,
  bad: 0xff5a5f,
  shield: 0x7fd6ff,
} as const;

export const FACTION_COLORS: Record<Faction, number> = {
  player: 0x3d8bfd,
  enemy: 0xe5484d,
  neutral: 0x8a8f7a,
};

export const FONT = 'Impact, "Arial Black", sans-serif';

/** Text is drawn at high resolution because cameras zoom it in and out. */
const TEXT_RESOLUTION = 3;

export function textStyle(size: number, color: string = COLORS.text) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#000000',
    strokeThickness: Math.max(2, Math.round(size / 8)),
    resolution: TEXT_RESOLUTION,
  };
}
