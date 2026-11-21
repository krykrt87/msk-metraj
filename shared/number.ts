export class NumberParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NumberParseError';
  }
}

const fmt2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

/** Ekranda gösterim: 1.234,56 · adet için ondalıksız · boş değer "—". */
export function formatTr(value: number | null, unit?: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return unit === 'adet' ? fmt0.format(value) : fmt2.format(value);
}

const THOUSANDS = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/;
const PLAIN = /^-?\d+(,\d+)?$/;
const DOT_DECIMAL = /^-?\d+\.\d+$/;

/**
 * Kullanıcı girişini okur. Ondalık ayırıcı virgül, binlik ayırıcı nokta.
 * "2847.7" gibi noktalı ondalık belirsiz sayılır ve reddedilir.
 */
export function parseTrNumber(text: string): number {
  const s = text.replace(/[\s ]/g, '');
  if (s === '') throw new NumberParseError('Sayı girin.');
  if (THOUSANDS.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (PLAIN.test(s)) return Number(s.replace(',', '.'));
  if (DOT_DECIMAL.test(s)) throw new NumberParseError('Ondalık için virgül kullanın (ör. 2847,7).');
  throw new NumberParseError(`Geçersiz sayı: ${text.trim()}`);
}
