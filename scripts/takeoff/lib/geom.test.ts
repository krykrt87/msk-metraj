import { describe, expect, it } from 'vitest';
import { apply, area, clipConvex, expandBulges, length, mul, regionArea, rotate, sampleArc, sampleSpline, scale, translate } from './geom';

describe('clipConvex', () => {
  it('dikdörtgen duvar: kapı kutusu ortadan alınınca iki yan parça + lento alanı toplamı korunur', () => {
    const wall = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 1 }, { x: 0, y: 1 }];
    const box = [{ x: 4, y: -5 }, { x: 6, y: -5 }, { x: 6, y: 5 }, { x: 4, y: 5 }];
    const left = [{ x: -99, y: -99 }, { x: 4, y: -99 }, { x: 4, y: 99 }, { x: -99, y: 99 }];
    expect(area(clipConvex(wall, box))).toBeCloseTo(2);
    expect(area(clipConvex(wall, left))).toBeCloseTo(4);
    expect(clipConvex(wall, [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 1 }])).toEqual([]);
  });
});

const sq = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('geom', () => {
  it('çokgen alanı ve çevresi', () => {
    expect(area(sq(0, 0, 10))).toBe(100);
    expect(length(sq(0, 0, 10), true)).toBe(40);
  });
  it('bulge = 1 yarım daire: alan πr²/2, yay uzunluğu πr', () => {
    const pts = expandBulges([{ x: 0, y: 0, bulge: 1 }, { x: 10, y: 0 }], true);
    expect(area(pts)).toBeCloseTo((Math.PI * 25) / 2, 1);
    const open = expandBulges([{ x: 0, y: 0, bulge: 1 }, { x: 10, y: 0 }], false);
    expect(Math.abs(length(open) - Math.PI * 5) / (Math.PI * 5)).toBeLessThan(1e-4);
  });
  it('negatif bulge ters yönde aynı alanı verir', () => {
    expect(area(expandBulges([{ x: 0, y: 0, bulge: -1 }, { x: 10, y: 0 }], true))).toBeCloseTo((Math.PI * 25) / 2, 1);
  });
  it('delikli bölge alanı', () => {
    expect(regionArea([sq(0, 0, 10), sq(3, 3, 2)])).toBeCloseTo(96, 9);
    expect(regionArea([sq(0, 0, 10), sq(3, 3, 2), sq(3.5, 3.5, 1)])).toBeCloseTo(97, 9);
  });
  it('tam daire örneklemesi', () => {
    const c = sampleArc({ x: 0, y: 0 }, 1000, 0, 2 * Math.PI);
    c.pop();
    expect(Math.abs(area(c) - Math.PI * 1e6) / (Math.PI * 1e6)).toBeLessThan(1e-4);
  });
  it('dönüşüm bileşimi', () => {
    const m = mul(translate(100, 0), mul(rotate(90), scale(2, 2)));
    const p = apply(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(100, 9);
    expect(p.y).toBeCloseTo(2, 9);
  });
  it('1. derece spline kontrol noktalarından geçer', () => {
    const pts = sampleSpline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [0, 0, 1, 2, 2], 1);
    expect(length(pts)).toBeCloseTo(20, 6);
  });
});
