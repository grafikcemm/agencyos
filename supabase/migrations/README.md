# AgencyOS — Migrations

AgencyOS ana DB (Supabase proje ref: `dfedeh…`). Bu klasör **ana uygulama DB'sinin**
şemasıdır. Feed The Goat / Yaşam OS tabloları AYRI bir Supabase projesinde
(`xcqrk…`) durur ve `supabase/life-migrations/` altında snapshot'lanır.

## Uygulama politikası

- **Otomatik migration YOK.** Migration dosyaları Supabase **SQL Editor'da manuel**
  uygulanır. Repo, şemanın kanıt/versiyon kaydıdır.
- `014` ve sonrası dosyalar manuel uygulama gerektirir; uygulanmadan önce ilgili
  feature canlıda çalışmaz (kod tablo yoksa sessizce atlayacak şekilde yazılmıştır).

## Numara boşlukları

- **`003` yok.** Bilinçli boşluk — erken geliştirmede atlandı/geri alındı.
  Eksik dosya değildir, aramaya gerek yok.
- Dosyalar sıralı uygulanmalı (düşükten yükseğe). `if not exists` / `add column
  if not exists` ile idempotent yazılmıştır; tekrar çalıştırma güvenlidir.

## Son eklenenler

| Migration | İçerik |
| --- | --- |
| `018_compliance_footer.sql` | E-posta uyumluluk alt bilgisi |
| `019_risk_scoring.sql` | Lead risk skoru + hot-lead yönlendirme |
| `020_pipeline_discipline.sql` | `proposal` aşaması discovery gatekeeper alanları |
| `021_job_signal.sql` | İş ilanı sinyali |
| `022_multichannel.sql` | Çok kanallı outreach |
| `023_job_reject.sql` | İş ilanı eleme |
| `024_lead_missing_columns.sql` | `leads.has_ecommerce`, `leads.branch_count` (tip ↔ kolon uyumu) |
| `032_service_catalog.sql` | Kanonik hizmet kataloğu override tablosu + `lead-evidence` PRIVATE Storage bucket |
| `033_lead_intelligence.sql` | Lead Intelligence v2: `lead_intel_runs`, `lead_evidence`, `lead_assessments`, `lead_service_matches`, `lead_match_feedback` (hepsi RLS'li) |
| `034_leads_v2_columns.sql` | `leads.design_score/ai_score/primary_service_slug/last_assessment_id/last_assessed_at` |
| `035_engagement_views_v2.sql` | `_v2` öğrenme view'ları — `contacted` başarı SAYILMAZ (responded/meeting/proposal/converted ağırlıklı) |
| `036_security_hardening.sql` | Post-audit: `leads_with_status` security_invoker + REVOKE; `rls_auto_enable` EXECUTE kısıtı (canlıya elle uygulanan düzeltmenin repo kaydı) |
| `037_lead_intel_cost_attribution.sql` | Sabit Lead Intelligence ajan kayıtları + `ai_cost_logs.related_lead_id` ve telemetri indeksleri |

## Lead Intelligence v2 notları

- **032–035 sırayla** uygulanır. 032 Storage bucket'ı ekler → projede **Storage aktif** olmalı.
- 033'teki tablolar politikasız RLS'lidir: anon/authenticated erişemez, yalnız service-role.
- Uygulama, migration'lar yokken de çalışır (soft-skip / PGRST204 strip-retry); v2 pipeline
  yalnız `settings.lead_intelligence_v2` satırı `shadow`/`active` yapılınca devreye girer.
- **Cutover:** 7 gün shadow sonrası `GET /api/admin/lead-intel-comparison` incele →
  `settings` tablosunda `lead_intelligence_v2` değerini `{"mode":"active"}` yap (deploy gerekmez).
  Acil kapatma: env `LEAD_INTELLIGENCE_V2_KILL=1` (yalnız kapatır, hiçbir şeyi açamaz).
- Katalog seed: migration 032 sonrası `POST /api/admin/seed-service-catalog` (yapı kolonlarını
  senkronlar, paneldeki fiyat/aktiflik override'larına dokunmaz).
- **Vercel:** daily-scan artık `maxDuration=300` ister → projede **Fluid Compute açık** olmalı
  (Hobby planda 300sn ancak Fluid ile mümkün).

## Life DB

Life/FTG şeması için `supabase/life-migrations/001_life_schema.sql` dosyasına bak.
O da manuel uygulanır ve İKİNCİ projede (`xcqrk…`) çalıştırılır — bu projede DEĞİL.
