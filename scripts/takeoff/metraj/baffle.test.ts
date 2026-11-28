import { describe, expect, it } from 'vitest';
import { baffleSystem } from './ceiling-items';

const sq = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const span = (r: { x: number; y: number }[], k: 'x' | 'y') => Math.max(...r.map((p) => p[k])) - Math.min(...r.map((p) => p[k]));
// C-B01 deseni: yatay çizgiler, 150 mm aks, ikinci çizgi +50 mm
const pat = [
  { ang: 180, base: { x: 0, y: 0 }, off: { x: 0, y: -150 } },
  { ang: 180, base: { x: 0, y: 50 }, off: { x: 0, y: -150 } },
];

describe('baffleSystem', () => {
  it('her 150 mm\'de 50 mm genişlikte, tarama boyunca bıçak üretir', () => {
    const { blades } = baffleSystem([sq(0, 0, 3000, 1500)], pat);
    expect(blades).toHaveLength(10); // eksenler y = 25, 175, … 1375
    const lo = blades.map((r) => r.map((p) => p.y)).sort((p, q) => Math.min(...p) - Math.min(...q))[0];
    expect(Math.min(...lo)).toBeCloseTo(0);
    expect(Math.max(...lo)).toBeCloseTo(50);
    expect(span(blades[0], 'x')).toBeCloseTo(3000);
  });
  it('boşlukları ve kesilen alanı düşer', () => {
    const { blades } = baffleSystem([sq(0, 0, 3000, 1500), sq(1000, 0, 2000, 1500)], pat, [[sq(2500, 0, 2800, 1500)]]);
    expect(blades.reduce((s, r) => s + span(r, 'x'), 0)).toBeCloseTo(10 * (3000 - 1000 - 300));
  });
  it('taşıyıcılar bıçaklara dik, askılar taşıyıcı üstünde', () => {
    const { carriers, hangers } = baffleSystem([sq(0, 0, 3000, 2400)], pat);
    expect(carriers).toHaveLength(3); // x ≈ 464,5 / 1393,5 / 2322,5
    for (const c of carriers) (expect(span(c, 'x')).toBeCloseTo(30), expect(span(c, 'y')).toBeCloseTo(2400));
    expect(hangers).toHaveLength(6); // her taşıyıcıda y = 600, 1800
    for (const h of hangers) expect(carriers.some((c) => Math.abs(Math.min(...c.map((p) => p.x)) + 15 - (Math.min(...h.map((p) => p.x)) + 3)) < 1e-6)).toBe(true);
  });
});
