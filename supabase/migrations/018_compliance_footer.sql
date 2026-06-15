-- Migration 018: İYS/KVKK uyum footer ayarları (6563 sayılı ETK + Ticari İleti mevzuatı)
-- NOT: 012/013 gibi Supabase SQL Editor üzerinden manuel uygulanır. Tamamen idempotent.
--
-- Tacir/esnaf alıcılara B2B ticari ileti gönderiminde her iletide ticaret unvanı,
-- MERSİS numarası ve kolay ret imkânı bulunması zorunludur. Bu ayarlar cold email
-- footer'ında deterministik olarak kullanılır (LLM dokunmaz).

INSERT INTO settings (key, value) VALUES
  ('ticaret_unvani',     'Ali Cem Bozma'),
  ('mersis_no',          ''),
  ('compliance_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
