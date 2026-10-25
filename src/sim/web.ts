import {
  ADJUTANT_BUYABLE,
  ADJUTANT_LEVELS,
  UPGRADES,
  adjutantLevel,
  canBuyAdjutant,
  freeAdjutantLevels,
  nextCost,
  type UpgradeId,
  type UpgradeLevels,
} from './upgrades';

/**
 * An upgrade web: a central node with spokes running out from it, one node per level, so
 * progress shows as the web lighting up further and further from the middle. Each node can
 * only be bought once the node before it (toward the centre) is owned.
 *
 * This is the Command Tent's web (medals, reset every war): one spoke per upgrade.
 */

export interface WebNode {
  id: string;
  /** Position in web units, with the centre at (0, 0). */
  x: number;
  y: number;
  /** The node this one hangs off (toward the centre); null for the centre. */
  parent: string | null;
  upgrade?: UpgradeId;
  /** Which level of its upgrade this node is (1 = next to the centre). */
  level?: number;
}

/** The centre node's id. */
export const CENTER = 'center';
/** Distance from the centre to the first ring, and between rings, in web units. */
export const FIRST_RING = 170;
export const RING_GAP = 95;
/** Radius of a node, in web units. */
export const NODE_RADIUS = 34;

/** Levels on a spoke: an upgrade's prices, or the Adjutant's duties including the Gunner. */
function spokeLength(id: UpgradeId): number {
  if (id === 'adjutant') return ADJUTANT_LEVELS.length;
  return UPGRADES.find((u) => u.id === id)!.costs.length;
}

/** The Command Tent's web: the centre and one spoke of level nodes per upgrade. */
export function tentWeb(): WebNode[] {
  const nodes: WebNode[] = [{ id: CENTER, x: 0, y: 0, parent: null }];
  UPGRADES.forEach((u, i) => {
    const angle = -Math.PI / 2 + (i / UPGRADES.length) * Math.PI * 2;
    let parent = CENTER;
    for (let level = 1; level <= spokeLength(u.id); level++) {
      const r = FIRST_RING + (level - 1) * RING_GAP;
      const id = `${u.id}:${level}`;
      nodes.push({
        id,
        x: Math.round(Math.cos(angle) * r),
        y: Math.round(Math.sin(angle) * r),
        parent,
        upgrade: u.id,
        level,
      });
      parent = id;
    }
  });
  return nodes;
}

/** Where a node stands for the player right now. */
export type NodeState =
  /** Bought (or learned for free). */
  | 'owned'
  /** Learned for free from Honor (the Adjutant's duties). */
  | 'free'
  /** Can be bought now (its parent is owned). */
  | 'open'
  /** Its parent isn't owned yet. */
  | 'locked'
  /** Only Honor can teach it (the Adjutant's Gunner duty). */
  | 'honorOnly';

/** A tent node's state, from this war's upgrade levels and total Honor earned. */
export function tentNodeState(
  node: WebNode,
  levels: UpgradeLevels,
  honorEarned: number,
): NodeState {
  if (!node.upgrade || !node.level) return 'owned';
  const k = node.level;
  if (node.upgrade === 'adjutant') {
    const free = freeAdjutantLevels(honorEarned);
    if (k <= free) return 'free';
    if (k > ADJUTANT_BUYABLE) return 'honorOnly';
    const level = adjutantLevel(levels.adjutant, honorEarned);
    if (k <= level) return 'owned';
    return k === level + 1 && canBuyAdjutant(levels.adjutant, honorEarned) ? 'open' : 'locked';
  }
  const have = levels[node.upgrade];
  if (k <= have) return 'owned';
  return k === have + 1 ? 'open' : 'locked';
}

/** What buying an open node costs (the Adjutant always starts at its cheapest price). */
export function tentNodeCost(node: WebNode, levels: UpgradeLevels): number | null {
  if (!node.upgrade) return null;
  return nextCost(levels, node.upgrade);
}
