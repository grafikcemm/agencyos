-- Migration 022: Çok-kanallı outreach — kanal seçeneklerini genişlet.
-- NOT: 012+ gibi Supabase SQL Editor üzerinden manuel uygulanır. Tamamen idempotent.
--
-- MANUEL-GÖNDER korunur: yeni kanallar (linkedin/phone/x) sadece taslak + sekans
-- hatırlatması içindir; otomatik gönderim yok. follow_up_sequences.channel zaten
-- serbest metin; outreach_messages.channel CHECK kısıtını genişletiyoruz.

DO $$ BEGIN
  ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_channel_check;
  ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_channel_check
    CHECK (channel IN ('email', 'whatsapp', 'instagram', 'linkedin', 'phone', 'x'));
EXCEPTION WHEN undefined_table THEN NULL; END $$;
