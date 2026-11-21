# MSK Kongre Merkezi – Metraj ve Malzeme Web Uygulaması · Tasarım

Tarih: 21.11.2026 · Proje: 4199 Mustafa Sak Kongre Merkezi, Kesin Proje (DD), yayın 02.11.2026

İşaretler: **[K]** = Koray'ın verdiği karar · **[Ö]** = tasarımcının önerisi / kararı (itiraz edilmedi, düzeltilebilir)

---

## 1. Amaç ve neden

Mimari paftalardan çıkarılmış ön metraj (`Projeler/261102_4199_MSK-Kesin Proje Teslim/MSK Kongre Merkezi – Malzeme Listesi ve Metraj.xlsx`) **satın alma** için kullanılacak. [K] Satın alma öncesi her miktarın projeye karşı **yeniden kontrol edilmesi** gerekiyor; Koray kalemleri tek tek açıp ilgili paftada nereden ölçüldüğünü görerek doğrulayacak. [K] Malzemelere daha sonra **spec (şartname bilgisi)** tanımlanacak. [K]

Bunun için tüm metraj, malzeme, spec ve kontrol bilgisinin tek yerde durduğu, paftaları ve 3D modeli **three.js** ile gösteren bir web uygulaması yapılacak. [K]

İş sırası [K]: **(1) metrajı kesinleştirmek → (2) ürün özelliklerini (spec) belirleyip tanımlamak → (3) ürün/tedarikçi araştırması → (4) satın alma sürecini başlatmak ve malzemeyi zamanında almak.** Uygulama bu sırayı izler ve her malzemenin bu yolda nerede olduğunu gösterir.

Başarı: Satın almaya giden her miktar için "bu sayı hangi paftada, hangi bölgeden, kim kontrol etti, değiştiyse kim, neden" sorusu uygulamadan cevaplanabiliyor; satın alma birimi kontrol edilmiş listeyi ve spec'leri uygulamadan alabiliyor.

## 2. Kapsam

### Hedefler (bu proje)
- Yalnız **Kongre Merkezi**, yalnız **mimari** disiplin. [K]
- Excel'deki tüm sayfaların (Metraj, Malzeme Listesi, Mahal Listesi, Cephe, Proje Kontrol, Yöntem) uygulamaya aktarılması.
- Her metraj kalemi için: miktar, hesap yöntemi, kaynak pafta(lar), güven seviyesi, **kontrol durumu**, düzeltme + **değişiklik geçmişi**, yorumlar.
- **Pafta görüntüleyici** (three.js): kaleme tıklayınca kaynak pafta açılır, ölçülen bölge pafta üzerinde işaretli görünür. Metraj kesinleştirmeyle birlikte **ilk** gelir. [K]
- **3D kütle modeli** (three.js): kaleme tıklayınca modelde ilgili kısım vurgulanır. **İkinci** sırada. [K]
- Metraj kalemlerinin **kesinleştirilmesi** (kilit). [Ö]
- Her malzemeye **spec** girilebilmesi.
- Her malzemede **ilerleme göstergesi** (Metraj kesin → Spec onaylı → Araştırmada → Satın alındı) ve **ihtiyaç tarihi**. [Ö]
- Kullanıcı girişi, roller, **disiplin bazında erişim** – kimin neyi göreceğini Yönetici (Koray) seçer. [K]
- Satın alma için **Excel çıktısı**. Excel yalnız sonuçları indirme seçeneğidir; kontrol ve düzeltme yalnız uygulamada yapılır. [K]
- Paftada **basit çizim**: kullanıcı ölçüm bölgesini (poligon / çizgi / nokta) çizip düzenleyebilir. [K: seçenek b]
- **Revize paftalar** uygulamaya yüklenebilir; pafta revizyonları izlenir. [K]

### Kapsam dışı (şimdi yapılmayacak, ama veri yapısı önünü kapatmayacak)
- Mekanik, elektrik, yangın, aydınlatma disiplinleri – ileride eklenecek. [K]
- Araştırma ve satın alma modülü (tedarikçi, teklif, tedarik süresi, sipariş, teslimat) – yol haritasında Aşama 4; **ayrıca tasarlanacak**. Bu dokümanda yalnız onun dayanacağı veriler (kesin miktar, onaylı spec, ihtiyaç tarihi, malzeme ilerleme durumu) kurulur. [K]
- Başka projeler – belki ileride. [K]
- Birim fiyat / maliyet hesabı.
- Mobil / tablet kullanımı (masaüstü tarayıcı yeterli). [Ö]

