// Drawing Register (Excel) → pafta bilgileri. "DD_KESİN PROJE" sayfası:
// seri başlık satırı: B sütunu "01 VAZIYET PLANI" (birleşik hücre); pafta satırı: C ad, D kod, E ölçek, F kağıt.
import type { Drawing } from '../../shared/types';

export type DrawingMeta = Omit<Drawing, 'currentRevId'>;

const CODE = /^4199-A-DD-(\d{2})-(\d{2})-(\d{3})$/;
const SERIES = /^(\d{2})\s+(.+)$/;
const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
  return String(v);
};
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** rows: sayfa satırları, her biri A'dan başlayan hücre değerleri (rows[i][0] = A sütunu). */
export function parseRegister(rows: unknown[][]): DrawingMeta[] {
  const out: DrawingMeta[] = [];
  let series = '';
  let seriesTitle = '';
  for (const r of rows) {
    const b = clean(text(r[1]));
    const code = clean(text(r[3]));
    const m = CODE.exec(code);
    if (m) {
      if (m[2] !== series) throw new Error(`${code}: seri başlığı (${m[2]}) bulunamadı`);
      out.push({ code, title: clean(text(r[2])), series, seriesTitle, zone: m[1], scale: clean(text(r[4])), paper: clean(text(r[5])) });
      continue;
    }
    const s = SERIES.exec(b); // başlık birleşik hücre: aynı metin diğer sütunlarda da tekrarlanır
    if (s) {
      series = s[1];
      seriesTitle = s[2];
    }
  }
  const dup = out.find((d, i) => out.findIndex((x) => x.code === d.code) !== i);
  if (dup) throw new Error(`Pafta kodu iki kez geçiyor: ${dup.code}`);
  return out;
}
