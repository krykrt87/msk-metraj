// Alan türleri: Firestore dokümanları, fonksiyonlar ve arayüz bu tanımları paylaşır.

export type Role = 'admin' | 'kontrolcu' | 'satinalma';
export type Status =
  | 'kontrol_edilmedi'
  | 'kontrol_edildi'
  | 'duzeltildi'
  | 'sorunlu'
  | 'yeniden_kontrol'
  | 'kesinlesti';
export type LockWarning = 'ust_kalem' | 'pafta_revizyonu' | null;
export type Confidence = 'Yüksek' | 'Orta' | 'Düşük' | null;
export type FacadeColumn = 'FM-01' | 'FM-02/FM-03' | 'FM-04' | 'FM-05' | 'FS-01' | 'FP-01';
export const FACADE_COLUMNS: FacadeColumn[] = ['FM-01', 'FM-02/FM-03', 'FM-04', 'FM-05', 'FS-01', 'FP-01'];
export type RoomField = 'kat' | 'tavan_alt' | 'tavan_ust' | 'doseme';
export type FindingStatus = 'acik' | 'iletildi' | 'cozuldu';

/** Firestore Timestamp, istemci Date veya ISO metni olabilir; paylaşılan kod zamana dokunmaz. */
export type TimeValue = unknown;
export interface Actor {
  uid: string;
  name: string;
}

export interface Item {
  id: string; // = poz, değişmez
  poz: string;
  group: string; // 'A' … 'I'
  order: number;
  name: string;
  code: string | null; // proje kodu (FG-01 …)
  unit: string;
  kind: 'measured' | 'derived';
  value: number | null; // null = ölçülemedi
  formula: string | null;
  method: string;
  sourceText: string;
  drawings: string[];
  confidence: Confidence;
  status: Status;
  lockWarning: LockWarning;
  cancelled: boolean;
  importedValue: number | null;
  sourceFormula: string | null;
  updatedAt: TimeValue;
  updatedBy: Actor | null;
  /** Hesap detayı: miktarın satır satır dökümü (DWG ölçümünden). */
  breakdown?: { label: string; value: number | null; unit: string; note?: string; calc?: CalcRow[] }[];
  /** Kaynak pafta ve çizim nesnesi (blok / katman). */
  sources?: { drawing: string; where: string }[];
  /** Varsayım, belirsizlik, proje hatası notları. */
  notes?: string[];
}

/**
 * Metraj cetveli satırı: adet × en × boy (yamukta ortalama en; daire parçasında r ve açı).
 * Uzunluk satırları: 'doğru' (boy), 'yay' (r × θ). 'duvar': en = kalınlık, boy = uzunluk.
 * 'kalem': başka kalemin miktarı × adet (formüllü kalemler). 'sayım': blok/nesne sayımı.
 * 'değer': çizimde yazılı ya da detaydan alınan sayı (kaynağı name'de).
 * value adet dahil, işaretli toplamdır; unit yoksa m².
 */
export interface CalcRow {
  kind: 'dikdörtgen' | 'yamuk' | 'daire parçası' | 'doğru' | 'yay' | 'duvar' | 'kalem' | 'sayım' | 'değer';
  unit?: string;
  /** Parçanın ait olduğu eleman (ör. "Güney eğrisel kenar"); parça adının yanında gösterilir. */
  name?: string;
  label: string;
  adet: number;
  en?: number;
  boy?: number;
  yukseklik?: number;
  a?: number;
  b?: number;
  r?: number;
  angle?: number;
  sign: 1 | -1;
  value: number;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  floor: string;
  zone: string;
  area: number;
  ceilingLower: string | null;
  ceilingUpper: string | null;
  ch: string | null;
  flooring: string | null;
  note: string | null;
  checkArea: number | null;
  order: number;
}

export interface FacadeRow {
  id: string; // GD | KD | KB | GB
  label: string;
  values: Record<FacadeColumn, number>;
}

export interface Material {
  id: string;
  no: number;
  group: string;
  name: string;
  code: string | null;
  usage: string;
  sourceText: string;
  unit: string;
  formula: string | null;
  value: number | null;
  note: string | null;
}

export interface Finding {
  no: number;
  topic: string;
  drawingsText: string;
  finding: string;
  suggestion: string;
  status: FindingStatus;
}

export interface Drawing {
  code: string;
  title: string;
  series: string;
  seriesTitle: string;
  zone: string;
  scale: string;
  paper: string;
  currentRevId: string | null;
}

export interface Revision {
  id: string;
  label: string;
  storagePath: string;
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  uploadedAt: TimeValue;
  uploadedBy: Actor | null;
}

export type HistoryAction =
  | 'import'
  | 'correct'
  | 'formula'
  | 'status'
  | 'finalize'
  | 'unlock'
  | 'acknowledge'
  | 'create'
  | 'cancel'
  | 'info'
  | 'cascade'
  | 'room'
  | 'facade'
  | 'material'
  | 'revision';

export type TargetType = 'item' | 'room' | 'facade' | 'material' | 'drawing';

export interface HistoryEntry {
  at: TimeValue;
  by: Actor;
  batchId: string;
  target: { type: TargetType; id: string };
  action: HistoryAction;
  field: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  cause: { type: TargetType; id: string; action: HistoryAction } | null;
}

export interface DisciplineAccess {
  view: boolean;
  drawings: boolean;
}
export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  access: Record<string, Record<string, DisciplineAccess>>;
}

export const STATUS_LABEL: Record<Status, string> = {
  kontrol_edilmedi: 'Kontrol edilmedi',
  kontrol_edildi: 'Kontrol edildi',
  duzeltildi: 'Düzeltildi',
  sorunlu: 'Sorunlu',
  yeniden_kontrol: 'Yeniden kontrol gerekli',
  kesinlesti: 'Kesinleşti',
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Yönetici',
  kontrolcu: 'Kontrolcü',
  satinalma: 'Satın alma',
};

export const LOCK_WARNING_LABEL: Record<Exclude<LockWarning, null>, string> = {
  ust_kalem: 'Kesinleşti – üst kalem değişti',
  pafta_revizyonu: 'Kesinleşti – pafta revize edildi',
};

export const ACTION_LABEL: Record<HistoryAction, string> = {
  import: 'Excel aktarımı',
  correct: 'Düzeltme',
  formula: 'Formül değişikliği',
  status: 'Durum değişikliği',
  finalize: 'Kesinleştirme',
  unlock: 'Kilit açma',
  acknowledge: 'Uyarı onayı',
  create: 'Yeni kalem',
  cancel: 'İptal',
  info: 'Bilgi değişikliği',
  cascade: 'Bağlı değişiklik',
  room: 'Mahal değişikliği',
  facade: 'Cephe değişikliği',
  material: 'Malzeme formülü',
  revision: 'Pafta revizyonu',
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  acik: 'Açık',
  iletildi: 'Mimara iletildi',
  cozuldu: 'Çözüldü',
};
