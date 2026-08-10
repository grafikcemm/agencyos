# AgencyOS

Grafikcem'in B2B müşteri edinim, CRM, teklif, satış, proje dönüşümü ve tahsilat sistemi.

AgencyOS bir menü veya araç koleksiyonu değil, tek bir gelir döngüsüdür:

> niş ve teklif → hesap ve satın alma sinyali → karar verici ve doğrulama → mesaj ve takip → görüşme, teklif ve itiraz → onboarding, teslimat ve vaka → tekrar satış ve tavsiye

Her lead ve müşteri bu döngüdeki **durumunu, kanıtını ve sıradaki eylemi** taşır.

## Ürün sınırı

AgencyOS: lead'ler, niş/ICP/sinyal/teklif, araştırma ve kanıt, outreach ve gönderim kapısı, teklif/sözleşme/onboarding/teslimat/tahsilat, vaka ve tavsiye, müşteri belge merkezi.

GrafikcemOS: günlük karar, kişisel görev ve alışkanlık, kapasite, spor/vitamin, içerik üretimi, ajanlar, ortak hafıza **ve kariyer** (iş arama + gelişim rotası).

⚠️ `/kariyer` ve `/gelisim` **AgencyOS kapsamı değildir** (2026-08-10). Veri okumayan "geçiş hazırlanıyor" ekranı dönerler; devir manifesti [`docs/CAREER-HANDOFF-2026-08-10.md`](docs/CAREER-HANDOFF-2026-08-10.md).

Tam tablo ve köprü sözleşmesi: [`docs/PRODUCT-BOUNDARY.md`](docs/PRODUCT-BOUNDARY.md).

## Nişler (ilk 90 gün)

| Niş | Pay | Giriş teklifi | Vaka |
|---|---|---|---|
| Güzellik, parfüm ve kozmetik | %60 | 7 günlük Launch Creative Diagnostic | Your Own Scent (YOS) |
| Premium ev/mutfak + çok markalı perakende | %25 | 10 günlük SKU & Channel Creative Audit | Enplus Türkiye |
| Oyuncak, çocuk ve aile | %15 | 5 günlük Seasonal Campaign Diagnostic | Dede Oyuncak |

Kanonik kayıt: `src/data/niches.ts`. Karar ve kaynak uzlaştırması: [`docs/NICHE-DECISION-2026-08-10.md`](docs/NICHE-DECISION-2026-08-10.md).

Üç niş **aynı outreach kampanyasında karıştırılmaz**; bir hücrede aynı anda tek giriş teklifi test edilir. Fiyatlar hipotezdir — sistem kesin fiyat üretmez.

## Temel sistemler

- **Lead Radar — Türkiye / Global** — tek veri ve karar motorunun iki çalışma alanı. Ayrı preset, kota, coğrafya görünümü, dil, para birimi ve saat dilimi; **ikinci bir CRM yok**. Araştırma seed'i + Google Places + Apollo zenginleştirmesini birleşik hesap görünümünde toplar.
- **Ülke uyum motoru** — TR (KVKK/6563/İYS), ABD (CAN-SPAM), Birleşik Krallık (PECR/UK GDPR) allowlist; AB/AEA, Kanada, Avustralya ve tanımsız ülkeler bloklu başlar. `send_allowed` bir sütun değil, olgulardan türetilen karardır.
- **Edinim dönemi** — eski lead dönemi silinmeden kapatılır (`npm run epoch:reset`); varsayılan tüm ekranlar yalnız güncel dönemi gösterir.
- **Belge Merkezi** (`/belgeler`) — Türkiye ve Global paketler ayrı hukuk metinleri olarak; her belge taslak doğar, uzman incelemesinden geçmeden imzaya çıkmaz.
- **Kanıt motoru** — bir şirketin neden ŞİMDİ ödeme yapacağını kaynak URL'siyle açıklar. Kaynaksız puan üretilmez.
- **Yaşam döngüsü** — keşiften onboarding, vaka ve tavsiyeye kadar provenance kaybetmeden ilerler. Bağımsız `lifecycle_stage` sütunu yoktur; aşama `leads.status` + `lead_lifecycle_events` akışının tek projeksiyonudur.
- **İnsan onay kapısı** — otomatik gönderim yok. Onaysız veya digest'i eşleşmeyen mesaj yapısal olarak gönderilemez.
- **Apollo (opsiyonel)** — `APOLLO_API_KEY` yoksa ürün çalışır ve manuel zenginleştirme kuyruğu sunar. Aynı sorgu için ikinci kez ücret ödenmez.
- **Outbound kapasite modeli** — steady-state aylık 2.500–3.000 **toplam** e-posta (ilk temas + en fazla bir follow-up), ~1.400–1.600 yeni prospect. Gerçek gönderim, ölçülmüş deliverability hazırlığı olmadan açılmaz.

