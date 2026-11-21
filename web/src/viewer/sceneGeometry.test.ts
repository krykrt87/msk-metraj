import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Model3 } from '@shared/model3d';
import { geometryOf } from './sceneGeometry';

describe('geometryOf', () => {
  it('boşluklu prizma: hacim üçgenleri z0–z1 arasında', () => {
    const g = geometryOf({ id: 'a', layer: 'duvar', kind: 'prism', items: [], label: '', loops: [[[0, 0], [4, 0], [4, 4], [0, 4]], [[1, 1], [2, 1], [2, 2], [1, 2]]], z0: 0, z1: 3 })!;
    g.computeBoundingBox();
    expect(g.boundingBox!.min.z).toBeCloseTo(0);
    expect(g.boundingBox!.max.z).toBeCloseTo(3);
  });
  it('pin dikey silindir', () => {
    const g = geometryOf({ id: 'p', layer: 'donatı', kind: 'pin', items: [], label: '', path: [[5, 6]], z0: 0, z1: 2 })!;
    g.computeBoundingBox();
    expect(g.boundingBox!.max.z).toBeCloseTo(2);
    expect((g.boundingBox!.min.x + g.boundingBox!.max.x) / 2).toBeCloseTo(5);
  });
  it.runIf(existsSync('work/model3d.json'))('gerçek modelin bütün elemanları üçgenleniyor', () => {
    const m = JSON.parse(readFileSync('work/model3d.json', 'utf8')) as Model3;
    const bad = m.elements.filter((e) => {
      const g = geometryOf(e);
      const n = g?.getAttribute('position')?.count ?? 0;
      return !g || n === 0 || Number.isNaN(g.getAttribute('position').array[0]);
    });
    expect(bad.map((e) => `${e.id} ${e.label}`)).toEqual([]);
  });
});
