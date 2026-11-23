// Paftaları (PDF) Storage'a yükler, drawings/{kod} + revisions/r0 dokümanlarını yazar.
// Kullanım: npx tsx scripts/upload-drawings.ts [--prod] [--dir <PDF klasörü>] [--register <xlsx>] [--label "DD 02.11.2026"] [--force] [--dry-run]
// Var olan pafta atlanır (--force: üzerine yazar). Register'da olup PDF'i olmayan / tersi raporlanır.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { FieldValue } from 'firebase-admin/firestore';
import { DISCIPLINE, PROJECT_ID } from '../shared/constants';
import { parseRegister, type DrawingMeta } from './drawings/register';
import { argValue, initAdmin } from './lib/admin';

const SRC = 'Projeler/261102_4199_MSK-Kesin Proje Teslim';
const BASE = `projects/${PROJECT_ID}/disciplines/${DISCIPLINE}`;

export async function readRegister(file: string): Promise<DrawingMeta[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets.find((w) => w.name.startsWith('DD_'));
  if (!ws) throw new Error(`${file}: "DD_..." sayfası yok`);
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (r) => rows.push((r.values as unknown[]).slice(1)));
  return parseRegister(rows);
}

/** İlk sayfanın boyutu (pt) ve sayfa sayısı. */
async function pdfInfo(buf: Buffer): Promise<{ pageWidth: number; pageHeight: number; pageCount: number }> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(buf), verbosity: 0 });
  const doc = await task.promise;
  const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
  const info = { pageWidth: Math.round(vp.width * 100) / 100, pageHeight: Math.round(vp.height * 100) / 100, pageCount: doc.numPages };
  await task.destroy();
  return info;
}

async function main(argv: string[]) {
  const dir = argValue(argv, '--dir') ?? `${SRC}/PDF`;
  const register = argValue(argv, '--register') ?? `${SRC}/261102_4199_MSK_Kesin Proje_Drawing Register.xlsx`;
  const label = argValue(argv, '--label') ?? 'DD 02.11.2026';
  const force = argv.includes('--force');
  const metas = await readRegister(register);
  const pdfs = new Set(readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => basename(f, '.pdf')));
  const noPdf = metas.filter((m) => !pdfs.has(m.code)).map((m) => m.code);
  const noReg = [...pdfs].filter((c) => !metas.some((m) => m.code === c));
  console.log(`Register: ${metas.length} pafta · PDF: ${pdfs.size} · PDF'i olmayan: ${noPdf.join(', ') || 'yok'} · register'da olmayan PDF: ${noReg.join(', ') || 'yok'}`);
  if (argv.includes('--dry-run')) return;

  const { db, bucket } = initAdmin(argv);
  let up = 0;
  let skip = 0;
  for (const m of metas.filter((x) => pdfs.has(x.code))) {
    const ref = db.doc(`${BASE}/drawings/${m.code}`);
    if (!force && (await ref.get()).data()?.currentRevId) {
      skip++;
      continue;
    }
    const file = join(dir, `${m.code}.pdf`);
    if (!existsSync(file)) throw new Error(`${file} yok`);
    const buf = readFileSync(file);
    const info = await pdfInfo(buf);
    if (info.pageCount > 1) console.warn(`  uyarı: ${m.code} ${info.pageCount} sayfa; yalnız ilk sayfa gösterilir`);
    const storagePath = `${BASE}/drawings/${m.code}/r0.pdf`;
    await bucket.file(storagePath).save(buf, { contentType: 'application/pdf' });
    const batch = db.batch();
    batch.set(ref, { ...m, currentRevId: 'r0' });
    batch.set(ref.collection('revisions').doc('r0'), {
      label, storagePath, ...info, uploadedAt: FieldValue.serverTimestamp(), uploadedBy: { uid: 'aktarim', name: 'Pafta aktarımı' },
    });
    await batch.commit();
    up++;
    console.log(`  ${m.code}  ${(buf.length / 1024 / 1024).toFixed(1)} MB  ${info.pageWidth}×${info.pageHeight} pt`);
  }
  console.log(`Yüklendi: ${up} · atlandı (zaten var): ${skip}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch((e) => {
    console.error(`Hata: ${(e as Error).message}`);
    process.exit(1);
  });
}
