import { ABILITIES, type AbilityId } from './abilities';

/**
 * The War College web: an endless hex web of permanent upgrades bought with Honor. The centre
 * is yours from the start; any node touching one you own can be bought, so the web grows
 * outward along whichever paths you like.
 *
 * Six directions run out from the centre, one per theme. Every node in a direction's wedge
 * gives a little of that theme; every third node along a direction's main line is a notable
 * worth three small ones, and three of the main lines hold a commander ability three steps out.
 * Prices rise with each ring, and the web always shows a couple of rings past your furthest
 * node, so there is always more to buy.
 */

export type Theme = 'attack' | 'production' | 'speed' | 'startMedals' | 'capacity' | 'medals';

/** Hex directions (axial coordinates), each with its theme, going round the web. */
export const COLLEGE_LINES: { q: number; r: number; theme: Theme }[] = [
  { q: 1, r: 0, theme: 'attack' },
  { q: 1, r: -1, theme: 'production' },
  { q: 0, r: -1, theme: 'speed' },
  { q: -1, r: 0, theme: 'startMedals' },
  { q: -1, r: 1, theme: 'capacity' },
  { q: 0, r: 1, theme: 'medals' },
];

/** The ability three steps out along a theme's main line. */
const ABILITY_AT: Partial<Record<Theme, AbilityId>> = {
  attack: 'airStrike',
  speed: 'charge',
  capacity: 'supplyDrop',
};

/** Each direction's name, shown past the end of its main line. */
export const THEME_NAMES: Record<Theme, string> = {
  attack: 'HIT STRENGTH',
  production: 'BUILD SPEED',
  speed: 'TROOP SPEED',
  startMedals: 'STARTING MEDALS',
  capacity: 'BASE STRENGTH',
  medals: 'MEDALS',
};

/** What one small node of each theme gives (a notable gives three times as much). */
export const SMALL_STEP: Record<Theme, number> = {
  attack: 0.03,
  production: 0.03,
  speed: 0.03,
  capacity: 0.04,
  medals: 0.1,
  startMedals: 2,
};
/** Extra shield seconds for each step of base strength. */
export const SHIELD_STEP = 2;
export const NOTABLE_STEPS = 3;

const SMALL_NAMES: Record<Theme, string> = {
  attack: 'HIT HARDER',
  production: 'BUILD FASTER',
  speed: 'MARCH FASTER',
  startMedals: 'SAVINGS',
  capacity: 'STRONGER BASES',
  medals: 'MORE MEDALS',
};

const NOTABLE_NAMES: Record<Theme, string> = {
  attack: 'MARKSMEN',
  production: 'TRAINING CAMP',
  speed: 'FORCED MARCH',
  startMedals: 'WAR CHEST',
  capacity: 'BUNKER ENGINEERS',
  medals: 'FIELD PAY',
};

/** What this many steps of a theme add up to, in kid words. */
export function themeText(theme: Theme, steps: number): string {
  const pct = (v: number) => Math.round(v * steps * 100);
  switch (theme) {
    case 'attack':
      return `troops hit +${pct(SMALL_STEP.attack)}% harder`;
    case 'production':
      return `+${pct(SMALL_STEP.production)}% troop building`;
    case 'speed':
      return `+${pct(SMALL_STEP.speed)}% troop speed`;
    case 'capacity':
      return `bases hold +${pct(SMALL_STEP.capacity)}% more, +${SHIELD_STEP * steps} s shield`;
    case 'medals':
      return `+${pct(SMALL_STEP.medals)}% medals from every win`;
    case 'startMedals':
      return `start each war with +${SMALL_STEP.startMedals * steps} medals`;
  }
}

export type CollegeKind = 'small' | 'notable' | 'ability';

export interface CollegeNode {
  /** `q,r` in axial hex coordinates; the centre is `center`. */
  id: string;
  q: number;
  r: number;
  /** Position in web units, with the centre at (0, 0). */
  x: number;
  y: number;
  /** Steps from the centre (0 for the centre). */
  ring: number;
  theme: Theme;
  kind: CollegeKind;
  ability?: AbilityId;
}

export const COLLEGE_CENTER = 'center';
/** Distance between neighbouring nodes, in web units. */
export const HEX_GAP = 110;
/** The web always shows at least this many rings, and this many past your furthest node. */
export const MIN_RINGS = 3;
export const RINGS_AHEAD = 2;
/** Honor for a small node in the first ring; each ring out costs this much more. */
export const FIRST_COST = 2;
export const COST_GROWTH = 1.3;

const ringOf = (q: number, r: number) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
const idOf = (q: number, r: number) => (q === 0 && r === 0 ? COLLEGE_CENTER : `${q},${r}`);

/** Screen position of a hex, turned so the first direction points straight up. */
function place(q: number, r: number) {
  const px = HEX_GAP * (q + r / 2);
  const py = HEX_GAP * (Math.sqrt(3) / 2) * r;
  return { x: Math.round(py), y: Math.round(-px) };
}

