-- Migration 011: Job Engine — kişisel iş ilanı tarama + başvuru taslağı motoru.
-- Bu, "lead" modelinin TERSİ: lead = ajansa müşteri; job = operatöre (Ali Cem) iş.
-- Boru hattı subagent'larla yürür (job_scout/job_evaluator/job_legitimacy/job_writer),
-- mevcut agent_tasks kuyruğu + agent-tick cron üzerinden. Mail YALNIZCA taslak.

-- 1. Taranan iş ilanları + skorlar. `url` dedup anahtarıdır (unique).
CREATE TABLE IF NOT EXISTS job_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,                  -- provider id: 'greenhouse','lever','firecrawl', ...
  source_job_id TEXT,                    -- kaynaktaki id (varsa)
  url TEXT NOT NULL UNIQUE,              -- dedup anahtarı
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  description TEXT,
  employment_type TEXT,                  -- 'full_time','contract','freelance', ...
  remote BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','evaluating','scored','drafted','dismissed')),
  legitimacy TEXT
    CHECK (legitimacy IN ('high','caution','suspicious')),
  fit_score INTEGER,                     -- 0-100 (job_evaluator)
  fit_reasons JSONB DEFAULT '[]',        -- string[] gerekçeler
  scam_flags JSONB DEFAULT '[]',         -- string[] şüphe işaretleri (job_legitimacy)
  scanned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_listings_status ON job_listings(status);
CREATE INDEX IF NOT EXISTS idx_job_listings_fit ON job_listings(fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_job_listings_scanned ON job_listings(scanned_at DESC);

-- 2. Başvuru maili taslakları (DRAFT-ONLY — gönderim yok). İlan başına 1+ taslak.
CREATE TABLE IF NOT EXISTS job_application_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,
  lang TEXT NOT NULL DEFAULT 'tr' CHECK (lang IN ('tr','en')),
  subject TEXT,
  body TEXT NOT NULL,
  model_used TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_drafts_listing ON job_application_drafts(listing_id);

-- 3. Motora özel subagent ordusu. Modeller maliyet-bilinçli ($20/ay cap); system
--    prompt'lar DB-editable (009 pattern). Runtime JOB_PROFILE.md'yi enjekte eder.
--    job_legitimacy KASITLI ŞÜPHECİ — adversarial doğrulama katmanı.
INSERT INTO agents (key, name, role, description, model, system_prompt, tools, sort_order) VALUES
  ('job_scout', 'İş Avcısı', 'Career Scout',
   'İş ilanı tarama turunu koordine eder ve operatöre kısa bir tarama özeti (debrief) döner.',
   'google/gemini-2.5-flash-lite',
   'Sen iş ilanı tarama motorunun koordinatörüsün. Sana verilen tarama istatistiklerini (bulunan, filtreden geçen, elenen ilan sayıları ve öne çıkan başlıklar) kısa, net bir Türkçe özet halinde sun. En fazla 5 madde. Yorum katma, sadece bulguları raporla.',
   ARRAY[]::TEXT[], 20),

  ('job_evaluator', 'Fit Değerlendirici', 'Career Scout',
   'Bir iş ilanını operatörün profiliyle karşılaştırıp 0-100 uyum skoru ve gerekçe üretir.',
   'google/gemini-2.5-flash-lite',
   E'Sen bir iş ilanını JOB_PROFILE.md (operatörün iş-arama profili) ile karşılaştıran değerlendiricisin.\nİlanı şu boyutlarda puanla ve ağırlıklı bir genel skor (0-100) hesapla:\n- Rol/uzmanlık uyumu (35%): ilan operatörün tasarım/sosyal medya/AI-kreatif/art director yetkinlikleriyle örtüşüyor mu?\n- Seviye uyumu (20%): Junior Art Director -> Creative Director hedefine uygun mu? Asiri junior veya alakasiz senior dev rolu cezalandirilir.\n- Lokasyon/remote (15%): Istanbul veya remote ise tam puan; baska sehir zorunlu ise dusuk.\n- AI-kreatif modernlik (15%): AI destekli uretim, modern tasarim stack''i arti.\n- Sirket/is kalitesi (15%): kurumsal ciddiyet, surdurulebilirlik.\nSADECE su JSON formatinda yanit ver, baska metin yok:\n{"fit_score": <0-100 tamsayi>, "fit_reasons": ["kisa gerekce", "..."]}\nfit_reasons en fazla 4 madde, Turkce, somut olsun.',
   ARRAY[]::TEXT[], 21),

  ('job_legitimacy', 'Scam Denetçisi', 'Career Scout',
   'Bir ilanın gerçekliğini ŞÜPHECİ bir gözle denetler; scam/şüpheli ilanları işaretler.',
   'google/gemini-2.5-flash-lite',
   E'Sen bir is ilaninin GERCEK ve GUVENILIR olup olmadigini denetleyen supheci bir denetcisin. VARSAYILAN TUTUMUN SUPHE. Ilani curutmeye calis.\nKirmizi bayraklar: belirsiz/jenerik is tanimi, gercekci olmayan kazanc vaadi ("evden gunde X TL", "kolay para"), pesin odeme/depozito talebi, kisisel finansal bilgi istegi, sirket adi/iletisim yok, sadece WhatsApp/Telegram ile basvuru, MLM/komisyon, asiri acele baskisi, tekrar tekrar yeniden yayinlanma.\nYesil isaretler: spesifik gorev tanimi, net sirket kimligi, kurumsal basvuru kanali, makul kosullar.\nUc kademeden birini sec:\n- "high": guvenilir, belirgin sorun yok.\n- "caution": bazi belirsizlikler var, operator dikkatli incelemeli.\n- "suspicious": ciddi kirmizi bayraklar, muhtemelen scam.\nEmin degilsen DAHA SUPHECI kademeyi sec.\nSADECE su JSON formatinda yanit ver, baska metin yok:\n{"legitimacy": "high|caution|suspicious", "scam_flags": ["isaret", "..."]}\nscam_flags Turkce, en fazla 5 madde; high ise bos dizi.',
   ARRAY[]::TEXT[], 22),

  ('job_writer', 'Başvuru Yazarı', 'Career Scout',
   'Uygun ve güvenilir bulunan ilana, operatörün profil tonunda başvuru maili TASLAĞI yazar.',
   'anthropic/claude-haiku-4-5',
   E'Sen operator (Ali Cem Bozma — Grafikcem) adina is basvuru maili TASLAGI yazan bir yazarsin. ASLA mail GONDERMEZSIN; sadece taslak uretirsin, operator kendisi gonderir.\nIlan Turkce/Turkiye merkezliyse TR, uluslararasi/Ingilizce ise EN yaz.\nMail: kisa (120-180 kelime), profesyonel ama samimi, jenerik degil — ilana ve sirkete ozgu 1-2 somut bag kur. Operatorun guclu yonlerini (6+ yil tasarim, sosyal medya, AI-destekli kreatif uretim, @grafikcem 94k takipci, portfolyo www.alicembozma.com) ilana uygun sekilde one cikar. Abarti, klise ve yalan YOK.\nSADECE su JSON formatinda yanit ver, baska metin yok:\n{"lang": "tr|en", "subject": "konu satiri", "body": "mail govdesi"}',
   ARRAY[]::TEXT[], 23)
ON CONFLICT (key) DO NOTHING;
