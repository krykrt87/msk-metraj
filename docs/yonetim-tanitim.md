# MSK Kongre Merkezi – Metraj ve Malzeme Uygulaması

**Üst yönetim için tanıtım** · Kasım 2026

## Özet

Mustafa Sak Kongre Merkezi (proje 4199) için, satın almaya esas olacak metrajı **tek, güvenilir ve izlenebilir bir kaynakta** toplayan bir web uygulaması geliştirdik. Uygulama metrajı doğrudan proje çizimlerinden (DWG) hesaplıyor, her miktarın nereden geldiğini gösteriyor ve yapılan her değişikliği kimin, ne zaman, neden yaptığıyla birlikte kayıt altına alıyor. Hedef, satın alma ekibine **kontrol edilmiş ve kesinleşmiş** miktarları ve malzeme özelliklerini eksiksiz teslim etmek.

## Neden gerekliydi?

Metraj bugüne kadar Excel'de, elle hazırlanıyordu. Bu yöntemin satın alma açısından riskleri:

- Bir sayının hangi çizimden, hangi ölçümle çıktığı belgelenmiyor; kontrol etmek zor.
- Bir rakam değiştiğinde eski değer, değiştiren kişi ve gerekçe kaybolabiliyor.
- Birbirine bağlı kalemler (ör. çatı alanından türeyen katmanlar) elle güncellenmezse tutarsız kalıyor.
- Proje revize edildiğinde hangi miktarların yeniden kontrol edilmesi gerektiği belli değil.

Yanlış veya eksik metraj; fazla alım, eksik sipariş, gecikme ve ek maliyet demek.

## Uygulama ne yapıyor?

| Özellik | Sağladığı fayda |
|---|---|
| **Çizimden otomatik metraj** | Miktarlar mimari DWG paftalarından program ile hesaplanıyor; elle ölçüm hatası azalıyor. |
| **Hesap cetveli** | Her kalemin adet × en × boy şeklinde satır satır dökümü görülüyor; sayı "kara kutu" değil. |
| **3 boyutlu model** | Bir metraj kalemi seçildiğinde binada ilgili elemanlar 3B modelde vurgulanıyor; ölçülen yer gözle doğrulanıyor. |
| **Pafta görüntüleyici** | Proje paftaları uygulama içinden açılıyor, revize paftalar yüklenebiliyor. |
| **Değişiklik geçmişi** | Her düzeltme eski değer, yeni değer, kişi, tarih ve zorunlu gerekçe ile saklanıyor; hiçbir sayı iz bırakmadan değişemiyor. |
| **Otomatik yeniden hesap** | Bir kalem değişince ona bağlı tüm kalemler kendiliğinden güncelleniyor ve "yeniden kontrol" olarak işaretleniyor. |
| **Kontrol ve kesinleştirme** | Her kalem "kontrol edilmedi → kontrol edildi → kesinleşti" yolundan geçiyor; kesinleşen kalem kilitleniyor. |
| **Malzeme Listesi ve özellikler** | Metraj kalemlerinden malzeme listesi türetiliyor; her malzemeye teknik özellik (spec) girilebiliyor. |
| **Mahal Listesi ve Proje Kontrol** | Mahal bazında alanlar ve projedeki tutarsızlıkların listesi tek ekranda. |
| **Excel çıktısı** | Satın alma birimi kesinleşmiş listeyi tek tıkla Excel olarak alabiliyor. |
| **Rol ve yetki** | Yönetici, kontrolcü ve satın alma rolleri; kimin neyi göreceği ve değiştirebileceği sunucu tarafında denetleniyor. |

## Mevcut durum

- Uygulama **canlıda** çalışıyor; tarayıcıdan (masaüstü ve telefon) erişiliyor, ek kurulum gerektirmiyor.
- Mimari disiplinin metrajı, 3B modeli, malzeme listesi, mahal listesi, proje kontrol ve Excel çıktısı kullanıma hazır.
- Altyapı Google Firebase üzerinde; sunucu bakımı ve şirket içi IT kaynağı gerektirmiyor, işletme maliyeti çok düşük.

## Yol haritası

1. **Metrajın kesinleştirilmesi** – kalemlerin tek tek kontrol edilip kilitlenmesi *(devam ediyor)*
2. **Ürün özelliklerinin (spec) tanımlanması ve onaylanması**
3. **Ürün ve tedarikçi araştırması**
4. **Satın alma modülü** – ihtiyaç tarihi, teklif, sipariş ve teslimat takibi; malzemenin zamanında alınması

Sonraki adımda mekanik, elektrik, yangın ve aydınlatma disiplinleri de aynı yapıya eklenebilir; altyapı buna hazır tasarlandı.

## Yönetimden beklenen

- Satın alma ve kontrol ekiplerinin uygulamayı **tek kaynak** olarak kullanmasının desteklenmesi (Excel yalnız çıktı olarak).
- Kontrol sürecine katılacak kişilerin belirlenmesi.
- Satın alma modülünün kapsamı için satın alma birimiyle ortak bir toplantı.
