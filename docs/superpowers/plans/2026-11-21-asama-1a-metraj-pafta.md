# Aşama 1a – Altyapı, Metraj Kesinleştirme, Pafta Görüntüleyici · Uygulama Planı

> **Ajanlar için:** superpowers:executing-plans (native) ile görev görev uygulanır. Adımlar `- [ ]` ile işaretlenir.

**Hedef:** Excel metrajını Firebase'e birebir aktarıp, kalemleri kontrol/düzeltme/formül/kesinleştirme ile izli şekilde yöneten ve kaynak paftayı three.js ile gösteren uygulamanın yerelde (emülatör) çalışan ilk sürümü.

**Mimari:** React + Vite web uygulaması Firestore'u okur; metraj verisine **tüm yazmalar Cloud Functions (callable)** üzerinden yapılır. Her değişiklikte fonksiyon disiplinin tüm durumunu bir transaction içinde okur, saf `shared/` hesap çekirdeğiyle her şeyi yeniden hesaplar, alan alan farkları yazar ve **her farkı geçmişe kaydeder**. Böylece izsiz değişiklik ve eski değerde kalan bağlı kalem oluşmaz. Paftalar Storage'da durur, istemci yalnız kurallardan geçen `getBytes` ile okur.

**Teknoloji:** Node 24 (yerel), TypeScript, React 19, react-router 7, Vite, Vitest + Testing Library, Firebase JS SDK (modüler), firebase-admin, firebase-functions v2 (`onCall`), Firebase Emulator Suite (JDK 21), ExcelJS, zod, three.js (MapControls), pdfjs-dist, esbuild (functions paketi).

**Spec:** `docs/2026-11-21-metraj-uygulamasi-tasarim.md`

**Kapsam dışı (ayrı planlar):** 1b ölçüm geometrisi çıkarma + paftada gösterim + basit çizim; GitHub → Actions → Firebase canlı yayını; Aşama 2–4.