### Kesinlikle olmaması gerekenler (çalışsa bile başarısızlık sayılır)
- Bir miktarın **izsiz** değişmesi (eski değer, kim, ne zaman, gerekçe olmadan).
- Bir kalem düzeltildiğinde ona bağlı kalemlerin (ör. B.1 → B.1.1…B.1.7, B.2 = A.5 − B.1) **eski değerde kalması**.
- Pafta erişim yetkisinin yalnız ekranda gizlemeyle uygulanması; yetkisiz kullanıcının dosyaya doğrudan adresle ulaşabilmesi.
- Uygulamaya aktarılan sayıların Excel'deki sayılarla **uyuşmaması** (aktarım sonrası birebir mutabakat şart).
- Pafta üzerindeki ölçüm işaretinin pafta çizgisine **oturmaması** (kaydırılmış/ölçeksiz bölge, kontrolü anlamsız kılar).
- 3D modelden miktar hesaplanması – model yalnız gösterim içindir, metrajın kaynağı değildir. [Ö]

## 3. Kullanıcılar ve yetkiler

Roller [Ö]:
| Rol | Yapabildikleri |
|---|---|
| **Yönetici** (Koray) | Her şey; kullanıcı davet etme; rol ve disiplin/pafta erişimi atama |
| **Kontrolcü** | Miktar düzeltme (gerekçe zorunlu), kontrol durumu değiştirme, spec yazma, yorum |
| **Satın alma** | Görüntüleme, yorum, Excel çıktısı |

Erişim [K: Yönetici seçer]: her kullanıcı için **hangi disiplinleri** görebileceği ve o disiplinde **paftaları görme** yetkisinin olup olmadığı ayrı ayrı atanır. Örnek: Satın alma metrajı, malzemeyi, 3D modeli görür; paftaları görmez. Yetkiler Firebase güvenlik kurallarıyla sunucu tarafında uygulanır.

Giriş: e-posta + şifre, yalnız Yöneticinin davet ettiği kullanıcılar; kendi kendine kayıt yok. [Ö]

## 4. Kısıtlar
- Platform **Firebase**: Auth, Firestore, Cloud Storage, Hosting. Koray'ın kendi hesabı. [K]
- Cloud Storage için hesabın **Blaze** (kullandıkça öde) planına alınması gerekir. 40 PDF ≈ 47 MB; maliyet ihmal edilebilir. Kart tanımı Koray'da.
- Paftalar (şirket dokümanı) Google bulutunda duracak; hesabın kurumsal kullanıma uygunluğu Koray'ın sorumluluğunda (kendisine iletildi).
- Geliştirme makinesi: Windows 11. **Node.js kurulu değil** → Node.js LTS kurulumu gerekir (Firebase CLI ve derleme için). Python yok. .NET yalnız runtime. **AutoCAD 2027** ve DWG TrueView kurulu (DWG okumak gerekirse).
- Arayüz dili **Türkçe**; sayı biçimi Türkçe (1.234,56). [Ö]
- Kaynak veriler: 40 PDF + 40 DWG pafta (`PDF/`, `DWG/`), pafta listesi (`Drawing Register.xlsx`), metraj Excel'i.

## 5. Yaklaşımlar

**Platform**
| Seçenek | Artı | Eksi | Sonuç |
|---|---|---|---|
| Yalnız claude.ai'da paylaşılan sayfa | Kurulumsuz, ortak veri | Şirket dokümanı dışarıda; Koray istemedi | Reddedildi [K] |
| .NET (ASP.NET Core) + SQLite, şirket sunucusu | Kurumsal Windows'a uygun | Sunucu/IT gerekir, SDK kurulumu | Önerilmişti, seçilmedi |
| Node + React + SQLite, şirket sunucusu | Zengin arayüz ekosistemi | Sunucu/IT gerekir | Seçilmedi |
| **Firebase** (sunucusuz) | Hesap hazır; giriş, veri, dosya, yayın tek yerde; sunucu yazmak gerekmez | Veri Google bulutunda; Storage için Blaze | **Seçildi [K]** |

