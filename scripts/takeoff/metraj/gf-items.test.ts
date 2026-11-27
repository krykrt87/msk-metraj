import { describe, expect, it } from 'vitest';
import { covered } from './gf-items';

const rect = (x0: number, y0: number, x1: number, y1: number) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
const box = (x0: number, y0: number, x1: number, y1: number) => ({ loops: rect(x0, y0, x1, y1), b: { minX: x0, minY: y0, maxX: x1, maxY: y1 } });

describe('covered', () => {
  it('örtüşen alan payını verir', () => {
    expect(covered(rect(0, 0, 1000, 200), [box(0, 0, 1000, 200)])).toBe(1);
    expect(covered(rect(0, 0, 1000, 200), [box(500, -100, 2000, 300)])).toBeCloseTo(0.5, 2);
    expect(covered(rect(0, 0, 1000, 200), [box(0, 400, 1000, 600)])).toBe(0);
  });
});
