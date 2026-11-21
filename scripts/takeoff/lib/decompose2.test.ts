import { describe, expect, it } from 'vitest';
import { decomposeLength, decomposeRegion, mergeRows, refitArcs } from './decompose';
import { sampleArc } from './geom';

const M = (x: number, y: number) => ({ x: x * 1000, y: y * 1000 });
const total = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);
const sq = (x0: number, y0: number, w: number, h: number) => [M(x0, y0), M(x0 + w, y0), M(x0 + w, y0 + h), M(x0, y0 + h)];

describe('refitArcs', () => {
  it('örneklenmiş yarım daireyi tek bulge köşesine çevirir', () => {
    // 10 m çaplı yarım daire + çap
    const arc = sampleArc(M(5, 0), 5000, Math.PI, 2 * Math.PI); // alttan geçen yay (0,0)→(10,0)
    const v = refitArcs(arc);
    expect(v).toHaveLength(2);
    expect(Math.abs(v[0].bulge)).toBeCloseTo(1, 4);
  });
  it('doğrusal ara noktaları siler', () => {
    const v = refitArcs([M(0, 0), M(5, 0), M(10, 0), M(10, 4), M(0, 4)]);
    expect(v).toHaveLength(4);
  });
});

describe('decomposeRegion', () => {
  it('boşluk eksi satır olarak düşülür', () => {
    const rows = decomposeRegion([sq(0, 0, 10, 8), sq(2, 2, 3, 3)]);
    expect(total(rows)).toBeCloseTo(80 - 9, 6);
    expect(rows.some((r) => r.sign === -1 && Math.abs(r.value + 9) < 1e-6)).toBe(true);
  });
  it('örneklenmiş yayı daire parçası olarak verir', () => {
    const loop = [...sampleArc(M(5, 0), 5000, 0, Math.PI)]; // üst yarım daire (10,0)→(0,0), çapla kapanır
    const rows = decomposeRegion([loop]);
    expect(rows.find((r) => r.kind === 'daire parçası')?.angle).toBeCloseTo(180, 3);
    expect(rows.length).toBeLessThanOrEqual(2);
    expect(total(rows)).toBeCloseTo((Math.PI * 25) / 2, 3);
  });
});

describe('ince eğri bant', () => {
  it('kirişleri kesişen dar halka dilimi doğru alanı verir', () => {
    const th = (49 * Math.PI) / 180;
    const outer = sampleArc(M(0, 0), 160000, Math.PI / 2 - th / 2, Math.PI / 2 + th / 2);
    const inner = sampleArc(M(0, 0), 156000, Math.PI / 2 - th / 2, Math.PI / 2 + th / 2).reverse();
    const rows = decomposeRegion([[...outer, ...inner]]);
    expect(total(rows)).toBeCloseTo((th / 2) * (160 ** 2 - 156 ** 2), 1);
  });
  it('dik üçgen dik kenarlarına hizalanır', () => {
    const rows = decomposeRegion([[M(0, 0), M(1.88, 0), M(0, 1.88)]]);
    expect(rows).toHaveLength(1);
    expect([rows[0].a, rows[0].b].sort()).toEqual([0, 1.88]);
    expect(rows[0].boy).toBeCloseTo(1.88, 6);
  });
});

describe('mergeRows', () => {
  it('aynı ölçülü satırları adetle birleştirir', () => {
    const rows = mergeRows([sq(0, 0, 2, 3), sq(5, 0, 2, 3), sq(9, 0, 2, 3)].flatMap((l) => decomposeRegion([l])));
    expect(rows).toHaveLength(1);
    expect(rows[0].adet).toBe(3);
    expect(rows[0].value).toBeCloseTo(18, 6);
  });
});

describe('decomposeLength', () => {
  it('doğru parçalar ve yay: r × θ', () => {
    const pts = [M(0, 0), M(10, 0), ...sampleArc(M(10, 5), 5000, -Math.PI / 2, Math.PI / 2).slice(1)];
    const rows = decomposeLength(pts, false);
    expect(rows.find((r) => r.kind === 'doğru')?.boy).toBeCloseTo(10, 6);
    const arc = rows.find((r) => r.kind === 'yay')!;
    expect(arc.r).toBeCloseTo(5, 3);
    expect(arc.angle).toBeCloseTo(180, 3);
    expect(total(rows)).toBeCloseTo(10 + Math.PI * 5, 3);
    expect(rows.every((r) => r.unit === 'm')).toBe(true);
  });
});
