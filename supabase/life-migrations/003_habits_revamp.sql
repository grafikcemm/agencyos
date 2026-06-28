-- =============================================================================
-- 003 — Alışkanlık listesi revizyonu (Life Supabase, ref xcqrk…)
-- =============================================================================
-- Yeni liste (İş / Sağlık / Rutinler):
--   İş:       musteri (var) · x_post (YENİ)
--   Sağlık:   beslenme→"Sağlıklı Beslenme ve Günün Antrenmanı" · su · vitamin · dis (YENİ)
--   Rutinler: buz→"Sabah Yüze Buz + Temizleme Jeli" · nemlendirici (YENİ) · ingilizce
--   Arşiv:    saz, spor (Antrenman beslenme'ye birleşti) → is_active=false
--
-- Idempotent. habit_logs (geçmiş) DOKUNULMAZ — sadece tanım/aktiflik değişir.
-- Bu dosya kanıt amaçlıdır; gerek kalmadıysa (MCP ile uygulandıysa) referans olarak durur.
-- =============================================================================

update habits set is_active = false where key in ('saz', 'spor');

update habits set label = 'Sağlıklı Beslenme ve Günün Antrenmanı' where key = 'beslenme';
update habits set label = 'Sabah Yüze Buz + Temizleme Jeli'        where key = 'buz';

insert into habits (key, label, icon, category, cadence_type, target, sort_order, is_active) values
  ('x_post',       'X paylaşımlarını yap, hesapları gözden geçir', 'megaphone', 'business', 'daily', 1,  9, true),
  ('dis',          'Dişlerini fırçala',                            'smile',     'life',     'daily', 2,  4, true),
  ('nemlendirici', 'Her gün yüze nemlendirici krem',              'sparkles',  'life',     'daily', 1, 12, true)
on conflict (key) do update
  set label        = excluded.label,
      icon         = excluded.icon,
      category     = excluded.category,
      cadence_type = excluded.cadence_type,
      target       = excluded.target,
      sort_order   = excluded.sort_order,
      is_active    = true;
