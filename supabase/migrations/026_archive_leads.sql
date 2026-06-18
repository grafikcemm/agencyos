-- Migration 026: Mevcut leadleri arşivle + harita temiz başlasın (soft archive)
-- NOT: 013/025 gibi Supabase SQL Editor üzerinden MANUEL uygulanır. Idempotent.
--
-- Müşteri bulma motoru genişletmesi: harita sayfası yeni (Apollo kişi + 2/gün A-tier)
-- akışıyla temiz başlasın diye eski leadler 'archived' statüsüne taşınır. SİLİNMEZ —
-- status'u geri çevirerek kurtarılabilir; FK'lar (apollo_enrichments, follow_ups, cold-email)
-- bozulmaz. 'converted' (kazanılan) HARİÇ tutulur — kapanan anlaşmalar aktif kalır,
-- "Kazanılan MRR" widget'ı ve engagement view'ları onları okumaya devam eder.
--
-- leads.status'ta CHECK kısıtı YOK (001: TEXT DEFAULT 'new'), bu yüzden yeni 'archived'
-- değeri için kısıt değişikliği gerekmez.

-- 1) Arşivlenme zaman damgası (idempotent)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2) Mevcut tüm leadleri arşivle (converted hariç). Zaten arşivli olanları tekrar damgalamaz.
UPDATE leads
SET status = 'archived', archived_at = now(), updated_at = now()
WHERE status <> 'converted' AND status <> 'archived';

-- 3) Aktif (arşivsiz) leadler için kısmi index — harita varsayılan görünümü hızlı kalsın.
CREATE INDEX IF NOT EXISTS idx_leads_active ON leads(status) WHERE status <> 'archived';
