# Canlıya alma: GitHub → GitHub Actions → Firebase

Akış: `main` dalına gelen her değişiklik GitHub Actions'ta test edilir, geçerse Firebase'e yayınlanır
(Hosting + Firestore/Storage kuralları + indeksler + Cloud Functions). Pull request'lerde yalnız testler çalışır.
İş akışı: `.github/workflows/deploy.yml`.

Depoya **girmeyenler** (`.gitignore`): `Projeler/`, Excel/PDF/DWG, `work/`, hizmet hesabı anahtarları.
`web/.env.production` depoya girer: içindeki Firebase web ayarı gizli değildir (her ziyaretçinin tarayıcısına gider);
erişimi güvenlik kuralları korur.

## 1. GitHub deposu (Koray)

1. github.com → sağ üst **+** → **New repository**
2. Ad: `msk-metraj` · **Private** · README / .gitignore / lisans **ekleme** (boş depo)
3. Depo adresini (`https://github.com/<kullanıcı>/msk-metraj.git`) Claude'a ver → kod gönderilir.
   İlk gönderimde tarayıcıda GitHub girişi açılır.

## 2. Firebase projesi (Koray)

1. https://console.firebase.google.com → **Proje oluştur** → ad: `MSK Metraj` · Google Analytics **kapalı**.
   Oluşan **proje kimliğini** not et (ör. `msk-metraj-1a2b3`).
2. Sol alt **Spark** → **Blaze**'e yükselt (kart). Ardından bütçe uyarısı koy (ör. aylık 5 USD).
   Cloud Functions ve Storage Blaze ister; bu kullanımda maliyet beklenmez.
3. **Authentication** → Başlayın → **E-posta/Şifre** → Etkinleştir.
4. **Firestore Database** → Veritabanı oluştur → konum **europe-west1 (Belçika)** → **üretim modu**.
5. **Storage** → Başlayın → aynı konum.
6. **Proje ayarları** (dişli) → Genel → Uygulamalarınız → **Web (`</>`)** → takma ad `web` → kaydet.
   Gösterilen `firebaseConfig` bloğunu Claude'a ver (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId) → `web/.env.production` ve `.firebaserc` doldurulur.

## 3. GitHub Actions için yayın anahtarı (Koray)

1. https://console.cloud.google.com/iam-admin/serviceaccounts → üstten Firebase projesini seç
   → **Hizmet hesabı oluştur** → ad: `github-deploy`.
2. Roller: **Firebase Admin**, **Cloud Functions Admin**, **Service Account User**,
   **Artifact Registry Administrator**, **Cloud Datastore Index Admin**, **Service Usage Admin**
   (ilk yayında işlevler için gereken Google servislerini açabilsin).
3. Hesaba tıkla → **Anahtarlar** → Anahtar ekle → **JSON** → dosya iner.
4. GitHub deposu → **Settings → Secrets and variables → Actions → New repository secret**
   → ad: `FIREBASE_SERVICE_ACCOUNT` → değer: JSON dosyasının **tüm içeriği**.
5. İndirilen JSON dosyasını sil (anahtar artık GitHub'da şifreli duruyor).

## 4. İlk yayın ve veri (Claude, Koray'la)

1. `main`'e gönderim → Actions sekmesinde "Test ve canlı yayın" çalışır → site:
   `https://<proje-kimliği>.web.app`
2. Canlıya veri ve ilk yönetici için yerel anahtar (proje ayarları → Hizmet hesapları →
   **Yeni özel anahtar oluştur**). Dosyayı depo **dışında** tut, ör. `%USERPROFILE%\.anahtar\msk-admin.json`:

   ```powershell
   $env:GOOGLE_APPLICATION_CREDENTIALS = "$env:USERPROFILE\.anahtar\msk-admin.json"
   npx tsx scripts/bootstrap-admin.ts --prod --email <e-posta> --name "<ad soyad>" --password <şifre>
   npx tsx scripts/import-takeoff.ts --prod
   ```

   `--prod` olmadan betikler her zaman emülatöre gider.

## Sonra

- Paftaların (PDF) Storage'a yüklenmesi, PR önizleme kanalı, özel alan adı: ayrı adımlar.
- Yerel çalışma değişmez: `baslat.bat` / `npm run dev` (yerel mod), `npm run emulators`.
