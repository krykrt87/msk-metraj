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

/** Eleman kimliği öneki: DUV-12 gibi (katman içinde üretim sırası). */
export const ID_PREFIX: Record<Layer3, string> = { döşeme: 'DOS', mahal: 'MAH', duvar: 'DUV', kolon: 'KOL', tavan: 'TAV', çatı: 'CAT', cephe: 'CEP', donatı: 'DON' };

export interface El3 {
  id: string;
  layer: Layer3;
  /** prism: halkalar z0→z1 katı; flat: z0'da yüzey; ribbon: çizgi boyunca z0→z1 düşey yüzey; pin: nokta işareti;
   *  mesh: eğik/eğrisel yüzey (faces), z0/z1 en düşük/en yüksek nokta. */
  kind: 'prism' | 'flat' | 'ribbon' | 'pin' | 'mesh';
  /** Elemanın ait olduğu metraj kalemleri (poz). */
  items: string[];
  /** Kalem başına hesap detayındaki satır: satır adı ya da sırası. */
  lines?: Record<string, string | number>;
  label: string;
  /** prism / flat: [dış halka, boşluklar…], her halka [x, y][] */
  loops?: [number, number][][];
  /** ribbon: çizgi; pin: tek nokta */
  path?: [number, number][];
  /** mesh: düzlemsel dışbükey çokgenler, her köşe [x, y, z] */
  faces?: [number, number, number][][];
  closed?: boolean;
  z0: number;
  z1: number;
}

export interface Model3 {
  generatedAt: string;
  origin: [number, number]; // mm, çizim koordinatı
  elements: El3[];
}

/** Plan altlığı (01-02-100 çizgileri): kat başına katman katman çoklu çizgiler, [x, y, x, y, …] cm, model orijinine göre. */
export interface Underlay {
  plans: { key: string; label: string; z: number }[];
  /** texts: [x, y, yükseklik (cm), yazı, ortalı?] — yatay; ortalı değilse (x, y) sol alt köşe (taban çizgisi). */
  layers: { name: string; lines: Record<string, number[][]>; texts?: Record<string, [number, number, number, string, 1?][]> }[];
}

/** Kalemin 3B'de vurgulanacak pozları: kendisi + formülünde geçen kalemler (özyinelemeli).
 *  Kendi 3B elemanı olan kalemin formülüne inilmez (C.5 = B.7 × 0,45 yalnız kendi bandını yakar, bütün saçak alnını değil). */
export function highlightPoz(poz: string, formulaOf: (poz: string) => string | null | undefined, hasOwn: (poz: string) => boolean = () => false): Set<string> {
  const out = new Set<string>();
  const walk = (p: string) => {
    if (out.has(p)) return;
    out.add(p);
    if (hasOwn(p)) return;
    const f = formulaOf(p);
    if (f) for (const m of f.matchAll(/\b([A-Z]\.\d+(?:\.\d+)?)\b/g)) walk(m[1]);
  };
  walk(poz);
  return out;
}
