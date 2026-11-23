// DWG'den üretilen metrajı (work/metraj.json) emülatöre aktarır; eski Excel verisinin yerine geçer.
// Kullanım: npx tsx scripts/import-takeoff.ts [--file work/metraj.json] [--dry-run]
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DISCIPLINE, PROJECT_ID } from '../shared/constants';
import { evaluateAll } from '../shared/recompute';
import type { Finding, Item, Room } from '../shared/types';
import type { ImportData } from './excel/build';
import { writeImport } from './excel/write';
import { argValue, initAdmin } from './lib/admin';
import type { Takeoff } from './takeoff/metraj/model';
import { SPECS } from './takeoff/metraj/specs';

const CODE = /4199-A-DD-\d{2}-\d{2}-\d{3}/g;

export function takeoffToImport(t: Takeoff): ImportData {
  const items: Item[] = t.items.map((i, k) => {
    const drawings = [...new Set(i.sources.flatMap((s) => s.drawing.match(CODE) ?? []))];
    return {
      id: i.poz,
      poz: i.poz,
      group: i.group,
      order: k + 1,
      name: i.name,
      code: i.code ?? null,
      unit: i.unit,
      kind: i.formula ? 'derived' : 'measured',
      value: i.value,
      formula: i.formula ?? null,
      method: i.method,
      sourceText: i.sources.map((s) => `${s.drawing}: ${s.where}`).join('; '),
      drawings,
      confidence: i.confidence,
      status: 'kontrol_edilmedi',
      lockWarning: null,
      cancelled: false,
      importedValue: i.value,
      sourceFormula: null,
      updatedAt: null,
      updatedBy: null,
      breakdown: i.lines.map((l) => ({ label: l.label, value: l.value, unit: l.unit, ...(l.note ? { note: l.note } : {}), ...(l.calc?.length ? { calc: l.calc } : {}) })),
      sources: i.sources,
      notes: i.notes ?? [],
      specs: SPECS[i.poz] ?? [],
    };
  });
  const unknown = Object.keys(SPECS).filter((p) => !t.items.some((i) => i.poz === p));
  if (unknown.length) throw new Error(`Malzeme özelliği tanımlı ama kalemi yok: ${unknown.join(', ')}`);
  const rooms: Room[] = t.rooms.map((r, k) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    floor: r.floor,
    zone: r.zone,
    area: r.area,
    ceilingLower: r.ceilingLower,
    ceilingUpper: r.ceilingUpper,
    ch: r.ch,
    flooring: r.flooring,
    note: [r.areaSource !== 'sınır' ? `Alan kaynağı: ${r.areaSource}.` : null, r.note].filter(Boolean).join(' ') || null,
    checkArea: r.measuredArea,
    order: k + 1,
  }));
  const findings: Finding[] = t.findings.map((f, k) => ({
    no: k + 1,
    topic: f.topic,
    drawingsText: f.drawings,
    finding: f.finding,
    suggestion: f.suggestion,
    status: 'acik',
  }));
  const summaryPoz = ['A.1', 'A.2', 'A.3', 'B.1', 'B.3', 'C.1', 'C.10', 'D.11', 'D.12', 'F.1'];
  const summary = summaryPoz
    .map((p) => t.items.find((i) => i.poz === p))
    .filter((i): i is Takeoff['items'][number] => !!i)
    .map((i) => ({ label: i.name, unit: i.unit, formula: i.poz }));
  return {
    discipline: { name: 'Mimari', groups: t.groups, summary, methodText: t.method, facadeNotes: [] },
    items,
    rooms,
    facade: [],
    materials: [],
    findings,
    warnings: [],
  };
}

/** Uygulamada elle düzenlenmiş özellikleri yeni kalemlere taşır; kalemi kalkan varsa veri silinmeden durur. */
export function keepManualSpecs(items: Item[], prev: Item[]): string[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const orphans = prev.filter((p) => !byId.has(p.id)).map((p) => p.id);
  if (orphans.length) throw new Error(`Elle girilmiş malzeme özelliği olan kalemler yeni metrajda yok: ${orphans.join(', ')}. Özellikleri başka kaleme taşıyın ya da kaydedin.`);
  for (const p of prev) Object.assign(byId.get(p.id)!, { specs: p.specs ?? [], specsManual: true });
  return prev.map((p) => p.id);
}

async function main(argv: string[]) {
  const file = argValue(argv, '--file') ?? 'work/metraj.json';
  const t = JSON.parse(readFileSync(file, 'utf8')) as Takeoff;
  const data = takeoffToImport(t);
  // tutarlılık: uygulamanın hesap çekirdeği formüllü kalemleri aynı değere getirmeli
  const values = evaluateAll({
    items: Object.fromEntries(data.items.map((i) => [i.id, i])),
    rooms: Object.fromEntries(data.rooms.map((r) => [r.id, r])),
    facade: {},
    materials: {},
  });
  const off = data.items.filter((i) => i.formula && i.value !== null && Math.abs((values.items[i.id] ?? 0) - i.value) > 0.01);
  if (off.length) throw new Error(`Formül değerleri tutmuyor: ${off.map((i) => i.id).join(', ')}`);
  console.log(`${data.items.length} kalem, ${data.rooms.length} mahal, ${data.findings.length} kontrol notu`);
  if (argv.includes('--dry-run')) return;
  const { db, bucket } = initAdmin(argv);
  const prev = await db.collection(`projects/${PROJECT_ID}/disciplines/${DISCIPLINE}/items`).where('specsManual', '==', true).get();
  const kept = keepManualSpecs(data.items, prev.docs.map((d) => d.data() as Item));
  if (kept.length) console.log(`Elle girilen malzeme özellikleri korundu: ${kept.join(', ')}`);
  await writeImport(db, data, { reset: true, source: `DWG metrajı ${t.generatedAt.slice(0, 10)}` });
  console.log('Emülatöre yazıldı (eski veri silindi).');
  // 3B model (metraj motorunun geometrisinden) → Storage
  const model = argValue(argv, '--model') ?? 'work/model3d.json';
  if (existsSync(model)) {
    await bucket.file(`projects/${PROJECT_ID}/disciplines/${DISCIPLINE}/model/model3d.json`).save(readFileSync(model), { contentType: 'application/json' });
    console.log('3B model yüklendi.');
  }
  if (existsSync('work/underlay.json')) {
    await bucket.file(`projects/${PROJECT_ID}/disciplines/${DISCIPLINE}/model/underlay.json`).save(readFileSync('work/underlay.json'), { contentType: 'application/json' });
    console.log('Plan altlığı yüklendi.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Aktarım durdu: ${(e as Error).message}`);
    process.exit(1);
  });
}