## Genel Kısıtlar
- Yalnız emülatör: Firebase proje kimliği `demo-msk` (gerçek projeye erişemez). Betikler emülatör ortam değişkenleri yoksa çalışmayı reddeder.
- Proje/disiplin sabitleri: `PROJECT_ID = 'msk-4199'`, `DISCIPLINE = 'A'` (Mimari).
- Depoya girmez: `Projeler/`, `*.xlsx`, `*.pdf`, `*.dwg`, `.env*`, `emulator-data/`, `scripts/out/`, servis anahtarları.
- Kurulumlar yönetici yetkisi olmadan yapılır (kullanıcı klasörü, zip + SHA256). Global npm kurulumu yok; firebase-tools devDependency.
- Arayüz Türkçe; sayı gösterimi `tr-TR`, 2 ondalık (birim `adet` ise 0).
- Fonksiyon bölgesi `europe-west1`; functions `engines.node = "22"`.
- İstemci `getDownloadURL` **kullanmaz** (token'lı adres kuralları atlar).
- 3D model miktar kaynağı değildir; bu planda yalnız devre dışı "3D" sekmesi var.

## İnceleme Odağı
1. **Eşzamanlı düzeltme:** iki kullanıcı aynı anda B.1 ve A.5'i düzeltir → sonunda B.2 = A.5 − B.1 olmalı (Görev 7 testi).
2. **Oturum açıkken yetki geri alma:** Yönetici pafta yetkisini kaldırınca kullanıcının bir sonraki pafta okuması hemen reddedilmeli (kurallar kullanıcı dokümanını okur, eski token kullanılmaz) (Görev 6 testi).
3. **Fonksiyon hatası / bağlantı kopması:** düzeltme gönderimi başarısız olursa form girilen değeri ve gerekçeyi kaybetmemeli, Türkçe hata göstermeli (Görev 11 testi).
4. **Beklenmeyen Excel:** sayfa adı değişmiş, desteklenmeyen formül, bilinmeyen satır başvurusu varsa aktarım hücre adresiyle hata verip **hiçbir şey yazmamalı** (Görev 5 testi).
5. **Hızlı yakınlaştırma/kaydırma:** geç biten pafta detay görüntüsü yanlış yerde gösterilmemeli; görüntü, çizildiği dikdörtgene yerleşmeli ve eski istekler iptal edilmeli (Görev 14 testi).

---

## Dosya Yapısı
```
/  (repo kökü = kongremerkezi)
  package.json, tsconfig.json, vite.config.ts, vitest.config.ts, .gitignore
  firebase.json, .firebaserc, firestore.rules, firestore.indexes.json, storage.rules
  shared/      saf alan çekirdeği (tarayıcı + fonksiyon + betik ortak)
    constants.ts types.ts number.ts drawings.ts access.ts
    formula/parse.ts formula/evaluate.ts
    recompute.ts
  functions/   package.json (yalnız firebase-admin, firebase-functions, zod), src/*.ts → esbuild → lib/index.js
  scripts/     emulators.mjs, lib/admin.ts, excel/*.ts, import-excel.ts, upload-drawings.ts, bootstrap-admin.ts
  web/         index.html, src/** (React)
  tests/rules/ firestore.emu.test.ts, storage.emu.test.ts
```
Test adları: emülatör gerektirenler `*.emu.test.ts`. `npm test` → birim testler; `npm run test:emu` → `firebase emulators:exec --only auth,firestore,storage "vitest run --project emu"`.

## Veri Modeli (Firestore)
```
users/{uid}: { email, name, role: 'admin'|'kontrolcu'|'satinalma', active: boolean,
               access: { [projectId]: { [disc]: { view: boolean, drawings: boolean } } } }
projects/{p}: { name }
projects/{p}/disciplines/{d}: { name, groups: {key,title}[], summary: {label,unit,formula}[],
                                 methodText: string[], facadeNotes: string[] }
  items/{poz}       Item (doc id = poz, değişmez)
  rooms/{roomId}    Room (id = kod; tekrarlı kodlarda "GF-36~1", "GF-36~2" …)
  facade/{GD|KD|KB|GB}  { label, values: Record<FacadeColumn, number> }
  materials/{no}    Material
  findings/{no}     { no, topic, drawingsText, finding, suggestion, status: 'acik'|'iletildi'|'cozuldu' }
  drawings/{code}   { code, title, series, seriesTitle, zone, scale, paper, currentRevId }
    revisions/{revId} { label, storagePath, pageWidth, pageHeight, pageCount, uploadedAt, uploadedBy }
  history/{auto}    HistoryEntry
  comments/{auto}   { target: {type,id}, text, by: {uid,name}, at }
Storage: projects/{p}/disciplines/{d}/drawings/{code}/{revId}.pdf
```

---

### Görev 1: Ortam ve iskelet
**Dosyalar:** `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `firebase.json`, `.firebaserc`, `functions/package.json`, `scripts/emulators.mjs`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `shared/constants.ts`, `shared/constants.test.ts`
- [ ] JDK 21'i yöneticisiz kur: `https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip` (+ `.sha256sum.txt` ile doğrula) → `%LOCALAPPDATA%\Programs\jdk-21`. PATH'e ekleme.
- [ ] `git init`, `.gitignore` (Genel Kısıtlar'daki liste + `node_modules/`, `functions/lib/`, `dist/`).
- [ ] Bağımlılıkları kur. Vite kökü `web/`, `@shared` takma adı `shared/`. Vitest projeleri: `unit` (`shared/**`, `web/**`, `scripts/**`, `*.emu.test.ts` hariç), `emu` (`**/*.emu.test.ts`).
- [ ] `firebase.json`: emülatörler auth 9099, firestore 8080, storage 9199, functions 5001, ui 4000; functions kaynağı `functions/`, `predeploy` yok. `.firebaserc` varsayılanı `demo-msk`.
- [ ] `scripts/emulators.mjs`: `JAVA_HOME` (yoksa `%LOCALAPPDATA%\Programs\jdk-21*`) bulur, `PATH`'in başına `bin`'i ekler, functions'ı esbuild ile paketler, `firebase emulators:start --project demo-msk --import emulator-data --export-on-exit emulator-data` çalıştırır. `npm run emulators` bunu çağırır. `test:emu` da aynı Java ayarını kullanır.
- [ ] Test: `shared/constants.test.ts` → `expect(PROJECT_ID).toBe('msk-4199'); expect(DISCIPLINE).toBe('A')`.
- [ ] Doğrula: `npm test` geçer; `npm run emulators` → `http://127.0.0.1:4000` açılır; `npm run dev` → sayfada "MSK Metraj" yazısı.
- [ ] Commit: `chore: proje iskeleti ve emülatör ortamı`

### Görev 2: Sayı biçimi ve alan türleri
**Dosyalar:** `shared/number.ts`, `shared/types.ts`, `shared/number.test.ts`
**Üretir:**
```ts
formatTr(value: number | null, unit?: string): string        // null → "—"
parseTrNumber(text: string): number                          // geçersizde NumberParseError (Türkçe mesaj)
type Role = 'admin'|'kontrolcu'|'satinalma'
type Status = 'kontrol_edilmedi'|'kontrol_edildi'|'duzeltildi'|'sorunlu'|'yeniden_kontrol'|'kesinlesti'
type LockWarning = 'ust_kalem' | 'pafta_revizyonu' | null
type Confidence = 'Yüksek'|'Orta'|'Düşük'|null
type FacadeColumn = 'FM-01'|'FM-02/FM-03'|'FM-04'|'FM-05'|'FS-01'|'FP-01'
interface Item { id; poz; group; order: number; name; code: string|null; unit; kind: 'measured'|'derived';
  value: number|null; formula: string|null; method; sourceText; drawings: string[]; confidence: Confidence;
  status: Status; lockWarning: LockWarning; cancelled: boolean; importedValue: number|null;
  sourceFormula: string|null; updatedAt; updatedBy: {uid,name}|null }
interface Room { id; code; name; floor; zone; area: number; ceilingLower: string|null; ceilingUpper: string|null;
  ch: string|null; flooring: string|null; note: string|null; checkArea: number|null; order: number }
interface Material { id; no: number; group; name; code: string|null; usage; sourceText; unit; formula: string|null;
  value: number|null; note: string|null }
interface HistoryEntry { at; by: {uid,name}; batchId: string; target: {type:'item'|'room'|'facade'|'material'|'drawing'; id: string};
  action: HistoryAction; field: string; before: unknown; after: unknown; reason: string|null;
  cause: { type: string; id: string; action: HistoryAction } | null }
type HistoryAction = 'import'|'correct'|'formula'|'status'|'finalize'|'unlock'|'acknowledge'|'create'|'cancel'
  |'info'|'cascade'|'room'|'facade'|'material'|'revision'
STATUS_LABEL, ROLE_LABEL, ACTION_LABEL, LOCK_WARNING_LABEL: Record<…, string>
```
Etiketler: Kontrol edilmedi · Kontrol edildi · Düzeltildi · Sorunlu · Yeniden kontrol gerekli · Kesinleşti; Yönetici · Kontrolcü · Satın alma; uyarılar "Kesinleşti – üst kalem değişti", "Kesinleşti – pafta revize edildi"; işlemler Excel aktarımı · Düzeltme · Formül değişikliği · Durum değişikliği · Kesinleştirme · Kilit açma · Uyarı onayı · Yeni kalem · İptal · Bilgi değişikliği · Bağlı değişiklik · Mahal değişikliği · Cephe değişikliği · Malzeme formülü · Pafta revizyonu.
- [ ] Testler: `formatTr(2847.7,'m²')==='2.847,70'`, `formatTr(78,'adet')==='78'`, `formatTr(null)==='—'`; `parseTrNumber('1.234,56')===1234.56`, `('1234,5')===1234.5`, `('1.234')===1234`, `('12')===12`; `'2847.7'`, `'1,2,3'`, `'abc'`, `''` → hata, `'2847.7'` mesajı "Ondalık için virgül kullanın" içerir.
- [ ] Uygula, testleri geçir, commit `feat(shared): sayı biçimi ve alan türleri`.

### Görev 3: Formül dili
**Dosyalar:** `shared/formula/parse.ts`, `shared/formula/evaluate.ts`, `shared/formula/formula.test.ts`
Dil (Türk Excel'i gibi): ondalık **virgül**, argüman ayırıcı **noktalı virgül**; `+ - * /`, parantez, tekli eksi; kalem başvurusu `/[A-Z]\.\d+[a-z]?(\.\d+[a-z]?)*/` (ör. `B.1.3`, `C.1a`); fonksiyonlar `MAHAL(alan; "değer")` (alan: `kat|tavan_alt|tavan_ust|doseme` → Room `floor|ceilingLower|ceilingUpper|flooring`, alanı toplar, eşitlik büyük/küçük harf duyarsız `tr`), `CEPHE("FM-01")` (sütun toplamı). Fonksiyon adları harf duyarsız.
**Üretir:**
```ts
type Expr = {op:'num';value:number} | {op:'ref';item:string} | {op:'mahal';field:RoomField;equals:string}
  | {op:'cephe';column:FacadeColumn} | {op:'neg';arg:Expr} | {op:'add'|'sub'|'mul'|'div';left:Expr;right:Expr}
parseFormula(text: string): Expr                   // FormulaError {message, position}
formulaDeps(e: Expr): { items: string[]; rooms: boolean; facade: boolean }
isConstant(e: Expr): boolean
evaluate(e: Expr, ctx: { item(id): number|null|undefined; rooms: Room[]; facade: FacadeRow[] }): number|null
```
- [ ] Testler: `evaluate(parse('A.5 - B.1'))` = 8392.5−2847.7; `'B.1 * 2'`; `'805,5 + 1239 + 803,2'` = 2847.7 (±1e-9) ve `isConstant`; `'MAHAL(kat; "Zemin Kat")'` iki odalı örnekte doğru toplam, `"zemin kat"` da eşleşir; `'CEPHE("FM-02/FM-03")'`; `formulaDeps('C.1a * C.1b').items` = `['C.1a','C.1b']`; null kalem → sonuç null; bilinmeyen kalem → `FormulaError('Bilinmeyen kalem: X.9')`; `'2.5 * B.1'` → hata "Ondalık için virgül"; `'B.1 +'` → konumlu hata; `'MAHAL(renk; "x")'` → geçerli alanları listeleyen hata; `/ 0` → `FormulaError('Sıfıra bölme')`.
- [ ] Uygula (elle yazılmış özyinelemeli ayrıştırıcı), geçir, commit `feat(shared): formül dili`.

### Görev 4: Yeniden hesap, döngü, bağlı kalem planı, pafta başvuruları
**Dosyalar:** `shared/recompute.ts`, `shared/drawings.ts`, `shared/recompute.test.ts`, `shared/drawings.test.ts`
**Üretir:**
```ts
interface DisciplineState { items: Record<string, Item>; rooms: Record<string, Room>;
  facade: Record<string, FacadeRow>; materials: Record<string, Material> }
evaluateAll(s: DisciplineState): { items: Record<string, number|null>; materials: Record<string, number|null> }
  // measured → value; derived → topolojik sırada formül; iptal kalemler hesaplanmaz, aktif formül iptal kaleme başvurursa FormulaError('İptal edilmiş kalem: X')
  // döngüde CycleError(path) mesajı "Döngüsel bağımlılık: B.1 → B.2 → B.1"
applyRecompute(s: DisciplineState, directIds: Set<string>): DisciplineState
  // yeni değerleri yazar; değeri değişen (|Δ|>1e-9 veya null↔sayı) ve directIds'de olmayan kalemde:
  //   status kontrol_edildi|duzeltildi → yeniden_kontrol; status kesinlesti → lockWarning='ust_kalem' (değer YİNE güncellenir)
diffState(before, after): Array<{ type; id; field; before; after }>   // updatedAt/updatedBy hariç
expandDrawingRefs(text: string, known: string[]): { codes: string[]; unresolved: string[] }
```
`expandDrawingRefs` kuralları (kodlar `4199-A-DD-ZZ-SS-NNN`): `ZZ-SS-NNN`; `01…04-SS-NNN` (… = U+2026, aralık); `01/02-SS-NNN`; `ZZ-SS-100/200`; `ZZ-SS-100…400`; zonsuz `SS-NNN` → o seri/numaradaki tüm zonlar; `xxx` → serideki tüm numaralar; `Görünüşler` → tüm `-04-` paftaları; virgülle ayrılmış parçalar; sonuç `known` ile süzülür, eşleşmeyen parça `unresolved`'a.
- [ ] Testler (recompute): B.1 2847,7→3000 yapılınca B.1.1…B.1.7 = 3000, B.2 = 8392,5−3000, B.2.1 = B.2; durumu `kontrol_edildi` olan bağlı kalem `yeniden_kontrol` olur, `kontrol_edilmedi` kalır, `kesinlesti` kalır + `lockWarning='ust_kalem'` + değeri güncel; oda alanı değişince `MAHAL` kullanan A.1 ve onu izleyen F.2/F.3 değişir; malzeme `D.1 + E.2` güncellenir; `B.1 = B.2` gibi döngü → `CycleError` yolu içerir; `diffState` yalnız değişen alanları döndürür.
- [ ] Testler (drawings): `'01…04-02-100'` → 4 kod; `'01…04-02-300, 04-01-100'` → 5; `'01/02-04-100…400'` → 8; `'02-03-100/200'` → 2; `'05-100, 05-200'` → 8; `'01/02-04-xxx'` → 8; `'Görünüşler, 00-09-100'` → 9; `'Genel not 10'` → `codes=[]`, `unresolved=['Genel not 10']`.
- [ ] Uygula, geçir, commit `feat(shared): yeniden hesap ve pafta başvuruları`.

### Görev 5: Excel aktarımı ve mutabakat
**Dosyalar:** `scripts/lib/admin.ts`, `scripts/excel/read.ts`, `scripts/excel/translate.ts`, `scripts/excel/build.ts`, `scripts/excel/reconcile.ts`, `scripts/import-excel.ts`, testler `scripts/excel/*.test.ts`
**Üretir:**
```ts
initAdmin(): { db: Firestore; auth: Auth; bucket }   // emülatör env yoksa varsayılan 127.0.0.1 portlarını ayarlar; '--prod' → hata "Canlı ortam bu aşamada desteklenmiyor"
readWorkbook(path): Promise<RawBook>                  // sayfa → hücre adresi → { value, formula?, result? }; paylaşımlı formüller cell.formula ile çözülür
translateExcelFormula(f: string, ctx: { metrajRowToPoz: Map<number,string> }): string
buildImport(raw: RawBook, knownDrawings: string[]): ImportData   // items, rooms, facade, materials, findings, discipline doc
reconcile(data: ImportData, raw: RawBook): { rows: ReconRow[]; mismatches: number }
```
Çeviri kuralları: `E11`/`Metraj!E11` → satırın pozu; `Cephe!B7…G7` → `CEPHE("FM-01")…CEPHE("FP-01")` (B FM-01, C FM-02/FM-03, D FM-04, E FM-05, F FS-01, G FP-01; 7. satır dışı → hata); `SUMIF('Mahal Listesi'!$C…,"v",'Mahal Listesi'!$E…)` → `MAHAL(kat; "v")` (C kat, F tavan_alt, G tavan_ust, I doseme; toplam sütunu E değilse hata); `SUM(E82:E88)` → `H.1 + H.2 + … + H.7`; sayılar virgül ondalıklı; operatörler boşluklu; başka her şey → `ExcelTranslateError` (formül + hücre adresi). Yalnız sabitli formül (B.1) → `measured`, Excel formülü `sourceFormula`'da. Değeri formülsüz sabit olan malzeme #25 → bağlantı tablosu `{25: 'C.9'}`. `—` birim/güven → null. Satır düzeni dökümle aynı: Metraj 3–94 (grup başlığı `^[A-I]\. `), Mahal 3–56, Cephe 3–6, Malzeme 3–61, Proje Kontrol 3–15, Özet 5–18, Yöntem A2–A12.
Mutabakat: her kalem (E), malzeme (H), Özet (C), Cephe toplamları (7. satır, H sütunu), Mahal toplamı (E57) bizim hesapla karşılaştırılır, tolerans 1e-6. Rapor `scripts/out/mutabakat.md`; çözülemeyen pafta başvuruları uyarı olarak listelenir. Uyuşmazlık > 0 → çıkış kodu 1 ve **hiçbir şey yazılmaz**. `--reset` disiplin alt koleksiyonlarını (drawings hariç) siler. Her kalem için `import` geçmiş kaydı; tümü `kontrol_edilmedi`.
- [ ] Testler: çeviri kurallarının her biri (yukarıdaki örneklerle); `VLOOKUP(...)` ve `E96` → hata; ExcelJS ile testte üretilen küçük kitap (Metraj 4 satır + paylaşımlı formül + Mahal 2 satır + Cephe) → `buildImport` doğru tür/formül; `reconcile` bilerek bozulan sonuçta `mismatches=1`; eksik "Metraj" sayfası → aktarım hata verir, yazma fonksiyonu çağrılmaz.
- [ ] Gerçek dosyayla çalıştır: `npm run import -- --file "Projeler/261102_4199_MSK-Kesin Proje Teslim/MSK Kongre Merkezi – Malzeme Listesi ve Metraj.xlsx" --reset` → `mismatches: 0`; emülatör arayüzünde 83 kalem, 54 mahal, 59 malzeme, 13 bulgu.
- [ ] Commit `feat(scripts): Excel aktarımı ve mutabakat`.

### Görev 6: Güvenlik kuralları ve ilk yönetici
**Dosyalar:** `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `scripts/bootstrap-admin.ts`, `tests/rules/firestore.emu.test.ts`, `tests/rules/storage.emu.test.ts`
Kurallar: kullanıcı dokümanı yok ya da `active != true` → her şey red. `users/{uid}` okuma: kendisi veya admin; yazma yok. Disiplin altı okuma: `access[p][d].view`; `drawings/**` okuma ek olarak `.drawings`. Yazma yok; istisnalar: `comments` oluşturma (view, `by.uid == auth.uid`, `at == request.time`, metin 1–2000), `findings` oluşturma/güncelleme (admin|kontrolcu, durum değerleri listede, oluşturmada doküman yoksa). Storage okuma: `firestore.get(users/uid)` ile active + drawings; yazma: admin, `application/pdf`, < 100 MB. Dizin: `history` için `target.type, target.id, at desc`.
`bootstrap-admin.ts --email --name --password`: Auth kullanıcısı + `users` dokümanı (admin, msk-4199/A view+drawings).
- [ ] Testler: satın alma rolü kalemi okur, `drawings` ve PDF'i okuyamaz; kullanıcı dokümanı olmayan giriş yapmış kullanıcı hiçbir şey okuyamaz; kalem doğrudan yazma herkes için red; yorum başka uid adına red; **erişim kaldırılınca aynı oturumda PDF okuma red** (İnceleme Odağı 2); pasif kullanıcı red.
- [ ] Geçir, commit `feat: güvenlik kuralları ve ilk yönetici betiği`.

### Görev 7: Fonksiyon çekirdeği, düzeltme ve formül
**Dosyalar:** `functions/src/context.ts`, `functions/src/commit.ts`, `functions/src/items.ts`, `functions/src/schemas.ts`, `functions/src/index.ts`, `functions/src/test/seed.ts`, `functions/src/items.emu.test.ts`
**Üretir:**
```ts
loadCaller(db, uid, p, d): Promise<Caller>          // {uid,name,role}; yoksa/pasif/erişimsiz → HttpsError('permission-denied','Bu işlem için yetkiniz yok.')
commitChange(db, caller, p, d, meta: {action: HistoryAction; target:{type,id}; reason: string|null},
             mutate: (draft: DisciplineState) => void): Promise<{ batchId: string; changed: number }>
  // transaction: tüm durumu oku → mutate → applyRecompute(directIds = target) → diffState → dokümanları güncelle (updatedAt/By)
  // → her fark için history: hedefe ait farklar meta.action + reason, diğerleri 'cascade' + cause; CycleError/FormulaError → 'failed-precondition'
correctItem(db, caller, {itemId, value: number, confidence?: Confidence, reason}): Promise<Result>
setItemFormula(db, caller, {itemId, formula, reason}): Promise<Result>
```
Kurallar: rol admin|kontrolcu; gerekçe boş olamaz ("Gerekçe zorunludur."); kesinleşmiş kalem → "Kalem kesinleşmiş; önce kilidi açın."; iptal kalem → red; değer ≥ 0. Türetilen kaleme `correctItem` → `kind='measured'`, `formula=null`, geçmişte formül alanının eski değeri görünür (bağ koptu). Her iki işlem `status='duzeltildi'`. `setItemFormula`: ayrıştırma, bilinmeyen/iptal kalem, döngü → hata; `kind='derived'`. Callable'lar `onCall({region:'europe-west1'})`, girdiler zod ile doğrulanır, adlar: `correctItem`, `setItemFormula`.
- [ ] Testler (emülatör, tohum: A.5, B.1, B.2=`A.5 - B.1`, B.2.1=`B.2`, malzeme #1=`B.2`, üç rol): B.1 düzeltmesi → B.2, B.2.1, #1 güncel, geçmişte 1 `correct` + bağlı `cascade` kayıtları; satın alma → permission-denied; boş gerekçe → hata; kesinleşmiş kalem → hata; döngü formülü → hata ve hiçbir doküman değişmez; **eşzamanlı** `correctItem(B.1)` ve `correctItem(A.5)` → sonunda B.2 = A.5 − B.1 (İnceleme Odağı 1).
- [ ] Geçir, commit `feat(functions): değişiklik çekirdeği, düzeltme ve formül`.

### Görev 8: Diğer metraj işlemleri
**Dosyalar:** `functions/src/items.ts`, `functions/src/sources.ts`, `functions/src/index.ts`, `functions/src/*.emu.test.ts`
**Üretir (callable adlarıyla aynı):**
```ts
setItemStatus({itemId, status: 'kontrol_edildi'|'sorunlu'|'yeniden_kontrol'|'kontrol_edilmedi', note?})  // sorunlu → not zorunlu
finalizeItem({itemId})              // admin; status kontrol_edildi|duzeltildi ve value != null
unlockItem({itemId, reason})        // admin; → yeniden_kontrol, lockWarning=null
acknowledgeItem({itemId, note?})    // admin; lockWarning != null olmalı; → null
createItem({poz, group, name, unit, code?, kind, value?, formula?, method?, drawings?, reason})
                                    // poz deseni + tekil; order = gruptaki en büyük + 0.001
cancelItem({itemId, reason})        // aktif bir formül başvuruyorsa "Bu kaleme bağlı kalemler var: B.2, …"
updateItemInfo({itemId, name?, code?, unit?, method?, confidence?, drawings?, reason?})
updateRoom({roomId, area?, floor?, ceilingLower?, ceilingUpper?, ch?, flooring?, note?, reason})
updateFacadeCell({rowId, column, value, reason})
setMaterialFormula({materialId, formula|null, reason})
```
Kesinleşmiş kalemde `setItemStatus`/`updateItemInfo`/`cancelItem` reddedilir.
- [ ] Testler: her işlemin mutlu yolu ve yetki reddi; kesinleşmiş kalem değişikliği reddi; bağımlısı olan kalemi iptal → bağımlıları listeleyen hata; aynı pozla `createItem` → hata; mahal alanı değişince A.1 → F.2 zinciri güncellenir ve `room` + `cascade` geçmişi yazılır; kesinleşmiş türetilen kalemin üst kalemi değişince değeri güncellenir ve `lockWarning='ust_kalem'`; `acknowledgeItem` uyarıyı temizler.
- [ ] Geçir, commit `feat(functions): durum, kesinleştirme ve kaynak değişiklikleri`.

### Görev 9: Web altyapısı – bağlantı, giriş, kabuk
**Dosyalar:** `web/src/firebase.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/auth/LoginPage.tsx`, `web/src/layout/Shell.tsx`, `web/src/data/hooks.ts`, `web/src/data/api.ts`, `web/src/styles.css`, `web/.env.development`, testler
**Üretir:**
```ts
useAuth(): { user: User|null; profile: UserProfile|null; loading: boolean }
useCollection<T>(path: string, ...constraints): { data: T[]; loading; error }
useItems(), useRooms(), useFacade(), useMaterials(), useFindings(), useDrawings(), useDiscipline()
useHistory(target), useComments(target)
api.<callableAdı>(input): Promise<Result>     // httpsCallable sarmalayıcı; hata mesajını Türkçe Error olarak fırlatır
can(profile, 'edit'|'admin'|'drawings'): boolean     // shared/access.ts
```
`VITE_USE_EMULATORS=true` iken tüm emülatörlere bağlanır. Giriş: e-posta + şifre, kayıt ekranı yok. Profil yok/pasif → "Hesabınız etkin değil. Yöneticiye başvurun." Üst menü: Metraj · Malzeme Listesi · Mahal Listesi · Cephe · Proje Kontrol · Paftalar · Özet · Yöntem · Kullanıcılar (yalnız admin) · Excel çıktısı · Çıkış.
- [ ] Testler: `can` rol tablosu; Shell'de satın alma rolü "Kullanıcılar"ı görmez; LoginPage hatalı şifrede "E-posta veya şifre hatalı." gösterir (auth modülü taklit edilerek).
- [ ] Doğrula: emülatörde `bootstrap-admin` ile oluşturulan kullanıcıyla giriş → menü görünür. Commit `feat(web): giriş ve uygulama kabuğu`.

### Görev 10: Metraj sayfası – liste ve detay
**Dosyalar:** `web/src/metraj/MetrajPage.tsx`, `ItemList.tsx`, `filter.ts`, `ItemDetail.tsx`, `HistoryList.tsx`, `web/src/common/Comments.tsx`, testler
Üç bölmeli düzen (spec 6.1): sol ağaç (grup başlıkları katlanır, durum simgesi ○ ✓ ✎ ⚠ ↻ 🔒, uyarılı kilitte 🔒!), orta görüntüleyici yeri (Görev 14'e kadar "Pafta seçin"), sağ detay: poz, ad, kod, birim, miktar (`formatTr`), Excel'deki değer farklıysa gösterilir, tür + formül, yöntem, kaynak metni + pafta kodları, güven, durum + uyarı, sekmeler Geçmiş · Yorumlar. İptal kalemler varsayılan gizli.
**Üretir:** `filterItems(items, f: {text?, group?, confidence?, status?, drawing?, unmeasurable?, showCancelled?}): Item[]`; `<Comments target={{type,id}} />`.
- [ ] Testler: `filterItems` her ölçüt (ölçülemedi = measured && value null && !cancelled; metin poz/ad/kodda arar, harf duyarsız `tr`); HistoryList bağlı değişiklik kaydında "Bağlı değişiklik – B.1 düzeltmesi" yazar.
- [ ] Commit `feat(web): metraj listesi ve kalem detayı`.

### Görev 11: Metraj işlemleri arayüzü
**Dosyalar:** `web/src/metraj/CorrectionForm.tsx`, `FormulaForm.tsx`, `StatusActions.tsx`, `NewItemForm.tsx`, testler
Düzeltme (yeni miktar `parseTrNumber`, gerekçe, isteğe bağlı güven; türetilen kalemde "Formül bağı kopacak" uyarısı), formül (canlı ayrıştırma hatası + önizleme değeri `evaluate` ile), durum düğmeleri (rol ve duruma göre: Kontrol edildi · Sorunlu · Yeniden kontrol · Kesinleştir · Kilidi aç · Uyarıyı onayla), yeni kalem, iptal. Kesinleşmiş kalemde düzenleme denetimleri kapalı.
- [ ] Testler: gerekçesiz gönder düğmesi pasif; `'2847.7'` girilince Türkçe uyarı; formül alanına `B.1 +` → konumlu hata, gönderilemez; **api hatası (ör. ağ) olunca form değeri ve gerekçe korunur, hata mesajı görünür** (İnceleme Odağı 3); satın alma rolünde form görünmez.
- [ ] Doğrula: emülatörde B.1 düzelt → B.2 ve bağlılar ekranda güncellenir, geçmişte görünür. Commit `feat(web): metraj düzeltme ve kesinleştirme`.

### Görev 12: Diğer sayfalar
**Dosyalar:** `web/src/pages/MaterialsPage.tsx`, `RoomsPage.tsx`, `FacadePage.tsx`, `FindingsPage.tsx`, `SummaryPage.tsx`, `MethodPage.tsx`, `shared/material.ts`, testler
**Üretir:** `materialStatus(m, itemsById): { label: string; finalized: number; total: number }` → bağlı kalem yok veya değer null: "Ölçülemedi"; hepsi kesin ve uyarısız: "Kesin"; diğer: "`x/y` kesin". `facadeTotals(rows): Record<FacadeColumn|'total', number>`.
Malzeme: tablo + formül düzenleme (`setMaterialFormula`) + metraj durumu. Mahal ve Cephe: hücre düzenleme → gerekçe penceresi → `updateRoom`/`updateFacadeCell`; Cephe toplam satırı hesaplanır. Proje Kontrol: durum seçimi (Açık · Mimara iletildi · Çözüldü), yeni bulgu, yorumlar. Özet: `summary` formülleri + durum bazında kalem sayıları (kaç kalem kontrol edildi/kesinleşti). Yöntem: metin.
- [ ] Testler: `materialStatus` üç durum; `facadeTotals` Excel değerleri (FM-01 = 1.219,5, toplam 2.894,7); Özet "Alüminyum panel cephe" = 1.824 (aktarılan veriyle).
- [ ] Commit `feat(web): malzeme, mahal, cephe, proje kontrol, özet sayfaları`.

### Görev 13: Pafta yükleme ve Paftalar sayfası
**Dosyalar:** `scripts/upload-drawings.ts`, `scripts/register.ts`, `web/src/pages/DrawingsPage.tsx`, testler
`register.ts`: `parseRegister(raw): DrawingMeta[]` — "DD_KESİN PROJE" sayfası, seri başlığı satırları (`01 VAZIYET PLANI` …) ve pafta satırları (ad, kod, ölçek, kağıt); zone koddan.
`upload-drawings.ts --dir <PDF> --register <xlsx>`: her pafta için PDF'i pdfjs-dist (legacy) ile açıp sayfa boyutu (pt, ölçek 1) ve sayfa sayısını okur (>1 ise uyarı), `r0` revizyonu ("DD 02.11.2026") olarak Storage'a yükler, `drawings` + `revisions` dokümanlarını yazar. Register'da olup PDF'i olmayan / tersi → rapor.
- [ ] Testler: `parseRegister` sentetik kitapta seri ve zone'u doğru çıkarır; 40 satır beklentisi gerçek dosya çalıştırmasında doğrulanır.
- [ ] Gerçek çalıştırma: 40 pafta yüklendi, eksik 0. Paftalar sayfası seri bazında liste (kod, ad, ölçek, güncel revizyon) gösterir; pafta yetkisi olmayana "Pafta görme yetkiniz yok".
- [ ] Commit `feat: pafta yükleme ve pafta listesi`.

### Görev 14: Pafta görüntüleyici
**Dosyalar:** `web/src/viewer/viewport.ts`, `pdf.ts`, `SheetViewer.ts`, `SheetViewerView.tsx`, `web/src/viewer/viewport.test.ts`, `web/src/no-download-url.test.ts`
**Üretir:**
```ts
// Dünya koordinatı = pdf.js viewport (ölçek 1) noktası, orijin sol üst, y aşağı; three.js'te (x, -y). 1b geometrisi aynı sistemi kullanır.
fitView(pageW, pageH, viewW, viewH): { zoom: number; cx: number; cy: number }
visibleRect(cam: {cx, cy, zoom}, viewW, viewH, pageW, pageH, pad = 0.1): Rect | null   // sayfaya kırpılmış
detailScale(rect: Rect, viewW: number, visibleWorldW: number, dpr: number, maxPx = 4096): number
class SheetViewer { constructor(el: HTMLElement); load(pdf: ArrayBuffer): Promise<{width,height}>;
  setOverlay(pdf: ArrayBuffer | null, opacity: number): Promise<void>; fit(): void; dispose(): void }
loadDrawingPdf(code: string, revId: string): Promise<ArrayBuffer>   // Storage getBytes, bellek önbelleği (6 öğe)
```
Taban doku: tüm sayfa, uzun kenar 4096 px. Detay: kontroller durduktan 200 ms sonra görünür dikdörtgen `detailScale` ile ayrı tuvale çizilir ve **çizildiği dikdörtgene** düzlem olarak konur; yeni istekte eski `RenderTask.cancel()`, istek no'su güncel değilse sonuç atılır. MapControls: dönme kapalı, `screenSpacePanning`, `zoomToCursor`, min zoom = sığdır, maks = sığdır × 60. Metraj'da kalem seçilince ilk paftası açılır; birden çok pafta varsa seçici; pafta yetkisi yoksa mesaj. "3D" sekmesi devre dışı ("Aşama 2").
- [ ] Testler: `fitView(2384,1684,1200,800)` sayfa tam sığar ve ortalanır; `visibleRect` sayfa dışını kırpar, tamamen dışarıdaysa null; `detailScale` 4096 px sınırını aşmaz; geç gelen detay sonucu (eski istek no) atılır (SheetViewer'ın istek sayacı saf yardımcıya ayrılarak test edilir) (İnceleme Odağı 5); `web/src` içinde `getDownloadURL` geçmez.
- [ ] Doğrula (gerçek uygulama): 01-02-300 çatı planında en yakın zoom'da ölçü yazıları okunur; hızlı kaydırmada görüntü kaymaz. Commit `feat(web): three.js pafta görüntüleyici`.

### Görev 15: Pafta revizyonları
**Dosyalar:** `functions/src/drawings.ts`, `functions/src/drawings.emu.test.ts`, `web/src/pages/RevisionUpload.tsx`, `web/src/viewer/RevisionPicker.tsx`
**Üretir:**
```ts
registerRevision({drawingId, revId, label, pageWidth, pageHeight, pageCount})   // admin; Storage nesnesi var mı kontrol;
   // revision dokümanı + currentRevId; drawings[] içinde bu kod olan kalemler: kontrol_edildi|duzeltildi → yeniden_kontrol,
   // kesinlesti → lockWarning='pafta_revizyonu'; commitChange ile 'revision' geçmişi, gerekçe "Pafta revize edildi: <kod> <etiket>"
createDrawing({code, title, series, seriesTitle, zone, scale, paper})            // admin; kod deseni + tekil
```
İstemci: admin PDF seçer → pdf.js ile sayfa boyutu → `revId = crypto.randomUUID()` → Storage'a yükle → `registerRevision`. Görüntüleyicide revizyon seçici (eski revizyonlar açılabilir) ve "Karşılaştır": ikinci revizyon %50 saydam üst katman (`setOverlay`).
- [ ] Testler: revizyon sonrası bağlı kalem durumları ve geçmiş; Storage'da dosya yoksa hata; admin dışı red.
- [ ] Commit `feat: pafta revizyonları ve karşılaştırma`.

### Görev 16: Kullanıcı yönetimi
**Dosyalar:** `functions/src/users.ts`, `functions/src/users.emu.test.ts`, `web/src/pages/UsersPage.tsx`
**Üretir:**
```ts
inviteUser({email, name, role, access}): { uid, resetLink }   // admin; Auth kullanıcısı (rastgele şifre) + users dokümanı + generatePasswordResetLink
updateUser({uid, role?, access?, active?})                     // active=false → Auth disabled + revokeRefreshTokens
```
Kendi yönetici rolünü kaldırma / kendini pasifleştirme → "Kendi yönetici yetkinizi kaldıramazsınız." Var olan e-posta → "Bu e-posta ile kullanıcı zaten var." Sayfa: liste, davet formu (rol + Mimari: görüntüle / paftalar), şifre bağlantısını kopyala, düzenle, pasifleştir.
- [ ] Testler: davet akışı, yinelenen e-posta, kendini kilitleme reddi, admin dışı red.
- [ ] Commit `feat: kullanıcı davet ve yetki yönetimi`.

### Görev 17: Excel çıktısı
**Dosyalar:** `web/src/export/excel.ts`, `web/src/export/excel.test.ts`, `web/src/pages/ExportPage.tsx`
**Üretir:** `buildPurchaseWorkbook(d: ExportData): Promise<ArrayBuffer>`, `buildFullWorkbook(d: ExportData): Promise<ArrayBuffer>` (ExcelJS dinamik import).
Satın alma: No · Grup · Malzeme · Proje Kodu · Kullanım Yeri · Birim · Miktar · Bağlı Kalemler · Metraj Durumu (`materialStatus`) · Son Değişiklik · Not. Tam metraj: Özet, Metraj (Poz · İş Kalemi · Proje Kodu · Birim · Miktar · Formül · Hesap Yöntemi · Kaynak Pafta · Güven · Durum · Son Değişiklik), Malzeme Listesi, Mahal Listesi, Cephe, Proje Kontrol. Sayılar sayısal hücre, `#,##0.00` (adet `#,##0`). Dosya adları `MSK-4199_Satinalma_Malzeme_YYYY-MM-DD.xlsx`, `MSK-4199_Metraj_YYYY-MM-DD.xlsx`.
- [ ] Testler: üretilen kitap geri okunur; sayfa adları, başlık satırı, #39 miktarı 574,19 ve durum metni doğru.
- [ ] Commit `feat(web): Excel çıktısı`.

### Görev 18: Kabul turu ve çalıştırma kılavuzu
**Dosyalar:** `README.md` (Türkçe)
- [ ] README: kurulum (Node, JDK yöneticisiz), `npm run emulators`, ilk yönetici, Excel aktarımı, pafta yükleme, `npm run dev`, testler. Emülatör verisinin yalnız deneme için olduğu, canlıya ayrı aktarılacağı uyarısı.
- [ ] Uçtan uca elle kabul (emülatörde): yönetici girişi → kontrolcü davet → kontrolcü B.1'i düzeltir → B.2 zinciri ve malzemeler güncellenir, geçmişte görünür → yönetici kesinleştirir → üst kalem değişince uyarı → satın alma kullanıcısı paftaları göremez, Excel çıktısı alır → 01-02-300 için yeni revizyon yüklenir → bağlı kalemler "Yeniden kontrol gerekli".
- [ ] `npm test` ve `npm run test:emu` tamamen geçer. Commit `docs: çalıştırma kılavuzu`.
