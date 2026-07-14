# AgencyOS V2 — External Activation Final Handoff

Tarih: 2026-07-15

Branch: `feat/agencyos-v2-sprint0`

Production: `https://agencyos-zeta-ashen.vercel.app`

## Sonuç

Teknik geliştirme, dış provider kurulumu ve kapsamlı test kapanmıştır. Google Workspace/DNS/OAuth/Vault/Gmail ingest, gerçek teknik Gmail send+reply, Telegram webhook/inbound/outbound, ücretsiz scheduler ve Supabase şema paritesi doğrulanmıştır. Ticari Gmail send yalnız hukuk/uyum kapıları nedeniyle kapalıdır.

## Gerçek dış sistem kanıtları

- Workspace alan adı ve `info@grafikcem.com`: aktif
- MX/SPF/DMARC/DKIM: doğrulandı
- OAuth scope: `gmail.send`, `gmail.readonly`
- OAuth token: Vault
- Gmail ingest: açık ve scheduler heartbeat sağlıklı
- Teknik canary: gerçek send + gerçek reply, ledger=`replied`
- Telegram: webhook URL doğru, pending=0, gerçek inbound/outbound doğrulandı
- Vercel planı: Hobby; Pro gerektirmeyen dış scheduler çalışıyor

## Canary incident kaydı

İlk teknik denemede provider Message-ID aramasının eventual-consistency davranışı ikinci teknik iletiye izin verdi. Toplam iki teknik canary mesajı oluştu. Müşteri gönderimi değildi. Kalıcı düzeltme: DB unique claim, dört durumlu ledger ve `unknown` durumunda kesin no-resend. Üretimde sonraki denemeler dedupe oldu ve gerçek reply `replied` durumuna reconciled edildi.

## Kalite kapıları

- TypeScript PASS
- ESLint PASS (0/0)
- Vitest coverage PASS: 128 dosya, 1707/1707
- Next.js production build PASS
- Playwright PASS: 150/150, iki ardışık tekrar, izole DB, cleanup sıfır
- App/test schema fingerprint PASS
- Gerçek Gmail send+reply PASS
- Gerçek Telegram inbound/outbound PASS

## Kalan dış karar — kod işi değil

Vergi levhası şahıs işletmesini kanıtlıyor fakat tek başına tacir/esnaf ayrımını ve MERSİS zorunluluğunu kesinleştirmiyor. Sahte MERSİS üretilmedi. `GMAIL_SEND_ENABLED=false` bu nedenle doğru fail-closed durumdur.

Resmi statü + İYS/KVKK tamamlanınca:

1. Settings'e gerçek yasal kimliği gir.
2. Health 16/16 doğrula.
3. Send flag'i aç.
4. 3–5 gerçek lead supervised pilot çalıştır.
5. Gerçek dönüş metriği olmadan “para kazandırıyor” iddiası kurma.

## Compact sonrası devam promptu

AgencyOS V2 worktree `C:/Users/alice/.gemini/antigravity/scratch/agency-os-v2-sprint0`, branch `feat/agencyos-v2-sprint0`. Önce `.claude-resume.md` ve `docs/handoffs/2026-07-15-external-activation-final.md` oku. Teknik geliştirme ve provider aktivasyonu tamamlandı; test kapıları 1707/1707 unit/coverage ve Playwright 150/150 x2 yeşil. Gmail gerçek teknik send+reply ve Telegram gerçek inbound/outbound kanıtlı. `GMAIL_SEND_ENABLED=false` yalnız resmi tacir/esnaf + MERSİS/İYS/KVKK kapıları için. Yeni özellik sprinti açma. Önce yasal statüyü gerçek belgeyle kesinleştir, Settings'e placeholder olmadan gir, readiness 16/16 doğrula; sonra yalnız 3–5 lead supervised pilotu HITL ile çalıştır ve gerçek funnel metriklerini raporla. Secret yazma, unknown resend yapma, suppression ve evidence gate'i gevşetme.
