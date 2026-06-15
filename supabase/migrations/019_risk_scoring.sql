-- Migration 019: RISK skoru + hot-lead yönlendirme alanları (FIT+INTENT+TICKET+ACCESS-RISK).
-- NOT: 012+ gibi Supabase SQL Editor üzerinden manuel uygulanır. Tamamen idempotent.
--
-- RISK sadece davranışsal/iletişim sinyallerinden hesaplanır (MERSİS/Findeks YOK — karar gereği).
-- potential_score = base_score - risk_score. route, skora göre outreach yönlendirmesidir.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS base_score INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS risk_reasons JSONB DEFAULT '[]'::jsonb;
-- Operatörün LeadModal'da işaretlediği davranışsal risk bayrakları:
-- { free_sample, no_company_record, payment_term_long, scope_creep, bargaining }
ALTER TABLE leads ADD COLUMN IF NOT EXISTS behavioral_flags JSONB DEFAULT '{}'::jsonb;
-- Hot-lead kapısı: manual_hyper_personalization | personalized_sequence | nurture | skip
ALTER TABLE leads ADD COLUMN IF NOT EXISTS route TEXT;

-- Hot-lead kuyruğu sorgusu: yüksek potansiyelli, manuel kişiselleştirme rotası.
CREATE INDEX IF NOT EXISTS idx_leads_route ON leads(route);
