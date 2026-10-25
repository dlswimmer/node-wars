import { describe, expect, it } from 'vitest';
import { NO_UPGRADES, UPGRADES } from './upgrades';
import { CENTER, NODE_RADIUS, tentNodeCost, tentNodeState, tentWeb } from './web';

const web = tentWeb();
const node = (id: string) => web.find((n) => n.id === id)!;

describe('the Command Tent web', () => {
  it('has a centre and one spoke per upgrade, a node per level', () => {
    expect(node(CENTER).parent).toBeNull();
    for (const u of UPGRADES) {
      expect(node(`${u.id}:1`).parent).toBe(CENTER);
      expect(node(`${u.id}:2`).parent).toBe(`${u.id}:1`);
    }
    expect(web.filter((n) => n.upgrade === 'fastBuilders')).toHaveLength(5);
    // The Adjutant's spoke runs on to the Gunner, a sixth duty.
    expect(web.filter((n) => n.upgrade === 'adjutant')).toHaveLength(6);
  });

  it('keeps nodes apart, so each is easy to tap', () => {
    for (const [i, a] of web.entries()) {
      for (const b of web.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_RADIUS * 2);
      }
    }
  });

  it('opens each level once the one before it is owned', () => {
    const levels = { ...NO_UPGRADES, fastBuilders: 2 };
    expect(tentNodeState(node('fastBuilders:2'), levels, 0)).toBe('owned');
    expect(tentNodeState(node('fastBuilders:3'), levels, 0)).toBe('open');
    expect(tentNodeState(node('fastBuilders:4'), levels, 0)).toBe('locked');
    expect(tentNodeCost(node('fastBuilders:3'), levels)).toBe(10);
  });

  it('shows free Adjutant duties from Honor, then bought ones, then the Gunner', () => {
    const levels = { ...NO_UPGRADES, adjutant: 1 };
    // 25 Honor: two free duties, then one bought.
    expect(tentNodeState(node('adjutant:2'), levels, 25)).toBe('free');
    expect(tentNodeState(node('adjutant:3'), levels, 25)).toBe('owned');
    expect(tentNodeState(node('adjutant:4'), levels, 25)).toBe('open');
    // The next bought level is still the second-cheapest price.
    expect(tentNodeCost(node('adjutant:4'), levels)).toBe(10);
    expect(tentNodeState(node('adjutant:6'), levels, 25)).toBe('honorOnly');
    expect(tentNodeState(node('adjutant:6'), levels, 130)).toBe('free');
  });
});
