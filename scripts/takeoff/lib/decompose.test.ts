import { describe, expect, it } from 'vitest';
import { decomposeArea } from './decompose';

const mm = (pts: [number, number, number?][]) => pts.map(([x, y, bulge]) => ({ x: x * 1000, y: y * 1000, bulge: bulge ?? 0 }));
const total = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0);

describe('decomposeArea', () => {
  it('dikdörtgen tek satır: en × boy', () => {
    const rows = decomposeArea(mm([[659.57, 5973.58], [690.77, 5973.58], [690.77, 6011.98], [659.57, 6011.98]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'dikdörtgen', adet: 1, sign: 1 });
    expect([rows[0].en, rows[0].boy].sort()).toEqual([31.2, 38.4].sort());
    expect(rows[0].value).toBeCloseTo(1198.08, 6);
  });
  it('döndürülmüş dikdörtgen de tek satır', () => {
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const r = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
    const rows = decomposeArea(mm([r(0, 0), r(10, 0), r(10, 4), r(0, 4)]));
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBeCloseTo(40, 6);
  });
  it('L şekli iki dikdörtgen', () => {
    const rows = decomposeArea(mm([[0, 0], [10, 0], [10, 3], [4, 3], [4, 8], [0, 8]]));
    expect(rows.every((x) => x.kind === 'dikdörtgen')).toBe(true);
    expect(rows).toHaveLength(2);
    expect(total(rows)).toBeCloseTo(10 * 3 + 4 * 5, 6);
  });
  it('eğik kenar yamukla', () => {
    const rows = decomposeArea(mm([[0, 0], [10, 0], [6, 4], [0, 4]]));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('yamuk');
    expect(total(rows)).toBeCloseTo(((10 + 6) / 2) * 4, 6);
  });
  it('yarım daire: daire parçası satırı', () => {
    const rows = decomposeArea(mm([[0, 0, 1], [10, 0]]));
    const seg = rows.find((x) => x.kind === 'daire parçası')!;
    expect(seg.r).toBeCloseTo(5, 6);
    expect(seg.angle).toBeCloseTo(180, 6);
    expect(total(rows)).toBeCloseTo((Math.PI * 25) / 2, 6);
  });
  it('dışa taşan yaylı dikdörtgen: dikdörtgen + daire parçası', () => {
    // 10×4 dikdörtgen, üst kenar dışa doğru yay (bulge 0.2)
    const rows = decomposeArea(mm([[0, 0], [10, 0], [10, 4, 0.2], [0, 4]]));
    const theta = 4 * Math.atan(0.2);
    const r = 10 / (2 * Math.sin(theta / 2));
    expect(total(rows)).toBeCloseTo(40 + (r * r) / 2 * (theta - Math.sin(theta)), 6);
    expect(rows.find((x) => x.kind === 'daire parçası')!.sign).toBe(1);
  });
  it('içe giren yay eksi satır', () => {
    const rows = decomposeArea(mm([[0, 0], [10, 0], [10, 4, -0.2], [0, 4]]));
    expect(rows.find((x) => x.kind === 'daire parçası')!.sign).toBe(-1);
  });
});
