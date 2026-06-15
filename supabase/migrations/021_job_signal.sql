-- Migration 021: Lead'in kendi sitesindeki kariyer/işe-alım sinyali (evidence engine).
-- NOT: 012+ gibi Supabase SQL Editor üzerinden manuel uygulanır. Tamamen idempotent.
--
-- Bir lead'in sitesinde kariyer/açık-pozisyon sayfası varsa: ekip büyütüyor →
-- içerik/görsel üretim kapasitesi ihtiyacı (research'in "işe alım sinyali" lead-içi versiyonu).
-- urgency_score'a +20 katkı verir ve cold email "işe-alım" şablonunu tetikler.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS has_job_signal BOOLEAN DEFAULT false;
