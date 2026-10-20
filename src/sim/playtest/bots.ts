import { BASE_STATS, DEFAULT_SEND_FRACTION } from '../config';
import { createRng } from '../rng';
import type { Base, World } from '../types';
import { sendTroops } from '../world';

/**
 * A rough model of how a human of a given skill plays: how often they act, how often they
 * make a bad call, and which of the game's tricks they know about.
 */
export interface HumanProfile {
  id: string;
  label: string;
  /** Seconds between actions, picked uniformly from this range. */
  reaction: [number, number];
  /** Chance an action sends troops at a random target instead of a sensible one. */
  mistakeRate: number;
  /** Chance of sweeping two bases into one attack instead of one. */
  multiSelect: number;
  /** Chance of sending again right away from the same base (impatient double-tap). */
  doubleSend: number;
  /** Extra troops they want before attacking; kids often attack with barely enough. */
  margin: number;
  /** Whether they send reinforcements to a base that is about to be captured. */
  defends: boolean;
  /** Whether they go for Factory/Radar/Armory on purpose. */
  valuesSpecials: boolean;
  /** Seconds before the first move (reading the screen, figuring out controls). */
  warmup: number;
}

export const PROFILES: Record<string, HumanProfile> = {
  newKid: {
    id: 'newKid',
    label: 'New 8yo',
    reaction: [4, 7],
    mistakeRate: 0.3,
    multiSelect: 0,
    doubleSend: 0.25,
    margin: 0,
    defends: false,
    valuesSpecials: false,
    warmup: 8,
  },
  kid: {
    id: 'kid',
    label: 'Typical 8yo',
    reaction: [2.5, 4.5],
    mistakeRate: 0.15,
    multiSelect: 0.1,
    doubleSend: 0.15,
    margin: 1,
    defends: false,
    valuesSpecials: false,
    warmup: 5,
  },
  sharpKid: {
    id: 'sharpKid',
    label: 'Sharp 8yo',
    reaction: [1.5, 3],
    mistakeRate: 0.08,
    multiSelect: 0.3,
    doubleSend: 0.1,
    margin: 2,
    defends: true,
    valuesSpecials: true,
    warmup: 3,
  },
  adult: {
    id: 'adult',
    label: 'Skilled adult',
    reaction: [0.8, 1.6],
    mistakeRate: 0.03,
    multiSelect: 0.5,
    doubleSend: 0,
    margin: 3,
    defends: true,
    valuesSpecials: true,
    warmup: 2,
  },
};

export interface BotState {
  profile: HumanProfile;
  cooldown: number;
  rng: () => number;
}

export function createBot(profile: HumanProfile, seed: number): BotState {
  return { profile, cooldown: profile.warmup, rng: createRng(seed) };
}

export function updateBot(world: World, bot: BotState, dt: number): void {
  if (world.winner) return;
  bot.cooldown -= dt;
  if (bot.cooldown > 0) return;
  const p = bot.profile;
  const [lo, hi] = p.reaction;
  bot.cooldown = lo + bot.rng() * (hi - lo);

  const mine = world.bases.filter((b) => b.owner === 'player');
  const others = world.bases.filter((b) => b.owner !== 'player');
  if (mine.length === 0 || others.length === 0) return;

  if (p.defends && defend(world, mine)) return;

  // Humans look at the biggest number they own first.
  const byTroops = [...mine].sort((a, b) => b.troops - a.troops);
  const main = byTroops[0]!;
  if (main.troops < 4) return;

  const sources = [main];
  const second = byTroops[1];
  if (second && second.troops >= 6 && bot.rng() < p.multiSelect) sources.push(second);
  const power = sources.reduce((sum, s) => sum + Math.floor(s.troops * DEFAULT_SEND_FRACTION), 0);

  let target: Base | undefined;
  if (bot.rng() < p.mistakeRate) {
    target = others[Math.floor(bot.rng() * others.length)];
  } else {
    let bestScore = Infinity;
    for (const t of others) {
      // Kids judge by the number they see, not production during the trip.
      if (power < t.troops + p.margin) continue;
      const d = Math.hypot(t.x - main.x, t.y - main.y);
      let score = t.troops + d * 0.04;
      if (p.valuesSpecials && BASE_STATS[t.kind].perk.startsWith('All')) score -= 6;
      // Skilled players know taking the enemy HQ wins on the spot.
      if (p.valuesSpecials && t.kind === 'hq' && t.owner === 'enemy') score -= 15;
      if (score < bestScore) {
        bestScore = score;
        target = t;
      }
    }
  }
  if (!target) return;

  for (const s of sources) {
    sendTroops(world, 'player', s.id, target.id, DEFAULT_SEND_FRACTION);
    if (bot.rng() < p.doubleSend)
      sendTroops(world, 'player', s.id, target.id, DEFAULT_SEND_FRACTION);
  }
}

/** Reinforce a base that incoming enemies are about to take. Returns true if it acted. */
function defend(world: World, mine: Base[]): boolean {
  const incoming = new Map<number, number>();
  for (const u of world.units) {
    if (u.owner === 'enemy') incoming.set(u.targetId, (incoming.get(u.targetId) ?? 0) + u.power);
  }
  for (const b of mine) {
    const threat = incoming.get(b.id) ?? 0;
    if (threat <= b.troops) continue;
    const helper = mine
      .filter((h) => h !== b && h.troops >= 8)
      .sort((h1, h2) => Math.hypot(h1.x - b.x, h1.y - b.y) - Math.hypot(h2.x - b.x, h2.y - b.y))[0];
    if (helper) {
      sendTroops(world, 'player', helper.id, b.id, DEFAULT_SEND_FRACTION);
      return true;
    }
  }
  return false;
}
