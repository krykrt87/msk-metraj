export interface SummaryRow {
  label: string;
  unit: string;
  formula: string;
}

export type Timestampish = { toDate(): Date } | null | undefined;

export function toDate(t: unknown): Date | null {
  if (t && typeof (t as { toDate?: unknown }).toDate === 'function') return (t as { toDate(): Date }).toDate();
  return null;
}

const dtf = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
export const formatDateTime = (t: unknown) => {
  const d = toDate(t);
  return d ? dtf.format(d) : '—';
};
