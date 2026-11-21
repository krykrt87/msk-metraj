// Metraj çıktısının veri modeli: her kalem, nereden ve nasıl hesaplandığını satır satır taşır.
export interface Line {
  label: string; // ör. "GF-03 SALON 01"
  value: number | null;
  unit: string;
  note?: string; // ör. "sınır çizgisi #23, etiket 1198.08"
}
export interface Source {
  drawing: string; // pafta kodu, ör. 4199-A-DD-01-02-100
  where: string; // blok / katman / nesne açıklaması
}
export interface TakeoffItem {
  poz: string;
  group: string; // A … K
  name: string;
  code?: string | null; // proje malzeme kodu (FG-01 …)
  unit: string;
  value: number | null; // ölçülemedi → null
  formula?: string | null; // türetilen kalem (uygulama formül dili)
  method: string; // tek paragraf: ne, nereden, nasıl
  sources: Source[];
  confidence: 'Yüksek' | 'Orta' | 'Düşük' | null;
  lines: Line[]; // hesap detayı
  notes?: string[]; // varsayım, belirsizlik, proje hatası
  image?: string; // work/png/metraj/<poz>.png
}
export interface RoomRow {
  id: string;
  code: string;
  name: string;
  floor: string;
  zone: string;
  area: number; // m²
  areaSource: 'sınır' | 'etiket' | 'ölçüm';
  labelArea: number | null;
  measuredArea: number | null; // doldurma kontrolü
  ceilingLower: string | null;
  ceilingUpper: string | null;
  ch: string | null;
  flooring: string | null;
  note: string | null;
}
export interface Takeoff {
  generatedAt: string;
  groups: { key: string; title: string }[];
  items: TakeoffItem[];
  rooms: RoomRow[];
  findings: { topic: string; drawings: string; finding: string; suggestion: string }[];
  method: string[];
}
