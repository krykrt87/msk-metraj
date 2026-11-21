// 3B model verisi: metraj motorunun ölçtüğü geometriden üretilir (work/model3d.json → Storage).
// Koordinatlar metre, yerel orijin (zemin kat genel sınırının ortası), z = ±0,00'dan yükseklik.

export type Layer3 = 'döşeme' | 'mahal' | 'duvar' | 'kolon' | 'tavan' | 'çatı' | 'cephe' | 'donatı';

export const LAYERS3: { key: Layer3; label: string; visible: boolean }[] = [
  { key: 'döşeme', label: 'Döşeme', visible: true },
  { key: 'mahal', label: 'Mahaller', visible: true },
  { key: 'duvar', label: 'Duvarlar', visible: true },
  { key: 'kolon', label: 'Kolonlar', visible: true },
  { key: 'tavan', label: 'Tavanlar', visible: false },
  { key: 'çatı', label: 'Çatı', visible: true },
  { key: 'cephe', label: 'Cephe', visible: true },
  { key: 'donatı', label: 'Kapı / donatı', visible: true },
];

export interface El3 {
  id: string;
  layer: Layer3;
  /** prism: halkalar z0→z1 katı; flat: z0'da yüzey; ribbon: çizgi boyunca z0→z1 düşey yüzey; pin: nokta işareti. */
  kind: 'prism' | 'flat' | 'ribbon' | 'pin';
  /** Elemanın ait olduğu metraj kalemleri (poz). */
  items: string[];
  label: string;
  /** prism / flat: [dış halka, boşluklar…], her halka [x, y][] */
  loops?: [number, number][][];
  /** ribbon: çizgi; pin: tek nokta */
  path?: [number, number][];
  closed?: boolean;
  z0: number;
  z1: number;
}

export interface Model3 {
  generatedAt: string;
  origin: [number, number]; // mm, çizim koordinatı
  elements: El3[];
}

/** Kalemin 3B'de vurgulanacak pozları: kendisi + formülünde geçen kalemler (özyinelemeli). */
export function highlightPoz(poz: string, formulaOf: (poz: string) => string | null | undefined): Set<string> {
  const out = new Set<string>();
  const walk = (p: string) => {
    if (out.has(p)) return;
    out.add(p);
    const f = formulaOf(p);
    if (f) for (const m of f.matchAll(/\b([A-Z]\.\d+(?:\.\d+)?)\b/g)) walk(m[1]);
  };
  walk(poz);
  return out;
}
