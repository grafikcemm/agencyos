# AgencyOS V2 — Dış Aktivasyon Durumu

Tarih: 2026-07-14  
HEAD: `5a66c4e`  
Production: `https://agencyos-zeta-ashen.vercel.app`

## Sonuç

Ürün kodu ve ücretsiz çalışma altyapısı üretimde. Vercel Pro gerekmiyor; Vercel Hobby
üzerindeki uygulamanın zamanlanmış işleri GitHub Actions ile güvenli anahtar kullanarak
tetikleniyor. Telegram'ın gerçek inbound ve outbound turu başarıyla doğrulandı.

Google Workspace ve Google Cloud OAuth oluşturuldu. Kurumsal Gmail aktivasyonu yalnız
`grafikcem.com` DNS'inin yetkili IHS hesabından doğrulanmasını bekliyor. IHS panelinde
kayıtlı oturum bulunmadığı için DNS, MX, SPF ve DKIM değişiklikleri henüz uygulanmadı.

## Kanıt

- Workspace super-admin: `info@grafikcem.com`
- OAuth scope allowlist: `gmail.send`, `gmail.readonly`
- OAuth test users: `kuroalicem123@gmail.com`, `info@grafikcem.com`
- Telegram real inbound/outbound: PASS
- Production readiness: core/schema/OAuth/scheduler/LIFE/Telegram/Voice DNA PASS
- Gmail account/transport/cursor/fresh-ingest/send ve compliance: WAITING

## Kullanıcıdan gereken iki veri

1. IHS müşteri paneli veya cPanel giriş bilgisi; alternatif olarak IHS hesabında kayıtlı
   doğru e-posta ve parola.
2. Şirket/şahıs işletmesi statüsü, tam ticaret unvanı ve varsa MERSİS numarası.

Bu veriler gelince DNS doğrulaması → MX/SPF/DKIM → OAuth account link → read-only ingest
→ tek HITL send/reply canary sırasıyla tamamlanacak.