/** The node at a hex: its theme (the nearest main line) and kind. */
export function collegeNodeAt(q: number, r: number): CollegeNode {
  const ring = ringOf(q, r);
  const { x, y } = place(q, r);
  const id = idOf(q, r);
  if (ring === 0) return { id, q, r, x, y, ring, theme: 'attack', kind: 'small' };
  const onLine = COLLEGE_LINES.find((d) => d.q * ring === q && d.r * ring === r);
  if (onLine) {
    const ability = ring === 3 ? ABILITY_AT[onLine.theme] : undefined;
    const kind: CollegeKind = ability ? 'ability' : ring % 3 === 0 ? 'notable' : 'small';
    return { id, q, r, x, y, ring, theme: onLine.theme, kind, ...(ability ? { ability } : {}) };
  }
  // Off the main lines: the theme of the nearest line by angle (ties go to the first).
  const angle = Math.atan2(y, x);
  let best = COLLEGE_LINES[0]!;
  let bestGap = Infinity;
  for (const d of COLLEGE_LINES) {
    const p = place(d.q, d.r);
    const gap = Math.abs(
      Math.atan2(Math.sin(angle - Math.atan2(p.y, p.x)), Math.cos(angle - Math.atan2(p.y, p.x))),
    );
    if (gap < bestGap - 1e-6) {
      best = d;
      bestGap = gap;
    }
  }
  return { id, q, r, x, y, ring, theme: best.theme, kind: 'small' };
}

/** The node with this id, or null for an id that isn't a hex. */
export function collegeNode(id: string): CollegeNode | null {
  if (id === COLLEGE_CENTER) return collegeNodeAt(0, 0);
  const m = /^(-?\d+),(-?\d+)$/.exec(id);
  if (!m) return null;
  return collegeNodeAt(Number(m[1]), Number(m[2]));
}

/** Ids of the six nodes touching this one. */
export function collegeNeighbours(node: CollegeNode): string[] {
  return COLLEGE_LINES.map((d) => idOf(node.q + d.q, node.r + d.r));
}

/** How many rings to show for these owned nodes. */
export function visibleRings(owned: readonly string[]): number {
  let far = 0;
  for (const id of owned) far = Math.max(far, collegeNode(id)?.ring ?? 0);
  return Math.max(MIN_RINGS, far + RINGS_AHEAD);
}

/** Every node out to this many rings, the centre first. */
export function collegeWeb(rings: number): CollegeNode[] {
  const nodes: CollegeNode[] = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
      nodes.push(collegeNodeAt(q, r));
    }
  }
  return nodes.sort((a, b) => a.ring - b.ring);
}

/** Honor to buy a node: more each ring out, double for notables and abilities. */
export function collegeCost(node: CollegeNode): number {
  const weight = node.kind === 'small' ? 1 : 2;
  return Math.round(FIRST_COST * weight * COST_GROWTH ** (node.ring - 1));
}

export type CollegeState = 'owned' | 'open' | 'locked';

/** Owned, open to buy (it touches an owned node or the centre), or locked. */
export function collegeState(node: CollegeNode, owned: readonly string[]): CollegeState {
  if (node.id === COLLEGE_CENTER || owned.includes(node.id)) return 'owned';
  const touching = collegeNeighbours(node).some(
    (id) => id === COLLEGE_CENTER || owned.includes(id),
  );
  return touching ? 'open' : 'locked';
}

/** A node's name and what it gives. */
export function collegeLabel(node: CollegeNode): { name: string; text: string } {
  if (node.id === COLLEGE_CENTER) return { name: 'WAR COLLEGE', text: '' };
  if (node.ability) {
    const a = ABILITIES[node.ability];
    return { name: a.name, text: `Ability: ${a.blurb} (every ${a.cooldown} s)` };
  }
  if (node.kind === 'notable') {
    return { name: NOTABLE_NAMES[node.theme], text: themeText(node.theme, NOTABLE_STEPS) };
  }
  return { name: SMALL_NAMES[node.theme], text: themeText(node.theme, 1) };
}

/** Everything the War College gives, summed over the nodes you own. */
export interface CollegeEffects {
  production: number;
  speed: number;
  attack: number;
  capacity: number;
  /** Extra shield seconds at the start of a battle. */
  shield: number;
  /** Multiplier on medals from wins. */
  medals: number;
  /** Medals each new war starts with. */
  startMedals: number;
  abilities: AbilityId[];
  /** Steps owned per theme (a notable counts three). */
  steps: Record<Theme, number>;
}

export function collegeEffects(owned: readonly string[]): CollegeEffects {
  const steps: Record<Theme, number> = {
    attack: 0,
    production: 0,
    speed: 0,
    startMedals: 0,
    capacity: 0,
    medals: 0,
  };
  const abilities: AbilityId[] = [];
  for (const id of new Set(owned)) {
    const node = collegeNode(id);
    if (!node || node.id === COLLEGE_CENTER) continue;
    if (node.ability) abilities.push(node.ability);
    else steps[node.theme] += node.kind === 'notable' ? NOTABLE_STEPS : 1;
  }
  return {
    production: 1 + SMALL_STEP.production * steps.production,
    speed: 1 + SMALL_STEP.speed * steps.speed,
    attack: 1 + SMALL_STEP.attack * steps.attack,
    capacity: 1 + SMALL_STEP.capacity * steps.capacity,
    shield: SHIELD_STEP * steps.capacity,
    medals: 1 + SMALL_STEP.medals * steps.medals,
    startMedals: SMALL_STEP.startMedals * steps.startMedals,
    abilities: (Object.keys(ABILITIES) as AbilityId[]).filter((a) => abilities.includes(a)),
    steps,
  };
}

/** No War College at all. */
export const NO_COLLEGE_EFFECTS: CollegeEffects = collegeEffects([]);

/** Honor spent on these nodes. */
export function collegeSpent(owned: readonly string[]): number {
  let spent = 0;
  for (const id of new Set(owned)) {
    const node = collegeNode(id);
    if (node && node.id !== COLLEGE_CENTER) spent += collegeCost(node);
  }
  return spent;
}
