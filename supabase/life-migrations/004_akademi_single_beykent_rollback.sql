-- Rollback 004 — Beykent AGNO aracını geri al + eski 2-üniversiteli sistemi geri-getir.
-- LIFE Supabase (ref xcqrk…). Manuel uygulanır (SQL Editor).
--
-- DİKKAT: akademi_courses/akademi_exams DROP edilir (kullanıcının girdiği beklenen-not
-- ve manuel sınavlar KAYBOLUR). Eski akademi verisi (AÖF + Beykent) archived=false ile
-- geri açılır ve page.tsx tekrar AcademyShell'e bağlanmalıdır.

drop table if exists akademi_exams;
drop table if exists akademi_courses;

update universities      set archived = false where archived;
update courses           set archived = false where archived;
update exams             set archived = false where archived;
update university_points set archived = false where archived;

-- Yalnız Anadolu AÖF'ü geri açmak istersen (Beykent arşivli kalsın):
--   update courses set archived = false where university_id = '9d29bcd3-ed69-45b6-a1cf-0347c35155dd';
--   update exams   set archived = false where university_id = '9d29bcd3-ed69-45b6-a1cf-0347c35155dd';
