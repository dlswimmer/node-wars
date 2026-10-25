import { describe, expect, it } from 'vitest';
import {
  COLLEGE_CENTER,
  HEX_GAP,
  collegeCost,
  collegeEffects,
  collegeLabel,
  collegeNode,
  collegeNodeAt,
  collegeSpent,
  collegeState,
  collegeWeb,
  visibleRings,
} from './collegeweb';
import { DIFFICULTIES } from './difficulty';
import { NO_UPGRADES, campaignWorldOptions, medalsFor } from './upgrades';
import { NODE_RADIUS } from './web';

const node = (id: string) => collegeNode(id)!;

describe('the War College web', () => {
  it('rings the centre with 6 nodes per ring step, all far enough apart to tap', () => {
    const web = collegeWeb(4);
    expect(web[0]!.id).toBe(COLLEGE_CENTER);
    for (let ring = 1; ring <= 4; ring++) {
      expect(web.filter((n) => n.ring === ring)).toHaveLength(6 * ring);
    }
    for (const [i, a] of web.entries()) {
      for (const b of web.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_RADIUS * 2);
      }
    }
    // The hit-strength line points straight up.
    expect(node('1,0')).toMatchObject({ x: 0, y: -HEX_GAP, theme: 'attack' });
  });

  it('puts a notable every third step and abilities three steps out', () => {
    expect(node('3,0').ability).toBe('airStrike');
    expect(node('0,-3').ability).toBe('charge');
    expect(node('-3,3').ability).toBe('supplyDrop');
    expect(node('3,-3').kind).toBe('notable');
    expect(node('6,0').kind).toBe('notable');
    expect(node('2,0').kind).toBe('small');
    // Off the main lines, a node takes the theme of the nearest line.
    expect(collegeNodeAt(2, -1).theme).toBe('attack');
    expect(collegeNodeAt(1, -3).theme).toBe('speed');
  });

  it('opens nodes that touch one you own, and grows endlessly', () => {
    expect(collegeState(node('1,0'), [])).toBe('open');
    expect(collegeState(node('2,0'), [])).toBe('locked');
    expect(collegeState(node('2,0'), ['1,0'])).toBe('open');
    expect(collegeState(node('2,-1'), ['1,0'])).toBe('open');
    expect(collegeState(node('1,0'), ['1,0'])).toBe('owned');
    expect(visibleRings([])).toBe(3);
    expect(visibleRings(['1,0', '2,0', '3,0', '4,0'])).toBe(6);
    expect(node('40,0').ring).toBe(40);
  });

  it('costs more each ring out, double for notables and abilities', () => {
    expect(collegeCost(node('1,0'))).toBe(2);
    expect(collegeCost(node('2,0'))).toBe(3);
    expect(collegeCost(node('3,0'))).toBe(7);
    expect(collegeCost(node('2,-1'))).toBe(3);
    expect(collegeCost(node('10,0'))).toBeGreaterThan(collegeCost(node('5,0')) * 3);
    expect(collegeSpent(['1,0', '2,0', '3,0'])).toBe(12);
  });

  it('sums its nodes into lasting edges, better pay and abilities', () => {
    const owned = ['1,0', '2,0', '3,0', '1,-1', '-1,0', '0,1', '0,2', '0,3'];
    const e = collegeEffects(owned);
    expect(e.attack).toBeCloseTo(1.06);
    expect(e.production).toBeCloseTo(1.03);
    expect(e.startMedals).toBe(2);
    // Two small medal nodes and the Field Pay notable.
    expect(e.medals).toBeCloseTo(1.5);
    expect(e.abilities).toEqual(['airStrike']);
    expect(medalsFor(4, true, false, 0, e.medals)).toBe(6);
    const trained = campaignWorldOptions(DIFFICULTIES.soldier, 1, NO_UPGRADES, 0, e);
    expect(trained.handicap!.player!).toBeCloseTo(1.03);
    expect(trained.boosts!.player!.attack).toBeCloseTo(1.06);
    expect(collegeLabel(node('0,3')).name).toBe('FIELD PAY');
    expect(collegeLabel(node('3,0')).name).toBe('AIR STRIKE');
  });
});
