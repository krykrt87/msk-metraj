// Excel metrajını emülatöre aktarır. Mutabakatta tek uyuşmazlık varsa hiçbir şey yazılmaz.
// Kullanım: npx tsx scripts/import-excel.ts [--file <xlsx>] [--register <xlsx>] [--reset] [--dry-run]
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildImport, knownDrawingCodes, withComputedValues, type ImportData } from './excel/build';
import { readWorkbook, type RawBook } from './excel/read';
import { reconcile, renderReport } from './excel/reconcile';
import { writeImport } from './excel/write';
import { argValue, initAdmin } from './lib/admin';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT, 'Projeler', '261102_4199_MSK-Kesin Proje Teslim');
export const DEFAULT_FILE = join(SOURCE_DIR, 'MSK Kongre Merkezi – Malzeme Listesi ve Metraj.xlsx');
export const DEFAULT_REGISTER = join(SOURCE_DIR, '261102_4199_MSK_Kesin Proje_Drawing Register.xlsx');

export async function runImport(
  raw: RawBook,
  knownDrawings: string[],
  deps: { write(data: ImportData): Promise<void>; report(md: string): void; source?: string },
): Promise<{ mismatches: number; data: ImportData }> {
  const data = buildImport(raw, knownDrawings);
  const rec = reconcile(data, raw);
  deps.report(renderReport(rec, data.warnings, deps.source ?? 'Excel'));
  if (rec.mismatches === 0) await deps.write(withComputedValues(data));
  return { mismatches: rec.mismatches, data };
}

async function main(argv: string[]) {
  const file = argValue(argv, '--file') ?? DEFAULT_FILE;
  const register = argValue(argv, '--register') ?? DEFAULT_REGISTER;
  const reset = argv.includes('--reset');
  const dryRun = argv.includes('--dry-run');
  const db = dryRun ? null : initAdmin(argv).db;
  const raw = await readWorkbook(file);
  const known = knownDrawingCodes(await readWorkbook(register));
  const outDir = join(ROOT, 'scripts', 'out');
  const result = await runImport(raw, known, {
    source: basename(file),
    report: (md) => {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'mutabakat.md'), md);
    },
    write: async (data) => {
      if (db) await writeImport(db, data, { reset, source: basename(file) });
    },
  });
  const d = result.data;
  console.log(`Mutabakat: ${result.mismatches} uyuşmazlık · rapor: scripts/out/mutabakat.md`);
  console.log(`Pafta listesi: ${known.length} pafta · çözülemeyen pafta başvurusu: ${d.warnings.length}`);
  if (result.mismatches > 0) {
    console.error('Uyuşmazlık var; hiçbir şey yazılmadı.');
    process.exit(1);
  }
  console.log(
    `${dryRun ? 'Deneme (yazılmadı)' : 'Yazıldı'}: ${d.items.length} kalem, ${d.rooms.length} mahal, ${d.facade.length} cephe satırı, ${d.materials.length} malzeme, ${d.findings.length} bulgu`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Aktarım durdu: ${(e as Error).message}`);
    process.exit(1);
  });
}
