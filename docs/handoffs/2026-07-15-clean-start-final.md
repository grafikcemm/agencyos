# AgencyOS — temiz başlangıç ve son doğrulama (2026-07-15)

## Son durum

- Worktree: `C:/Users/alice/.gemini/antigravity/scratch/agency-os-v2-sprint0`
- Branch: `feat/agencyos-v2-sprint0`
- Production: `https://agencyos-zeta-ashen.vercel.app`
- Local: `http://localhost:3000/bugun`
- LIFE verisine dokunulmadı.
- Ticari Gmail gönderimi `GMAIL_SEND_ENABLED=false`; HITL ve uyum kapıları korunuyor.

## Temiz başlangıç

AgencyOS App DB müşteri/gelir operasyon verisi tam yedekten sonra silindi. Yedek git dışındaki `output/backups` dizinindedir.

- Yedek: `output/backups/agencyos-customer-data-2026-07-15_09-36-40-325.json`
- SHA-256: `b9020d94202f043ff9e4f174cd92ca32b0dd28bea61e81a21dcecbd080890365`
- Silinen başlangıç kapsamı: 136 lead, bağlı scan/intel/evidence/match, outreach, approval, Gmail canary message/thread/quarantine ve diğer müşteri operasyon kayıtları.
- Silme sonrası 27 müşteri/gelir tablosu ayrı ayrı yeniden sayıldı: tamamı `0`.
- Korundu: suppression `1`, settings `30`, Gmail account `1`, service catalog `38`, playbook `21`, maliyet logları ve tüm LIFE alışkanlık/görev/rutin verisi.

`scripts/clean-start.js` artık App proje ref'ini exact doğrular, LIFE/E2E hedefini reddeder, tüm kapsamı sayfalı yedekler, SHA-256 üretir, exact confirmation olmadan silmez ve silme sonrası bütün tabloları yeniden doğrular.

## Son kanıt

- TypeScript: PASS
- ESLint: PASS — 0/0
- Coverage: PASS — 128 dosya, 1707/1707 test, tüm kritik eşikler
- Production build: PASS — 84 route
- Playwright: PASS — 75 akış × 2 = 150/150, izole E2E DB
- Clean-start ikinci dry-run: 27/27 müşteri tablosu `0`
- Local browser: `/bugun`, `/harita`, `/firsatlar`, `/pipeline`, `/settings` içerikli, hata overlay'i yok
- Telegram: `ready`, webhook kayıtlı ve doğru URL, pending `0`, unknown delivery/reply `0`
- Gmail: `info@grafikcem.com` bağlı; send+readonly, OAuth, transport, history cursor ve ingest hazır; canary `replied`

## Günlük kullanım — 15–30 dakika

1. `/bugun` aç; duayı oku ve zaman bütçesini seç.
2. `Bugün Aranacaklar` satırlarını işle: arandı, ulaşılamadı, görüşme veya daha sonra.
3. `Taslak Darboğazı`nda kanıtları ve alıcıyı kontrol et; ihlalleri düzelt; uygun metni onaya al. Gerçek send açılana kadar bu adım dry-run kalır.
4. Cevaplar, geciken follow-up ve reconciliation sorunlarını temizle. `unknown` hiçbir zaman otomatik yeniden gönderilmez.
5. Sıcak lead teklifini oluştur; versiyon ve digest'i kontrol edip onayla. Pipeline aşamasını gerçek sonuca göre güncelle.
6. Çıkmadan önce gelir şeridinde o günkü aksiyonun ve sonraki işin görünür olduğundan emin ol.

Temiz ilk gün: `Lead Radar` → şehir/sektör → `Tara` ile küçük bir batch (15) başlat; sonra `Bugünün Fırsatları` ve `/bugun` üzerinden ilerle. Kota zayıf adayla zorla doldurulmaz.

Telegram kısa yolu:

- `/bugun`, `/aranacaklar`, `/taslaklar`, `/takipler`, `/sorunlar`, `/pipeline`, `/teklifler`, `/reconcile`
- `Klinik X arandı`
- `Klinik X ulaşılamadı`
- `Klinik X görüşme oldu`
- `Klinik X daha sonra ara yarın`
- `Klinik X not: ...`
- `Klinik X için cold email hazırla`
- `Klinik X için teklif hazırla`

Mutasyon yapan Telegram işlemleri tek kullanımlık imzalı onay ister. E-posta onayı/gönderimi web `/bugun` HITL akışında kalır.

## Ürün kararı

Yazılım ve provider altyapısı supervised pilot için tamamdır. İkna sistemi rol/sektör/aşama yapısında çalışır, her iddiayı kanıta bağlar ve uydurma sonuç vaatlerini fail-closed engeller. Ancak gerçek dönüşüm performansı ölçülmeden “garanti para kazandırır” denemez.

Ticari gönderimi açmadan önce dış operasyon olarak resmi tacir/esnaf statüsü ve doğru kimlik/footer akışı ile İYS/KVKK politikası tamamlanmalıdır. Ayrıca kullanıcının birebir dili için Settings → Voice DNA'ya 5–10 gerçek başarılı e-posta/teklif örneği eklenmelidir; mevcut profil güvenli ama yalnız 1 pozitif + 1 negatif kuralla sınırlıdır.

