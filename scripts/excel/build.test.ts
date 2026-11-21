import { describe, expect, it, vi } from 'vitest';
import { readWorkbook } from './read';
import { buildImport } from './build';
import { reconcile } from './reconcile';
import { runImport } from '../import-excel';
import { buildFixtureWorkbook, FIXTURE_DRAWINGS } from './fixture';

describe('readWorkbook', () => {
  it('formülü, sonucu ve paylaşımlı formülü okur', async () => {
    const raw = await readWorkbook(await buildFixtureWorkbook());
    expect(raw.Metraj.E7).toEqual({ value: 2847.7, formula: '805.5+1239+803.2' });
    expect(raw.Metraj.E9.formula).toBe('E8');
    expect(raw.Metraj.E9.value).toBe(2847.7);
    expect(raw.Metraj.B4.value).toBe('Zemin kat net mahal alanı (toplam)');
  });
});

describe('buildImport', () => {
  it('kalem türlerini, formülleri ve pafta kodlarını çıkarır', async () => {
    const data = buildImport(await readWorkbook(await buildFixtureWorkbook()), FIXTURE_DRAWINGS);
    const byId = Object.fromEntries(data.items.map((i) => [i.id, i]));
    expect(data.items.map((i) => i.id)).toEqual(['A.1', 'A.5', 'B.1', 'B.1.1', 'B.1.2', 'B.2', 'C.2', 'B.4', 'H.1', 'H.2', 'H.8']);
    expect(byId['A.1']).toMatchObject({ kind: 'derived', formula: 'MAHAL(kat; "Zemin Kat")', value: 120.5, importedValue: 120.5, group: 'A' });
    expect(byId['B.1']).toMatchObject({ kind: 'measured', formula: null, value: 2847.7, sourceFormula: '805.5+1239+803.2' });
    expect(byId['B.1.2']).toMatchObject({ kind: 'derived', formula: 'B.1.1' });
    expect(byId['B.2']).toMatchObject({ kind: 'derived', formula: 'A.5 - B.1' });
    expect(byId['C.2']).toMatchObject({ formula: 'CEPHE("FM-01")', code: 'FM-01' });
    expect(byId['H.8'].formula).toBe('H.1 + H.2');
    expect(byId['B.4']).toMatchObject({ kind: 'measured', value: null, confidence: null, unit: 'm' });
    expect(byId['A.1'].drawings).toHaveLength(4);
    expect(byId['A.1']).toMatchObject({ status: 'kontrol_edilmedi', lockWarning: null, cancelled: false });
    expect(data.warnings).toEqual(['B.2: "Genel not 10" pafta olarak çözülemedi']);
    expect(data.discipline.groups).toEqual([
      { key: 'A', title: 'GENEL ALANLAR' },
      { key: 'B', title: 'ÇATI' },
      { key: 'H', title: 'KAPILAR' },
    ]);
  });
  it('mahal, cephe, malzeme, bulgu, özet ve yöntemi çıkarır', async () => {
    const data = buildImport(await readWorkbook(await buildFixtureWorkbook()), FIXTURE_DRAWINGS);
    expect(data.rooms.map((r) => r.id)).toEqual(['GF-01', 'GF-02~1', 'GF-02~2']);
    expect(data.rooms[1]).toMatchObject({ code: 'GF-02', floor: 'Zemin Kat', area: 20.5, ceilingLower: 'C-P01', ch: '3.40' });
    expect(data.rooms[0].checkArea).toBe(98.5);
    expect(data.facade.map((f) => f.id)).toEqual(['GD', 'KD', 'KB', 'GB']);
    expect(data.facade[1].values['FS-01']).toBe(227.3);
    expect(data.materials.map((x) => [x.id, x.formula])).toEqual([['1', 'B.2'], ['2', null], ['3', 'B.1 + A.5']]);
    expect(data.findings[0]).toMatchObject({ no: 1, topic: 'Mahal kodu tekrarı', status: 'acik' });
    expect(data.discipline.summary).toEqual([
      { label: 'Zemin kat net mahal alanı', unit: 'm²', formula: 'A.1' },
      { label: 'Toplam kapı', unit: 'adet', formula: 'H.8' },
    ]);
    expect(data.discipline.methodText).toEqual(['1. Kaynak: 40 PDF pafta.', '2. Ölçek: 1/100.']);
    expect(data.discipline.facadeNotes).toEqual(['Malzeme kodları görünüş etiketlerine göredir.']);
  });
  it('eksik sayfada hata verir', async () => {
    const raw = await readWorkbook(await buildFixtureWorkbook({ omitSheet: 'Metraj' }));
    expect(() => buildImport(raw, FIXTURE_DRAWINGS)).toThrow(/Metraj/);
  });
});

describe('reconcile', () => {
  it('uyumlu kitapta uyuşmazlık yok', async () => {
    const raw = await readWorkbook(await buildFixtureWorkbook());
    const r = reconcile(buildImport(raw, FIXTURE_DRAWINGS), raw);
    expect(r.mismatches).toBe(0);
    expect(r.rows.length).toBeGreaterThan(15);
  });
  it('bozulan sonucu yakalar', async () => {
    const raw = await readWorkbook(await buildFixtureWorkbook({ breakResult: true }));
    const r = reconcile(buildImport(raw, FIXTURE_DRAWINGS), raw);
    expect(r.mismatches).toBe(1);
    expect(r.rows.find((x) => !x.ok)).toMatchObject({ sheet: 'Metraj', cell: 'E10', label: 'B.2' });
  });
});

describe('runImport', () => {
  it('uyuşmazlık varsa hiçbir şey yazmaz', async () => {
    const write = vi.fn();
    const raw = await readWorkbook(await buildFixtureWorkbook({ breakResult: true }));
    const r = await runImport(raw, FIXTURE_DRAWINGS, { write, report: () => {} });
    expect(r.mismatches).toBe(1);
    expect(write).not.toHaveBeenCalled();
  });
  it('eksik sayfada hata verir ve yazmaz', async () => {
    const write = vi.fn();
    const raw = await readWorkbook(await buildFixtureWorkbook({ omitSheet: 'Mahal Listesi' }));
    await expect(runImport(raw, FIXTURE_DRAWINGS, { write, report: () => {} })).rejects.toThrow(/Mahal Listesi/);
    expect(write).not.toHaveBeenCalled();
  });
  it('uyumlu kitapta yazar', async () => {
    const write = vi.fn();
    const raw = await readWorkbook(await buildFixtureWorkbook());
    await runImport(raw, FIXTURE_DRAWINGS, { write, report: () => {} });
    expect(write).toHaveBeenCalledOnce();
  });
});
