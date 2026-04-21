-- 0. PLAYBOOKS TABLOSUNA UNIQUE CONSTRAINT EKLE (Conflict hatasını önlemek için)
ALTER TABLE playbooks ADD CONSTRAINT playbooks_name_key UNIQUE (name);

-- 1. YENİ PLAYBOOK'LAR EKLE
INSERT INTO playbooks (name, category, description, setup_fee, monthly_fee, pitch_template, steps) VALUES
-- Otomasyon & AI
('Eski Müşteri Canlandırma', 'Otomasyon', 'Eski müşteri veritabanını AI ile yeniden aktive etme kampanyası. Otomatik mesajlaşma, segmentasyon, dönüşüm takibi.', 5000, 3000, 'Eski müşterilerinizin %30-40''u doğru bir mesajla geri dönebilir. Sizin için otomatik canlandırma sistemi kuruyoruz.', ARRAY['Müşteri veritabanı analizi', 'Segment oluşturma', 'AI mesaj şablonları', 'Otomasyon kurulumu', 'Sonuç takibi']),
('AI Chatbot Kurulumu', 'Otomasyon', 'Web sitesi veya WhatsApp için 7/24 müşteri soru-cevap chatbotu. Lead toplama, randevu, fiyat bilgisi otomatik.', 8000, 2500, 'Müşteri sorularının %70''i aynı 10 sorudan oluşuyor. AI chatbot bunları sizin yerinize yanıtlıyor, siz sadece hazır müşteriyle ilgileniyorsunuz.', ARRAY['İhtiyaç analizi', 'Chatbot akışı tasarımı', 'AI eğitimi', 'Entegrasyon', 'Test ve yayın']),
('Lead Generasyon Sistemi', 'Otomasyon', 'Google Maps + AI analiz ile sektörünüze özel potansiyel müşteri bulma ve sıralama sistemi.', 6000, 4000, 'Rakipleriniz hala soğuk arama yapıyor. Siz AI ile günlük 10 hazır müşteri adayına ulaşın.', ARRAY['Hedef sektör belirleme', 'Otomasyon kurulumu', 'AI skorlama', 'CRM entegrasyonu', 'Haftalık rapor']),
('E-posta Otomasyon Sistemi', 'Otomasyon', 'Müşteri davranışına göre tetiklenen otomatik e-posta akışları. Karşılama, teklif takibi, yenileme hatırlatmaları.', 4000, 2000, 'Müşterileriniz teklif aldıktan sonra sessizlik mi? Otomatik takip sistemi dönüşüm oranını %40 artırıyor.', ARRAY['E-posta akışı tasarımı', 'Şablon yazımı', 'Platform kurulumu', 'Segmentasyon', 'A/B test']),
-- Grafik Tasarım
('Kurumsal Kimlik Paketi', 'Tasarım', 'Logo, kartvizit, antet, zarf, imza, sosyal medya kapakları. Tüm marka dokunuşları tek pakette.', 12000, 0, 'Marka kimliğiniz ilk izlenim. Profesyonel görünmek için tek seferlik yatırım yapın, yıllarca kullanın.', ARRAY['Brief toplantısı', 'Konsept geliştirme', 'Logo tasarımı', 'Kurumsal materyaller', 'Dosya teslimi']),
('Ambalaj & Etiket Tasarımı', 'Tasarım', 'Ürün ambalajı, etiket, sticker tasarımı. Baskıya hazır dosyalar ile teslim.', 5000, 0, 'Ürününüz rafta kaybolmasın. Göze çarpan ambalaj tasarımı satışları doğrudan etkiliyor.', ARRAY['Ürün analizi', 'Konsept tasarım', 'Revizyon', 'Baskı dosyası hazırlama', 'Teslim']),
('Sunum & Pitch Deck Tasarımı', 'Tasarım', 'Yatırımcı, müşteri veya toplantı sunumları için profesyonel Powerpoint/Keynote tasarımı.', 4000, 0, 'Fikirleriniz güçlü ama sunum zayıf mı? Profesyonel pitch deck ile ikna oranınızı artırın.', ARRAY['İçerik analizi', 'Şablon tasarımı', 'Slayt kurgusu', 'Revizyon', 'Dosya teslimi']),
('Sosyal Medya İçerik Şablonları', 'Tasarım', 'İşletmeye özel Canva veya Photoshop şablonları. Ekip kolayca düzenleyip yayınlayabilir.', 3500, 0, 'Her hafta sıfırdan tasarım yapmaya son. Hazır şablonlarla dakikada profesyonel içerik üretin.', ARRAY['Marka analizi', 'Şablon seti tasarımı (10 adet)', 'Canva/PSD dosyaları', 'Kullanım rehberi', 'Teslim']),
('Dijital Reklam Görselleri', 'Tasarım', 'Google Ads, Meta Ads, LinkedIn için tüm formatlarda reklam görseli tasarımı. A/B test için varyasyonlar.', 3000, 2500, 'Reklamınız ne kadar iyi olursa olsun kötü görsel tıklanmaz. Dönüşüm odaklı reklam görselleri tasarlıyoruz.', ARRAY['Hedef kitle analizi', 'Konsept geliştirme', 'Tüm format tasarımı', 'Varyasyonlar', 'Dosya teslimi']),
('İnfografik & Data Görselleştirme', 'Tasarım', 'Karmaşık verileri ve süreçleri anlaşılır, paylaşılabilir infografiklere dönüştürme.', 2500, 0, 'Verileriniz hikaye anlatıyor ama kimse okumak istemiyor. İnfografik ile mesajınız 3x daha fazla paylaşılıyor.', ARRAY['Veri analizi', 'Hikaye kurgusu', 'Tasarım', 'Revizyon', 'Teslim']),
('Broşür & Katalog Tasarımı', 'Tasarım', 'Ürün/hizmet katalogları, tanıtım broşürleri, flyer tasarımı. Baskıya hazır ve dijital versiyon.', 3500, 0, 'Müşterinize bıraktığınız materyaller sizi temsil ediyor. Profesyonel baskı materyalleri güven artırıyor.', ARRAY['İçerik toplama', 'Düzen tasarımı', 'Revizyon', 'Baskı dosyası', 'Dijital versiyon']),
('Marka Rehberi (Brand Guideline)', 'Tasarım', 'Logo kullanım kuralları, renk paleti, tipografi, ton ve ses kılavuzu. Tüm marka iletişimini standartlaştırma.', 6000, 0, 'Ekibiniz veya ajanslarınız markanızı tutarsız kullanıyor mu? Brand guideline ile tek ses, tek görünüm.', ARRAY['Marka analizi', 'Kural belirleme', 'Rehber tasarımı', 'PDF dokümantasyon', 'Teslim']),
-- Dijital
('Google Business Profil Yönetimi', 'Dijital', 'Google Maps profili optimizasyonu, fotoğraf yönetimi, yorum takibi, aylık güncelleme.', 1500, 2000, 'Google''da arandığında bulunamıyorsanız var olmuyorsunuz. Google Business profilinizi optimize edip öne çıkarıyoruz.', ARRAY['Profil denetimi', 'Optimizasyon', 'Fotoğraf yükleme', 'Kategori ayarı', 'Aylık güncelleme']),
('Instagram Profil Optimizasyonu', 'Dijital', 'Bio optimizasyonu, highlight tasarımı, profil fotoğrafı, link in bio kurulumu. İlk izlenim paketi.', 2500, 0, 'Instagram profiliniz ziyaretçiyi 3 saniyede ya kazanır ya kaybeder. Dönüşüm odaklı profil kuruyoruz.', ARRAY['Profil analizi', 'Bio yazımı', 'Highlight kapak tasarımı', 'Link in bio kurulumu', 'Öneriler raporu']),
-- Strateji
('Rakip Analizi Raporu', 'Strateji', 'Sektördeki 5-10 rakibin dijital varlık, sosyal medya, fiyatlandırma ve konumlandırma analizi.', 3000, 0, 'Rakibiniz ne yapıyor, neden müşteri çekiyor? Veri bazlı rakip analizi ile boşlukları bulup fırsata çeviriyoruz.', ARRAY['Rakip belirleme', 'Dijital varlık analizi', 'Sosyal medya analizi', 'SWOT', 'Rapor sunumu'])
ON CONFLICT (name) DO NOTHING;

-- 2. LEADS TABLOSUNA PRIORITY EKLE
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- 3. MEVCUT LEADLERİ GÜNCELLE
UPDATE leads
SET priority = 'high'
WHERE (has_website = false OR website IS NULL OR website = '')
  AND (phone IS NOT NULL AND phone != '');

UPDATE leads
SET priority = 'low'
WHERE (phone IS NULL OR phone = '');