## Yerel komutlar

```bash
npm run dev
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e

npm run daily:scan
npm run seed:research -- --preflight     # şema + duplicate kontrolü
npm run seed:research                     # --dry-run (varsayılan), hiçbir şey yazmaz
npm run seed:research -- --apply          # uygular, geri alma raporu yazar

npm run epoch:reset -- --inventory        # tablo/kaynak/adet/bağımlılık envanteri
npm run epoch:reset -- --export           # JSONL + SHA-256 manifest arşivi
npm run epoch:reset                       # --dry-run varsayılan
npm run epoch:reset -- --apply            # emeklilik işareti (SİLME YOK)
```

## Migration'lar

Otomatik migration YOK — repo şemanın kanıt/versiyon kaydıdır, uygulama Supabase SQL Editor'da elle yapılır.

| Yol | Kapsam | En son |
|---|---|---|
| `migrations/` | App DB (kanonik) | `072_market_scope_compliance` |
| `supabase/migrations/` | App DB (eski hat) | `056_reconcile_hardening` |
| `supabase/life-migrations/` | LIFE DB | `008_career_evidence` (**AgencyOS'a uygulanmaz** — GrafikcemOS'a devir) |

Her migration'ın bir `_rollback.sql` ikizi vardır. **068 uygulanmadan önce** `npm run seed:research -- --preflight` çalıştırılmalı: duplicate varsa migration durur.

## Ortam değişkenleri

Üretim için zorunlu: `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `CRON_SECRET` · `GOOGLE_MAPS_KEY` · `OPENROUTER_API_KEY`

Opsiyonel: `APOLLO_API_KEY` · `SERPAPI_KEY` · `TAVILY_API_KEY` · `EXA_API_KEY` · `PAGESPEED_API_KEY`

Sahiplik ve köprü: `LIFE_UI_OWNER` · `CEMOS_LIFE_*` · `CEMOS_AGENCYOS_*`

Kapalı kalması gerekenler: `GMAIL_SEND_ENABLED=false` (İYS/KVKK/tacir statüsü kararı bekliyor) · `APIFY_ENABLED` · `INSTANTLY_ENABLED`

Deliverability beyanı: `OUTBOUND_READINESS_CONFIRMED` · `OUTBOUND_SPAM_RATE` · `OUTBOUND_HARD_BOUNCE_RATE` — hepsi tam olmadan gerçek gönderim açılmaz.

Tam liste `.env.example`'da. `.env.local` asla commit edilmez.

## Deployment

⚠️ **Production git ile deploy EDİLMİYOR.** Canlı deployment `source: "cli"` — yani `vercel deploy --prod` ile yapılmış. `git push` deploy tetiklemez. Vercel projesi: `agencyos` (`prj_d9hDcjEEUZje7esCfJ16ImsVR2ZF`).

Cron: `/api/cron/daily-scan` 05:00 UTC · `/api/cron/opportunity-scan` 06:00 UTC Pazartesi. İkisi de `CRON_SECRET` ister.

## Belgeler

- [`docs/PRODUCT-BOUNDARY.md`](docs/PRODUCT-BOUNDARY.md) — sahiplik, köprü, otomasyon merdiveni
- [`docs/NICHE-DECISION-2026-08-10.md`](docs/NICHE-DECISION-2026-08-10.md) — niş kararı ve kaynak uzlaştırması
- [`docs/ui-principles-2026-08-10.md`](docs/ui-principles-2026-08-10.md) — karar yüzeyi ilkeleri
- [`docs/route-inventory-2026-08-10.md`](docs/route-inventory-2026-08-10.md) — 26 sayfa + 103 API rotası, KEEP/MERGE/MOVE/HIDE sınıfı
- [`docs/CAREER-HANDOFF-2026-08-10.md`](docs/CAREER-HANDOFF-2026-08-10.md) — kariyer devri envanteri ve veri sözleşmesi
- [`docs/VENDOR-DECISIONS-2026-08-10.md`](docs/VENDOR-DECISIONS-2026-08-10.md) — Apify kabul, LeadMash/Explee ret, bütçe kuralları
- [`docs/security/cemos-bridge-threat-model.md`](docs/security/cemos-bridge-threat-model.md) — `agencyos-ozet` açma koşulları
