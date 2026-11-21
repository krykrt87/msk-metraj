// Excel "Kaynak Pafta" metnini pafta kodlarına çevirir.
// Örnekler: "01…04-02-100", "01/02-04-100…400", "02-03-100/200", "05-100", "01/02-04-xxx", "Görünüşler"
const PART = /^(?:(\d{2}(?:(?:…|\.\.\.|\/)\d{2})*)-)?(\d{2})-(\d{3}(?:(?:…|\.\.\.|\/)\d{3})*|xxx)$/i;
const CODE = /^\d{4}-[A-Z]+-[A-Z]+-(\d{2})-(\d{2})-(\d{3})$/;

/** "01…04" → 1..4 aralığı, "01/02" → liste; null = hepsi. */
function matcher(spec: string | undefined): ((n: number) => boolean) | null {
  if (!spec || spec.toLowerCase() === 'xxx') return null;
  const ranges = spec.split('/').map((p) => {
    const [lo, hi] = p.split(/…|\.\.\./).map(Number);
    return [lo, hi ?? lo] as const;
  });
  return (n) => ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

export function expandDrawingRefs(text: string, known: string[]): { codes: string[]; unresolved: string[] } {
  const parsed = known
    .map((code) => ({ code, m: CODE.exec(code) }))
    .filter((x): x is { code: string; m: RegExpExecArray } => x.m !== null)
    .map(({ code, m }) => ({ code, zone: Number(m[1]), series: m[2], num: Number(m[3]) }));
  const found = new Set<string>();
  const unresolved: string[] = [];

  for (const raw of text.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    let hits: string[] = [];
    if (/^görünüşler$/i.test(part)) {
      hits = parsed.filter((p) => p.series === '04').map((p) => p.code);
    } else {
      const m = PART.exec(part);
      if (m) {
        const zoneOk = matcher(m[1]);
        const numOk = matcher(m[3]);
        hits = parsed
          .filter((p) => p.series === m[2] && (!zoneOk || zoneOk(p.zone)) && (!numOk || numOk(p.num)))
          .map((p) => p.code);
      }
    }
    if (hits.length === 0) unresolved.push(part);
    hits.forEach((h) => found.add(h));
  }
  return { codes: known.filter((c) => found.has(c)), unresolved };
}