**Görsel merkez**
| Seçenek | Sonuç |
|---|---|
| A – Yalnız 3D kütle modeli | Doğrulama için yine pafta gerekir |
| B – Yalnız pafta görüntüleyici | 3D isteğini karşılamaz |
| **C – İkisi birden** | **Seçildi [K]**. Sıra: önce metraj + pafta görüntüleyici, sonra 3D model. |

**Asıl kaynak** [Ö]: Excel bir kez içe aktarılır; sonrasında **uygulama asıl kaynaktır**. Düzeltmeler uygulamada, geçmişiyle yapılır; Excel uygulamadan dışa aktarılır. (Alternatif "Excel asıl, uygulama yalnız gösterir" çok kullanıcılı izlenebilirliği kaybettirdiği için önerilmedi.)

## 6. Uygulama – parçalar

### 6.1 Ekran düzeni [Ö]
```
┌─ Kalemler ─────┬─ Görüntüleyici (three.js) ─┬─ Detay ────────────┐
│ [ara] [filtre] │  [Pafta | 3D]  sekmesi     │ B.1 Uzay kafes     │
│ ▸ A. GENEL     │                            │ 2.847,70 m²  ●Orta │
│ ▾ B. ÇATI      │  pafta; ölçülen bölge      │ Yöntem: …          │
│   B.1  ✓       │  renkli poligon            │ Paftalar: 01…04-   │
│   B.1.1 ○      │                            │   02-300, 04-01-100│
│ ▸ C. CEPHE     │  pafta seçici: 01-02-300 ▾ │ Durum: Kontrol ed. │
│ …              │                            │ Spec · Yorum · Geç.│
└────────────────┴────────────────────────────┴────────────────────┘
```
Üst menü: Metraj · Malzeme Listesi · Mahal Listesi · Cephe · Proje Kontrol · Paftalar · (Yönetici) Kullanıcılar · Excel çıktısı.
Filtreler: grup, güven seviyesi, kontrol durumu, pafta, "ölçülemedi" kalemleri.

