import { describe, expect, it } from 'vitest';
import { highlightPoz } from '@shared/model3d';
import { measure, nearestVertex, ribbonPositions, splitShapes } from './geometry';

describe('splitShapes', () => {
  it('en büyük halka dış, içindekiler boşluk, dışındakiler ayrı şekil', () => {
    const sq = (x: number, y: number, w: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + w], [x, y + w]];
    const shapes = splitShapes([sq(2, 2, 1), sq(0, 0, 10), sq(20, 0, 3)]);
    expect(shapes).toHaveLength(2);
    expect(shapes[0].holes).toHaveLength(1);
    expect(shapes[1].holes).toHaveLength(0);
  });
});

describe('ribbonPositions', () => {
  it('her parça iki üçgen; kapalıda son→ilk parçası da var', () => {
    const p: [number, number][] = [[0, 0], [1, 0], [1, 1]];
    expect(ribbonPositions(p, false, 0, 3).length).toBe(2 * 6 * 3);
    expect(ribbonPositions(p, true, 0, 3).length).toBe(3 * 6 * 3);
  });
});

describe('ölçüm', () => {
  it('3B, yatay ve düşey mesafe', () => {
    const m = measure([0, 0, 0], [3, 4, 12]);
    expect(m.d).toBeCloseTo(13, 9);
    expect(m.horizontal).toBeCloseTo(5, 9);
    expect(m.dz).toBeCloseTo(12, 9);
  });
  it('tolerans içindeki köşeye yapışır', () => {
    expect(nearestVertex([1.05, 0, 0], [[0, 0, 0], [1, 0, 0]], 0.2)).toEqual([1, 0, 0]);
    expect(nearestVertex([0.5, 0, 0], [[0, 0, 0], [1, 0, 0]], 0.2)).toBeNull();
  });
});

describe('highlightPoz', () => {
  it('formüldeki kalemleri de vurgular (özyinelemeli)', () => {
    const f: Record<string, string> = { 'C.4.1': 'C.4', 'C.4': 'C.2 + C.3' };
    expect([...highlightPoz('C.4.1', (p) => f[p])].sort()).toEqual(['C.2', 'C.3', 'C.4', 'C.4.1']);
  });
});
