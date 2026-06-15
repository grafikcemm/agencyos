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

## Life DB

Life/FTG şeması için `supabase/life-migrations/001_life_schema.sql` dosyasına bak.
O da manuel uygulanır ve İKİNCİ projede (`xcqrk…`) çalıştırılır — bu projede DEĞİL.