### 6.2 Metraj kalemleri
- Excel'deki tüm alanlar: poz, iş kalemi, proje kodu, birim, miktar, hesap yöntemi, kaynak pafta, güven.
- **Kalem türü** [Ö]: *ölçülen* (değer doğrudan girilir: ör. A.3, E.1) veya *türetilen* (başka kalemlerden/mahal toplamlarından hesaplanır: ör. A.1 = Zemin Kat mahal alanları toplamı, B.2 = A.5 − B.1, B.1.1 = B.1, C.1 = C.1a × C.1b, H.8 = H.1…H.7 toplamı). Excel'deki formül ilişkileri uygulamaya taşınır; bir kalem değişince bağlı kalemler otomatik güncellenir ve geçmişe "bağlı değişiklik" olarak yazılır.
- Boş miktarlı "ölçülemedi" kalemleri (B.4, D.7, E.8, F.9, F.11) listede kalır, ayrıca işaretlenir.
- **Kontrol durumu** [Ö]: Kontrol edilmedi · Kontrol edildi · Düzeltildi · Sorunlu · Yeniden kontrol gerekli · **Kesinleşti**. İlk durum tümü için "Kontrol edilmedi".
- **Kesinleştirme** [Ö]: Yönetici, kontrolü biten kalemi "Kesinleşti" olarak kilitler. Kilitli kalemde miktar, formül veya geometri değişikliği önce kilidin gerekçeyle açılmasını gerektirir. Kesinleşmiş bir kalemin bağlı olduğu üst kalem değişirse kilit kendiliğinden kalkmaz; kalem "Kesinleşti – üst kalem değişti" uyarısıyla işaretlenir ve Yöneticiye görünür.
- **Yeniden kontrol** [Ö]: bir kalemin değeri değişince ona bağlı, daha önce "Kontrol edildi"/"Düzeltildi" olan kalemler otomatik "Yeniden kontrol gerekli" olur. Bir pafta revize edildiğinde o paftaya bağlı tüm kalemler de aynı duruma düşer (bkz. 6.8).
- **Düzeltme** (Yönetici, Kontrolcü): yeni değer + zorunlu gerekçe; kim/ne zaman/eski/yeni kayıt altına alınır. Güven seviyesi de değiştirilebilir. İkinci kişi onayı aranmaz (gerekirse sonra eklenir). [Ö]
- **Formül düzenleme** (Yönetici, Kontrolcü) [Ö]: türetilen kalemin formülü değiştirilebilir – çarpan (ör. B.1.3 çimento levha × 2 kat, malzeme #23 × 3 kat), birim dönüşümü (ör. B.3 parapet: uzunluk × açınım genişliği → m²), yeni bağımlılık. Döngüsel bağımlılık engellenir. Türetilen bir kaleme elle sabit değer verilebilir; bu durumda kalem "ölçülen"e döner, bağı koptuğu açıkça gösterilir ve gerekçe zorunludur. Formül değişiklikleri de geçmişe yazılır.
- **Kalem ekleme / silme** (Yönetici, Kontrolcü) [Ö]: yeni kalem eklenebilir (ör. F.2'nin ID projesiyle bölünmesi, statik projeden gelecek tonaj kalemleri). Silme yerine "iptal" – kalem geçmişiyle saklanır.
- Yorumlar: kalem başına serbest metin, kullanıcı adı ve tarihle.

### 6.3 Malzemeler ve spec
- Malzeme Listesi'ndeki 59 malzeme; her biri bir veya birden fazla metraj kalemine bağlı (Excel'deki bağlantılar korunur, ör. #39 C-G01 = D.1 + E.2).
- Malzemenin miktarı bağlı kalemlerden gelir; ayrıca girilmez.
- **Spec** [Ö]: spec yapısı henüz belli olmadığı için esnek kurulur – ortak alanlar (ürün tipi, marka/model, ebat/kalınlık, renk/RAL, standart, performans değerleri, not) + serbest ek alanlar + teknik föy eki (PDF, Storage'da). Spec'in "taslak / onaylı" durumu olur.
- **İlerleme göstergesi** [Ö]: her malzeme için *Metraj kesin* (bağlı tüm kalemler Kesinleşti) → *Spec onaylı* → *Araştırmada* → *Satın alındı*. İlk iki adım verilerden otomatik çıkar; son ikisi Aşama 4 gelene kadar elle işaretlenir. Malzeme Listesi bu göstergeye göre filtrelenip sıralanabilir.
- **İhtiyaç tarihi** [Ö]: her malzemeye sahada gerekli olduğu tarih girilebilir (Yönetici). Liste ihtiyaç tarihine göre sıralanır; tarihi yaklaşan ama metrajı/spec'i kesinleşmemiş malzemeler öne çıkarılır.

### 6.4 Diğer sayfalar
- **Mahal Listesi**: 54 mahal; alan, tavan tipleri, CH, döşeme, not, kontrol alanı. Mahal alanı düzeltilirse ona bağlı türetilen kalemler (A.1, A.2, D.1–D.6, F.1…) güncellenir.
- **Cephe**: görünüş × malzeme alan tablosu; C.2–C.7 bu tablodan türetilir.
- **Proje Kontrol**: 13 tutarsızlık bulgusu; her birine durum (Açık / Mimara iletildi / Çözüldü) ve yorum [Ö]. Yeni bulgu eklenebilir.
- **Yöntem**: metin sayfası.
- **Özet**: Excel'deki Özet sayfasının karşılığı + kontrol ilerlemesi (kaç kalem kontrol edildi). [Ö]

### 6.5 Pafta görüntüleyici (Aşama 1)
- 40 mimari pafta, Drawing Register'daki kod/ad/revizyon bilgisiyle.
- three.js, ortografik kamera, kaydırma + yakınlaştırma; pafta keskin kalmalı (yakın zoom'da ölçü/etiket okunabilir).
- **Ölçüm geometrisi**: kalem ↔ pafta ↔ geometri. Geometri türleri: *alan* (poligon), *uzunluk* (çoklu çizgi), *adet* (nokta işaretleri: kapı, kolon). Koordinatlar **PDF sayfa koordinatında** saklanır [Ö] – önceki ölçümler PDF vektörlerinden yapıldığı için pafta görüntüsüyle birebir örtüşür.
- Bir kalemin birden fazla paftası varsa (ör. 4 zone) pafta seçici ile geçilir; zone'lar arası bindirme bölgesi işaretlenir.
- Geometri yanında ölçülen alan/uzunluk/adet gösterilir; kalem miktarıyla fark varsa uyarı verilir.
- **Basit çizim** [K]: Yönetici ve Kontrolcü paftada poligon, çoklu çizgi ve nokta çizebilir, köşe taşıyabilir/silebilir, geometriyi bir kaleme bağlayabilir. Alan/uzunluk/adet pafta ölçeğine göre (1/100, pafta başına kalibre edilmiş PDF-pt → m dönüşümü) otomatik hesaplanır. Pafta çizgilerine yakalama (snap) **yok**. Çizimden hesaplanan değer kalem miktarına "bu değeri kullan" ile aktarılabilir (düzeltme olarak, gerekçeyle). Geometri değişiklikleri de geçmişe yazılır.
- Geometri belirli bir **pafta revizyonuna** bağlıdır (bkz. 6.8).

### 6.6 3D kütle modeli (Aşama 2)
- Plan konturu, kesit/görünüşlerden okunan yükseklikler, çatı bölgeleri (uzay kafes / teras), salon kabukları, cephe yüzeyleri (FG/FM/FS/FP), tavan bölgeleri ile **basit kütle modeli**. Detay seviyesi: tanınabilir bina formu, metraj gruplarına karşılık gelen ayrı parçalar.
- Model parçaları metraj kalemlerine bağlanır; kaleme tıklayınca parça vurgulanır, parçaya tıklayınca kalem açılır.
- Model gösterim içindir; miktar modelden hesaplanmaz.

### 6.7 Excel çıktısı ve satın almaya gönderim [Ö]
- Excel yalnız indirme amaçlıdır; geri yükleme yoktur. [K]
- Satın alma çıktısı: Malzeme Listesi + güncel miktarlar + kontrol durumu + spec özeti + son değişiklik tarihi. Ayrıca Excel'in orijinal sayfa düzenine yakın tam metraj çıktısı. Tarayıcıda üretilir.
- **Satın almaya gönderim**: Yönetici bir listeyi "satın almaya gönder" dediğinde o anki miktarlar, spec'ler ve durumlar tarih + kullanıcı ile **dondurulmuş kayıt** olarak saklanır ve Excel'i üretilir. Sonradan değişen kalemler "gönderimden sonra değişti" olarak işaretlenir; iki gönderim arasındaki farklar görülebilir.

### 6.8 Pafta revizyonları [K]
- Her pafta birden fazla revizyona sahip olabilir (ör. DD R0 → DD R1 → Uygulama projesi). Hiyerarşi: *proje → disiplin → pafta → revizyon*. Drawing Register'daki revizyon bilgisi başlangıç kaydıdır.
- Yönetici yeni revizyon PDF'ini yükler; eski revizyonlar saklanır ve görüntülenebilir.
- Ölçüm geometrisi çizildiği revizyona bağlı kalır (PDF değişince sayfa koordinatları sessizce bozulmasın diye). Yeni revizyon yüklenince o paftaya bağlı kalemler "Yeniden kontrol gerekli" olur; geometri yeni revizyon üzerinde gösterilir ama "önceki revizyondan" olarak işaretlenir, kullanıcı onaylayınca veya yeniden çizince yeni revizyona geçer.
- İki revizyon arasında görsel karşılaştırma (üst üste bindirme / yan yana) [Ö].
- Pafta değişince yeni pafta da eklenebilir (pafta listesi sabit değildir).

## 7. Veri hazırlığı (bir kez, geliştirme makinesinde)
1. **Excel → Firestore**: tüm sayfalar; formül ilişkileri kalem türü/bağımlılık olarak çıkarılır. Aktarım sonrası her miktar Excel'deki değerle karşılaştırılır (mutabakat raporu). Excel bundan sonra düzenlenmeyeceği için aktarım **tek seferlik**tir [K]; yine de geliştirme sırasında sıfırdan yeniden çalıştırılabilir olmalı.
2. **Paftalar → Storage**: 40 PDF (ve gerekirse görüntü katmanları) disiplin klasörü altında; erişim kuralları disiplin + pafta yetkisine bağlı.
3. **Ölçüm geometrisi**: Excel'de yalnız sonuçlar var, ölçülen bölgeler **kayıtlı değil**. Bu nedenle ölçümler PDF vektör çizimlerinden (ve gerekirse DWG'den) **yeniden çıkarılır**, kalemlere bağlanır. Yeniden ölçülen değer Excel değerinden belirgin farklıysa kalem "Sorunlu" olarak işaretlenir ve raporlanır; Excel değeri sessizce ezilmez.
4. **3D model** (Aşama 2): paftalardan türetilir, glTF olarak Storage'da.

Uygulama, geometrisi henüz hazır olmayan kalemlerde de çalışır: kaynak paftayı işaretsiz açar.

## 8. Aşamalar
Sıra Koray'ın belirlediği gibidir [K]: önce metraj kesinleştirme, sonra 3D model, spec, araştırma/satın alma.

1. **Aşama 1 – Altyapı + Metraj kesinleştirme**: giriş/roller/erişim, Excel aktarımı + mutabakat, tüm liste sayfaları, kontrol durumu, düzeltme + formül düzenleme + geçmiş + bağlı kalem güncelleme, kesinleştirme kilidi, pafta görüntüleyici + pafta revizyonları, ölçüm geometrisinin çıkarılması + paftada gösterimi + basit çizim, Excel çıktısı. (İçeride: 1a altyapı + listeler + kontrol + pafta görüntüleyici; 1b geometri + çizim.)
2. **Aşama 2 – 3D kütle modeli** ve kalem ↔ model parçası bağlantısı.
3. **Aşama 3 – Spec tanımlama**: spec ekranları, teknik föy ekleri, malzeme ilerleme göstergesi, ihtiyaç tarihi, satın almaya gönderim (dondurulmuş kayıt + Excel).
4. **Aşama 4 – Araştırma ve satın alma modülü**: ayrıca tasarlanacak.
5. **Gelecek** – diğer disiplinler, başka projeler.

Veri yapısı en baştan *proje → disiplin → pafta (→ revizyon) / kalem / malzeme* hiyerarşisiyle kurulur; bugün tek proje ve tek disiplin (mimari) dolu olur.

Satın almanın ilk kesin miktarlara ihtiyaç duyacağı tarih belirtilmedi; aşamalar yukarıdaki sırayla ilerler.

## 8a. Çalıştırma ve yayına alma [K]
1. **Önce yerelde**: uygulama Koray'ın bilgisayarında Firebase Emulator Suite (Auth, Firestore, Storage) ile çalıştırılır; gerçek Firebase projesine dokunulmadan geliştirilir ve denenir. Excel aktarımı ve pafta yükleme betikleri önce emülatöre çalışır.
2. **Sonra GitHub → Firebase**: kod bir GitHub deposuna konur; ana dala birleşen değişiklikler GitHub Actions ile Firebase'e (Hosting + güvenlik kuralları) otomatik yayınlanır. Pull request'ler için önizleme kanalı [Ö].
- Paftalar, Excel ve gizli anahtarlar **depoya konmaz** [Ö]; paftalar Storage'a yükleme betiğiyle gider, anahtarlar GitHub Secrets'ta durur.

## 9. Uygulayıcıya bırakılanlar
- Arayüz çatısı: React + TypeScript + Vite önerilir [Ö]; three.js doğrudan veya react-three-fiber ile – uygulayıcı seçer.
- Pafta gösterim tekniği (pdf.js ile istemcide çizim vs. önceden üretilmiş görüntü karoları), keskinlik şartını sağladığı sürece.
- Geometri çıkarma araçları ve yöntemi (pdf.js vektör okuma, AutoCAD/DXF vb.).
- Firestore koleksiyon yapısı, güvenlik kurallarının teknik kurgusu (custom claims vs. kullanıcı dokümanı), davet akışı (Cloud Functions / Admin SDK betiği).
- Excel okuma/yazma kütüphanesi.
- 3D modelin üretim yöntemi.
- Görsel tasarım detayları (renk, tipografi).
