# Malzeme İncelemesi — 261116 Mimari Set Baskı ve Kesin Proje kesitleri (2026-11-27)

Kaynaklar: `Projeler/261116_4199-MSK_Mimari-Set-Baskı.dwg` (DXF'e çevrildi: `work/dxf/261116_4199-MSK_Mimari-Set-Baski.dxf`),
Kesin Proje DXF'leri (`work/dxf/4199-A-DD-*.dxf`), özellikle kesitler 01/02-03-100/200 ve sistem detayları 00-09-100, 01/02-09-101, 00-09-102.
Yöntem: tüm metinler, blok öznitelikleri (malzeme etiketi `TAG`, mahal etiketi) ve tarama katmanları okundu; etiket ↔ açıklama en yakın metinle eşlendi.

## 1. Yeni set ne?

- Tek DWG, model uzayında 1/200–1/500 toplu baskı seti: vaziyet, alt/üst kat planı, alt/üst kat tavan planı, 4 görünüş, A-A ve B-B kesiti. Kâğıt uzayı boş.
- Malzeme etiketleri ve tavan lejantı **Kesin Proje ile birebir aynı** (görünüşlerde etiket sayıları dahil). Yeni bir malzeme kodu yok.
- Yeni olanlar: mahal alanları doldurulmuş (ör. FUAYE GF-02 1553,88 m², TEKNİK ALAN MF-01 798,72 m²), mekanik etiketler (AHU-1…7, IGK-1…4, modüler su deposu 132 m³ / 10 m³), "YANGIN KAÇIŞ HOLÜ" ve **bir yeni kesit detayı notu** (bkz. §3).
- Mahal etiketlerindeki TAVAN / DUVAR / ZEMİN / SÜPÜRGELİK alanlarının **hepsi boş** — mahal bazında bitiş malzemesi bu sette de yok. Genel not: *"Refer to ID Projects for material finishes"* (iç mimari projesi bekleniyor).

## 2. Tanımlanan malzemeler

### Cephe (görünüşler, iki sette aynı)
| Kod | Açıklama | Etiket adedi | Not |
|---|---|---|---|
| FG-01 | CAM | 25 | Cam kombinasyonu, Ug, profil sistemi yazılmamış |
| FM-01 | ALÜMİNYUM PANEL | 18 | FM-01…05 hepsi "alüminyum panel"; aralarındaki fark (renk/kalınlık/tip) **yazılmamış** |
| FM-02 | ALÜMİNYUM PANEL | 21 | |
| FM-03 | ALÜMİNYUM PANEL | 10 | |
| FM-04 | — | 11 | **Yanında açıklama yok** (en yakın metin 8–11 m uzakta). Tanımsız |
| FM-05 | ALÜMİNYUM PANEL | 4 | |
| FS-01 | DOĞAL TAŞ | 16 (+2 kesitte) | Detayda TRAVERTEN |
| FP-01 | SIVA+BOYA | 14 | Renk kodu yok |

### Sistem detayları (00-09-100, 01/02-09-101) — farklı kod sistemi
| Kod | Açıklama |
|---|---|
| FP-01 | TRAVERTEN (9 yerde) — ama 2 yerde SIVA+BOYA'nın yanında |
| FP-02 | Ahşap Panel (Küçük Salon 02 iç yüzeyi) |
| FP-03 | ALÜMİNYUM LEVHA (harpuşta / saçak, 3 mm) |
| FP-04 | CAM |

Detayda ayrıca: AHŞAP LAMBRİ, AHŞAP PANEL TAVAN, BAFFLE TAVAN, ALÇI, DAMLAMA BOŞLUĞU, Hilti tipi **HST ankrajlar** (M8/30, M8/50, M10/10–50, M12/20–120, M24/30–60), "mekanik ihtiyaca göre döşemede yırtık olacaktır".

### Tavan lejantı (iki sette aynı)
C-G01 alçıpan + RAL 9010 · C-G02 alçıpan + RAL 9005 · C-G03 neme dayanıklı alçıpan · C-G04 akustik alçıpan ·
C-W01/W02/W03 ahşap tavan paneli (üçü aynı açıklama; fark yazılmamış) · C-B01 alüminyum baffle · C-P01 sıva+boya ·
C-M01 metal tavan · C-M02 alüminyum petek · C-M03 alüminyum kanal.

## 3. Kesitlerden kontrol

**Saçak / parapet (A-A, B-B kesitleri ve 01/02-09-101) — beş katmanlı not, iki sette aynı:**
alüminyum levha kaplama · çimento esaslı levha 2×12,5 mm · ara bağlantı karkas ve ısı yalıtımı · çelik konstrüksiyon (**ebat belirlenecek**) · çimento esaslı levha 12,5 mm.
→ `specs.ts` B.2.x / C.4.x ile tutarlı.

**Yalnız yeni sette — yüksek/alçak çatı arasındaki iç parapet (dere) detayı** (model koordinatı ≈ x 450 m, y 5615 m; A-A kesiti):
alüminyum levha kaplama · çimento esaslı levha 2×12,5 mm · ısı yalıtımı · **50×90 dikey profil**.
→ Kesin Projede karkas için yalnız "94 mm çelik karkas, profil ebatı belirtilmemiş" vardı (C.4.4). Yeni set **50×90 dikey profil** veriyor; ebat bilgisi olarak eklenebilir (90 ≈ 94 mm karkas derinliği ile uyumlu, teyit edilmeli).

**Tarama katmanları:** kesitlerde A_Mat_Mtal (metal), A_Mat_Glas (cam), A_Mat_Insl (yalıtım), A_Mat_Gpsm (alçıpan), A_Patt_Stuc_Conc (betonarme, ANSI33), A_Patt_Wall (duvar, ANSI31). Yazılı not dışında yeni malzeme türü çıkmadı.

## 4. Çelişkiler ve eksikler (mimara sorulacak)

1. **FP-01 kod çakışması:** görünüşte FP-01 = sıva+boya, sistem detayında FP-01 = traverten. Görünüşte taş FS-01. Tek kod sistemine bağlanmalı.
2. **İki ayrı kod sistemi:** görünüş FG/FM/FS/FP, detay FP-01…04 (cam FG-01 ↔ FP-04, alüminyum FM-xx ↔ FP-03). Hangi FM kodunun FP-03 olduğu belirsiz.
3. **FM-04 tanımsız** (11 etiket, açıklama yok).
4. **FM-01…05 farkı yok:** hepsi "alüminyum panel"; renk/RAL, kalınlık, panel tipi verilmeli.
5. **C-W01/W02/W03 farkı yok:** üçü "ahşap tavan paneli".
6. Çelik konstrüksiyon ebadı "belirlenecek"; cam tipi, taş kalınlığı (yazıyla), sıva/boya rengi, su yalıtım türleri yazılmamış.
7. Mahal bitişleri (zemin/duvar/süpürgelik) hiçbir sette yok → iç mimari projesi gerekli.

## 5. `specs.ts` için önerilen güncelleme

- C.4.4 `Profil / ebat`: "50×90 dikey profil (261116 Mimari Set Baskı, A-A kesiti iç parapet detayı)".
- C.3 (FM-04): not olarak "görünüşte açıklaması yok — tanımsız".
- C.10 / C.11: FP-01 çakışması notu.
- Yeni kalem adayları: ahşap lambri (01-09-101), HST ankrajlar (alt konstrüksiyon), FP-02 ahşap panel (Küçük Salon 02).
