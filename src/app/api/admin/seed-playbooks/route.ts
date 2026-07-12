import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

const DEFAULT_PLAYBOOKS = [
  // ============================================
  // STANDART HİZMETLER (10 Adet Orijinal Hizmet)
  // ============================================
  {
    name: 'Logo & Marka Kimliği',
    category: 'Tasarım',
    tier: 'Starter',
    description: 'Profesyonel logo tasarımı, marka renk paleti, tipografi kılavuzu ve temel marka kimliği dosyaları.',
    setup_fee: 5000,
    monthly_fee: 0,
    setup_fee_usd: 150,
    monthly_fee_usd: 0,
    is_active: true,
    scope_items: [
      '3 alternatif özgün logo konsepti',
      'Kurumsal renk paleti ve HSL kodları',
      'Tipografi ve yazı tipi kılavuzu',
      'Vektörel kaynak dosyalar (.AI, .PDF, .PNG)',
      'Sosyal medya için optimize edilmiş profil dairesi sürümü'
    ],
    target_sectors: ['Yeni Girişimler', 'KOBİ', 'Restoranlar', 'Danışmanlar'],
    delivery_days: 5,
    monthly_income_potential: 3,
    pitch_template: 'Markanızın ilk izlenimi logonuzla başlar. Güçlü, akılda kalıcı ve profesyonel bir kimlik için Logo & Marka Kimliği paketimizi sunuyoruz. Tek seferlik ₺5.000 yatırımla rakiplerinizden sıyrılın.',
    steps: [
      'Brifing toplantısı ve rakip analizi',
      'Konsept geliştirme (3 farklı seçenek sunumu)',
      'Seçilen logo üzerinde revizyon turu',
      'Final vektörel kaynak dosyaların teslimi'
    ],
    problem_story: 'Yeni başlayan işletmeler logo ve marka kimliğine önem vermediklerinde profesyonellikten uzak bir algı yaratıyor ve yüksek kaliteli müşterileri kaçırıyor.',
    value_story: 'Profesyonel kurumsal kimlik, müşterilerinizde anında güven oluşturur ve hizmet fiyatlarınızı daha yüksek konumlandırmanızı sağlar.',
    sales_script: '"Yeni projenizde veya mevcut markanızda rakiplerinizden hemen sıyrılmak için profesyonel bir logoya ihtiyacınız var. Sadece ₺5.000 tek seferlik yatırımla kurumsal duruşunuzu tamamlayalım. Test edelim mi?"'
  },
  {
    name: 'Sosyal Medya Yönetimi',
    category: 'Dijital',
    tier: 'Growth',
    description: 'Aylık 20 post, story yönetimi, hashtag stratejisi, etkileşim takibi ve aylık rapor.',
    setup_fee: 2000,
    monthly_fee: 8000,
    setup_fee_usd: 60,
    monthly_fee_usd: 250,
    is_active: true,
    scope_items: [
      'Aylık 20 özgün içerik postu',
      'Haftalık 5-8 adet trend story paylaşımı',
      'Hashtag stratejisi ve sektörel araştırma',
      'Gelen mesaj ve yorum etkileşim takibi',
      'Aylık performans analiz ve ciro raporu'
    ],
    target_sectors: ['Yerel İşletmeler', 'Klinikler', 'E-Ticaret Firmaları', 'Güzellik Salonları'],
    delivery_days: 14,
    monthly_income_potential: 5,
    pitch_template: 'Sosyal medyanızı düzenli ve profesyonel tutmak artık çok daha kolay. Aylık ₺8.000 ile tüm içerik üretimi, planlama ve yayınlama işlerini biz üstleniyoruz. Siz işinize odaklanın, biz dijital varlığınızı büyütelim.',
    steps: [
      'Aylık içerik takvimi ve konsept tasarımı',
      'Görsel şablonların ve metinlerin üretimi',
      'Sosyal medya planlayıcı ile zamanlı yayınlama',
      'Aylık etkileşim ve erişim analizi raporu'
    ],
    problem_story: 'İşletmeler her gün içerik bulmak ve tasarlamak için saatler harcıyor, yine de profesyonellikten uzak amatör bir görüntü sergiliyorlar.',
    value_story: 'Sosyal medyanızı tamamen üstlenerek markanıza profesyonel bir görünüm kazandırıyor ve potansiyel müşterilere 7/24 güven aşılıyoruz.',
    sales_script: '"Sosyal medyanızla uğraşmaktan asıl işinize odaklanamıyor musunuz? Aylık ₺8.000 ile tüm içerik yönetimini üstlenelim, dijital cironuzu ve prestijinizi artıralım. Birlikte planlayalım mı?"'
  },
  {
    name: 'Web Sitesi Tasarımı',
    category: 'Dijital',
    tier: 'Premium',
    description: 'Modern, mobil uyumlu kurumsal web sitesi. Hosting, domain kurulumu ve aylık teknik bakım dahil.',
    setup_fee: 15000,
    monthly_fee: 2000,
    setup_fee_usd: 450,
    monthly_fee_usd: 60,
    is_active: true,
    scope_items: [
      'Modern, hızlı ve mobil uyumlu tasarım',
      'Hosting ve alan adı (domain) kurulumu',
      'Temel sayfa içi SEO optimizasyonu',
      'İletişim formu ve dinamik WhatsApp butonu',
      'Aylık teknik bakım, yedekleme ve güvenlik takibi'
    ],
    target_sectors: ['Hizmet Sektörü', 'KOBİ\'ler', 'Sanayi Firmaları', 'İnşaat Şirketleri'],
    delivery_days: 10,
    monthly_income_potential: 6,
    pitch_template: 'Web siteniz olmadan Google\'da görünmek imkânsız. Kurulum ücreti ₺15.000, aylık bakım ₺2.000 ile işletmenizi 7/24 çalışan bir satış noktasına dönüştürün.',
    steps: [
      'Alan adı & bulut hosting kurulumu',
      'UX/UI tasarım şablonlarının geliştirilmesi',
      'Metin ve görsel içeriklerin yerleştirilmesi',
      'Hız ve SEO testleri sonrası yayınlama',
      'Aylık teknik yedekleme ve sistem bakımı'
    ],
    problem_story: 'Potansiyel müşteriler Google\'da arama yaptıklarında web siteniz yoksa sizi ciddiye almazlar ya da doğrudan siteleri olan rakiplerinize giderler.',
    value_story: 'İşletmenizi 7/24 kesintisiz çalışan bir dijital şubeye dönüştürüyoruz, Google aramalarında bulunabilir olmanızı ve yeni leadler toplamanızı sağlıyoruz.',
    sales_script: '"Kullanıcı dostu, hızlı ve SEO uyumlu kurumsal bir web sitesiyle Google\'daki yerinizi alın. Müşterileriniz sizi dijitalde de bulsun. Detayları görüşmek için yarın uygun musunuz?"'
  },
  {
    name: 'AI Görsel Üretimi',
    category: 'Dijital',
    tier: 'Growth',
    description: 'Aylık 30 adet yapay zeka destekli ürün, kampanya ve sosyal medya görseli. Hızlı, ekonomik, özgün.',
    setup_fee: 0,
    monthly_fee: 5000,
    setup_fee_usd: 0,
    monthly_fee_usd: 150,
    is_active: true,
    scope_items: [
      'Yapay zeka (AI) ile aylık 30 özgün kreatif görsel',
      'Ürün fotoğraflarının sanatsal arka planlarda yeniden görselleştirilmesi',
      'Marka stiline özel prompt kütüphanesi hazırlığı',
      'Yüksek çözünürlüklü (HD) dijital teslimler'
    ],
    target_sectors: ['D2C Markaları', 'E-Ticaret Satıcıları', 'Kozmetik Markaları', 'Butik Restoranlar'],
    delivery_days: 5,
    monthly_income_potential: 4,
    pitch_template: 'Profesyonel fotoğraf çekimi yaptırmadan, stok görsel satın almadan — yapay zeka ile işletmenize özel, özgün görseller. Aylık ₺5.000\'e 30 görseli hazır edin.',
    steps: [
      'Marka stili ve renk paleti belirleme',
      'Yapay zeka prompt kütüphanesinin oluşturulması',
      'Aylık görsel üretimi ve kalite optimizasyonu',
      'Son rötuşlar sonrası yüksek çözünürlüklü teslim'
    ],
    problem_story: 'Profesyonel fotoğraf çekimi yaptırmak çok maliyetli ve uzun zaman alıyor; hazır stok görseller ise ruhsuz, jenerik ve rakiplerle aynı kalıyor.',
    value_story: 'Yapay zekanın sınırsız yaratıcı gücüyle, ürünlerinizi büyüleyici sanatsal arka planlarda sıfır çekim maliyetiyle sergilemenizi ve tıklama oranlarını 3 katına çıkarmanızı sağlıyoruz.',
    sales_script: '"Büyük bütçeli fotoğraf stüdyolarına son verelim. Yapay zeka ile ürünlerinizi lüks stüdyolarda çekilmiş gibi aylık ₺5.000\'e 30 özgün görselle hazırlayalım. Örnek çalışmalara göz atalım mı?"'
  },
  {
    name: 'Kurumsal Kimlik Paketi',
    category: 'Paket',
    tier: 'Growth',
    description: 'Logo, kartvizit, antetli kağıt, zarf, sosyal medya profil görselleri ve kapak fotoğrafları.',
    setup_fee: 12000,
    monthly_fee: 0,
    setup_fee_usd: 350,
    monthly_fee_usd: 0,
    is_active: true,
    scope_items: [
      'Profesyonel logo ve amblem tasarımı',
      'Kartvizit ve antetli kağıt baskı tasarımları',
      'Kurumsal zarf ve e-posta imza şablonu',
      'Sosyal medya profil ve kapak/banner tasarımları',
      'Kapsamlı PDF Marka Kılavuzu (Brand Book)'
    ],
    target_sectors: ['Yeni Kurulan Firmalar', 'Hukuk Büroları', 'İnşaat Şirketleri', 'Medikal Klinikler'],
    delivery_days: 7,
    monthly_income_potential: 4,
    pitch_template: 'Kurumsal kimliğinizi tek seferde tamamlayın. Logo\'dan kartvizite, sosyal medya profilinden antetli kağıda — ₺12.000\'e tam bir marka paketi.',
    steps: [
      'Brifing ve kurumsal marka analizi',
      'Logo tasarımı ve kurumsal renk kodlarının tespiti',
      'Kırtasiye ve sosyal medya görsellerinin tasarımı',
      'Baskıya hazır kaynak dosyalar ve PDF kılavuz teslimi'
    ],
    problem_story: 'Farklı mecralarda farklı yazı tipleri, renkler ve logolar kullanılması kurumsal ciddiyetinizi zedeliyor ve müşteride güvensizlik yaratıyor.',
    value_story: 'Tüm mecralarda tek ses ve bütünsel bir vizyonla hareket ederek işletmenizin prestijini, algılanan değerini ve güvenilirliğini katlıyorsunuz.',
    sales_script: '"A\'dan Z\'ye tüm marka dokunuşlarınızı tek bir kurumsal kimlik paketinde birleştirelim. Tek seferlik ₺12.000\'e eksiksiz marka lansmanınızı yapıp baskıya hazır dosyalarınızı teslim edelim. Uygun mudur?"'
  },
  {
    name: 'Güzellik Salonu Dijital Paketi',
    category: 'Paket',
    tier: 'Starter',
    description: 'Güzellik salonları için özel: logo, 20 Instagram şablonu, Google İşletmem optimizasyonu ve aylık içerik desteği.',
    setup_fee: 5500,
    monthly_fee: 3000,
    setup_fee_usd: 160,
    monthly_fee_usd: 90,
    is_active: true,
    scope_items: [
      'Güzellik salonuna özel şık logo tasarımı',
      'Sürükle-bırak uyumlu 20 Instagram Canva şablon seti',
      'Google İşletmem (Maps) profil optimizasyonu ve yerel SEO',
      'Aylık içerik planı ve temel reklam kurulumu desteği'
    ],
    target_sectors: ['Güzellik Salonları', 'Kuaförler', 'Lazer Epilasyon Merkezleri', 'Cilt Bakım Klinikler'],
    delivery_days: 7,
    monthly_income_potential: 5,
    pitch_template: 'Güzellik salonunuzu Instagram\'da öne çıkaralım. Logo + 20 özel şablon + Google profilinizin optimizasyonu. Kurulum ₺5.500, aylık destek ₺3.000.',
    steps: [
      'Salon tarzına uygun logo ve renk paleti tasarımı',
      'Instagram için estetik Canva şablon setinin oluşturulması',
      'Google Maps yerel harita ve profil optimizasyonu',
      'Aylık içerik ve reklam stratejisinin teslimi'
    ],
    problem_story: 'Güzellik salonları yerel müşterilere ulaşmada ve Instagram\'da kaliteli, lüks ve estetik bir görünüm yakalamakta zorlanıyor.',
    value_story: 'Instagram\'da pırıl pırıl, lüks ve çekici bir marka algısı oluşturarak randevularınızı yerel harita desteğiyle doldurmanıza yardımcı oluyoruz.',
    sales_script: '"Salonunuzun kapısından daha çok müşterinin girmesi için hem haritalarda yerel aramada öne çıkalım hem de Instagram profilinizi göz alıcı hale getirelim. Randevuları doldurmaya başlayalım mı?"'
  },
  {
    name: 'Kafe & Restoran Dijital Paketi',
    category: 'Paket',
    tier: 'Growth',
    description: 'Kafe ve restoranlar için: logo, dijital menü, sosyal medya yönetimi ve AI görsel üretimi.',
    setup_fee: 6000,
    monthly_fee: 4000,
    setup_fee_usd: 180,
    monthly_fee_usd: 120,
    is_active: true,
    scope_items: [
      'Kurumsal menü ve logo güncellemesi',
      'Dinamik QR kodlu dijital menü entegrasyonu',
      'Aylık sosyal medya içerik ve hashtag planlaması',
      'Yapay zeka ile iştah açıcı yemek görselleri üretimi'
    ],
    target_sectors: ['Kafeler', 'Restoranlar', 'Gurme Gurular', 'Fast-Food Şubeleri'],
    delivery_days: 7,
    monthly_income_potential: 6,
    pitch_template: 'Müşterileriniz gelip gitmeden önce sizi internette buluyor. Kafe & Restoran Paketimizle logo, dijital menü ve sosyal medya yönetimini bir arada sunuyoruz. Kurulum ₺6.000, aylık ₺4.000.',
    steps: [
      'Restoran marka ve logo tarzının güncellenmesi',
      'Dinamik fiyat güncellenebilir QR dijital menü tasarımı',
      'Aylık sosyal medya paylaşım takviminin kurgulanması',
      'Yemekler için iştah açıcı yapay zeka görsellerinin üretimi'
    ],
    problem_story: 'Eski basılı menülerin fiyat güncelleme maliyeti çok yüksek ve müşteriler restorana gelmeden önce internetten menüyü ve görselleri arıyor.',
    value_story: 'Saniyeler içinde güncellenebilen şık bir dijital menü ve ağız sulandıran AI yemek görselleri ile restoranınızın dijital prestijini ve cirosunu artırıyoruz.',
    sales_script: '"Fiyatları her değiştirdiğinizde menü basım masrafı yapmaktan sıkılmadınız mı? QR menü entegrasyonu ve ağız sulandıran AI yemek görsellerimizle restoranınızın ciro potansiyelini yükseltelim. Deneyelim mi?"'
  },
  {
    name: 'Sosyal Medya Şablon Seti',
    category: 'Tasarım',
    tier: 'Starter',
    description: '30 adet düzenlenebilir Instagram ve Facebook post şablonu. Marka renklerine uygun, Canva üzerinden teslim.',
    setup_fee: 3500,
    monthly_fee: 0,
    setup_fee_usd: 100,
    monthly_fee_usd: 0,
    is_active: true,
    scope_items: [
      '30 adet tamamen düzenlenebilir Instagram post şablonu',
      'Marka yazı tipi ve renk kodlarının Canva\'ya entegrasyonu',
      'Farklı içerik türleri için (Teklif, Bilgi, Alıntı) düzenler',
      'Canva şablonları için ömür boyu düzenleme erişimi'
    ],
    target_sectors: ['Yaşam Koçları', 'Bireysel Danışmanlar', 'Emlak Danışmanları', 'Eğitmenler'],
    delivery_days: 4,
    monthly_income_potential: 3,
    pitch_template: 'Kendi sosyal medyanızı kendiniz yönetmek istiyorsanız ama profesyonel görünmekten ödün vermiyorsanız — 30 adet hazır şablon tam size göre. Tek seferlik ₺3.500.',
    steps: [
      'Girişimci / işletme marka tarzının analizi',
      'Canva üzerinde 30 adet şablon tasarımının kurgulanması',
      'Müşterinin Canva hesabına şablonların aktarılması',
      'Sürükle-bırak kullanım ve yazı tipi kılavuzu teslimi'
    ],
    problem_story: 'Kendi içeriklerini üretmeye çalışan girişimciler Canva\'da jenerik, sıradan şablonlar kullanarak rakipleri arasında kayboluyor ve kurumsal durmuyor.',
    value_story: 'Sadece sürükle-bırak yaparak ve renkleri marka renginize uyarlayarak 1 dakikada kurumsal, estetik ve prestijli içerikler üretmenizi sağlıyoruz.',
    sales_script: '"Sosyal medya paylaşımlarınızı kendiniz mi hazırlıyorsunuz? Marka tarzınıza göre uyarlanmış 30 özel şablonla dakikalar içinde profesyonel paylaşımlar hazırlayın. Örnek şablonları göstereyim mi?"'
  },
  {
    name: 'SEO & Google İşletmem',
    category: 'Strateji',
    tier: 'Starter',
    description: 'Google İşletmem optimizasyonu, temel SEO kurulumu, anahtar kelime analizi ve aylık takip raporu.',
    setup_fee: 2500,
    monthly_fee: 3000,
    setup_fee_usd: 75,
    monthly_fee_usd: 90,
    is_active: true,
    scope_items: [
      'Google Haritalar profil kurulumu, onay ve optimizasyonu',
      'Yerel anahtar kelime araştırması ve rakip analizi',
      'Yorum artırma ve anlık yanıtlama stratejisi şablonu',
      'Aylık arama gösterimi ve sıralama raporları'
    ],
    target_sectors: ['Tesisatçılar', 'Diş Hekimleri', 'Yerel Hizmet Sağlayıcılar', 'Yerel Mağazalar'],
    delivery_days: 5,
    monthly_income_potential: 4,
    pitch_template: 'Google\'da ilk sayfada çıkmak artık zorunluluk. SEO & Google İşletmem paketiyle yerel aramalarda üst sıralara yükselmenizi sağlıyoruz. Kurulum ₺2.500, aylık ₺3.000.',
    steps: [
      'Google İşletmem harita kaydı ve profil doğrulama',
      'Hizmet alanına uygun anahtar kelime analizi',
      'Sayfa içi meta başlık ve yerel SEO optimizasyonu',
      'Aylık harita arama sıralama raporunun sunulması'
    ],
    problem_story: 'Yakındaki potansiyel müşteriler Google Maps\'te arama yaptıklarında sadece rakiplerinizi görüp sizi hiç fark etmiyorlar.',
    value_story: 'Sizi yerel harita ve arama sonuçlarında ilk 3 sıraya taşıyarak doğrudan organik telefon aramaları ve fiziki şube ziyaretleri sağlıyoruz.',
    sales_script: '"Bölgenizde arama yapıldığında ilk sırada çıkmak ister misiniz? Harita ve yerel SEO çalışmamızla aylık ₺3.000 karşılığında aramaları doğrudan size çekelim. Profilinizi hemen inceleyelim mi?"'
  },
  {
    name: 'Ambalaj & Etiket Tasarımı',
    category: 'Tasarım',
    tier: 'Growth',
    description: 'Ürün ambalajı, etiket, sticker ve kutu tasarımı. Baskıya hazır dosyalar dahil.',
    setup_fee: 5000,
    monthly_fee: 0,
    setup_fee_usd: 150,
    monthly_fee_usd: 0,
    is_active: true,
    scope_items: [
      'Özgün kutu, şişe veya ambalaj dış tasarımı',
      'Baskıya hazır PDF, AI ve vektörel formatlarda teslim',
      'Farklı ürün çeşitleri için etiket ve sticker varyasyonları',
      'Karton, kağıt ve malzeme seçimi matbaa danışmanlığı'
    ],
    target_sectors: ['Butik Üreticiler', 'Kozmetik Markaları', 'Gıda & Sos Üreticileri', 'Kahve Kavurucuları'],
    delivery_days: 6,
    monthly_income_potential: 4,
    pitch_template: 'Ürününüzün paketi, satın alma kararının %70\'ini etkiliyor. Profesyonel ambalaj & etiket tasarımıyla rakiplerinizin önüne geçin. Tek seferlik ₺5.000.',
    steps: [
      'Ürün hedefleri ve kutu ölçülerinin alınması',
      'Marka kimliğine uygun 2 farklı ambalaj konsepti tasarımı',
      'Seçilen tasarım üzerinde revizyonların yapılması',
      'Matbaa için baskıya hazır kaynak dosyaların teslimi'
    ],
    problem_story: 'Harika bir ürününüz var ama ambalajı sıradan, jenerik veya kalitesiz göründüğü için rafta dikkat çekmiyor ve premium fiyattan satılamıyor.',
    value_story: 'Tüketicinin eline aldığında lüks, kaliteli ve değerli hissedeceği, markanızı üst segmente taşıyacak büyüleyici ambalaj tasarımları yapıyoruz.',
    sales_script: '"Ürününüzün hak ettiği yüksek fiyattan satılması ve rafta anında parlaması için profesyonel ambalaj tasarımını hemen başlatalım. Tek seferlik ₺5.000 yatırımla ciro potansiyelinizi artıralım."'
  },

  // ============================================
  // YAPAY ZEKÂ VE OTOMASYON HİZMETLERİ (11 Adet)
  // ============================================
  {
    name: 'Eski Müşteri Canlandırma',
    category: 'Yenileme & Geri Kazanım',
    tier: 'Premium',
    description: 'Sıfır reklam bütçesiyle %1200 ROI. CRM\'de birikmiş eski leadleri ve pasif müşterileri geri kazanma motoru.',
    setup_fee: 100000,
    monthly_fee: 12000,
    setup_fee_usd: 3000,
    monthly_fee_usd: 400,
    is_active: true,
    scope_items: [
      'CRM datası export & temizliği',
      'Claude AI destekli duygusal analiz & segmentasyon',
      'Kişiselleştirilmiş drip e-posta/WhatsApp kampanyası',
      'Persona bazlı 3-5 mesajlık otomasyon serisi',
      'A/B test setleri ve conversion tracking',
      'Dönüşüm & booking akışı entegrasyonu'
    ],
    target_sectors: ['Spor Salonu', 'Diş Kliniği', 'SaaS', '500+ leadi olan her firma'],
    delivery_days: 10,
    monthly_income_potential: 4,
    pitch_template: 'CRM\'nizde son 2 yılda dönüşmemiş kaç lead var? 0 bütçeyle %3 dönüşümle bile binlerce liralık ekstra gelir sağlayabiliriz. Birlikte inceleyelim mi?',
    steps: [
      'Müşteri veri tabanını dışa aktar ve AI segmentasyonu yap',
      'Teklife ve ilgiye duyarlı 3-5 adımdan oluşan drip kampanya kurgula',
      'İlk 60 gün ROI analizi yap ve anlık dashboard entegre et',
      'Müşteriye dönüşen leadleri sisteme aktar'
    ],
    problem_story: 'CRM\'de 4000 eski üye/lead birikmiş. Kimse bu kişilere ulaşmıyor. Yeni bütçeyi sürekli yeni edinime harcıyorsun. Oysa birikmiş liste zaten reklam parası ödenmiş hazır altın.',
    value_story: 'Spor salonu örneği: 4000 CRM, %3 dönüşüm = 120 yeni üye × $30-50 = $32-48K sıfır reklam harcaması. %1200 ROI ilk 60 gün (sektör ortalaması). Sistem maliyeti $10-15K bir kez + süreklilik.',
    sales_script: '"CRM\'nizde son 2 yılda dönüşmemiş kaç lead var? 0 bütçeyle listeyi segmente edip %3 dönüşümle bile sıfır reklam bütçesi ile $32K-$48K ekstra gelir getirebiliriz. Listeyi birlikte inceleyelim mi?"',
    sample_metrics: {
      "ad_spend": 0,
      "database_size": 4000,
      "conversion_rate": "3-4%",
      "revenue_per_convert": "$30-50",
      "total_extra_revenue": "$32,000-48,000",
      "reported_roi_first_60_days": "1200%"
    },
    app_notes: 'CRM export → Claude Code ile segmentasyon (son temas tarihi, engagement skoru, intent sinyalleri) + sentiment analizi → persona başına 3-5 mesajlık drip kampanya → dönüş + booking akışı.',
    anti_patterns: 'ASLA "eski CRM\'ne mesaj atıyorum" deme. "Sıfır reklam bütçesiyle $48K ekstra gelir" de. Somut rakamla kapat.'
  },
  {
    name: 'Belge İşleme Otomasyonu',
    category: 'Belge & Uyum',
    tier: 'Growth',
    description: 'Belge başına 15 dk → 2 dk, hata oranı %0. AI tabanlı otomatik fatura, irsaliye, sözleşme ve evrak sınıflandırma.',
    setup_fee: 15000,
    monthly_fee: 8000,
    setup_fee_usd: 500,
    monthly_fee_usd: 250,
    is_active: true,
    scope_items: [
      'AI OCR evrak okuma entegrasyonu',
      'e-Fatura / e-İrsaliye otomatik uyum kontrolü',
      'Belge sınıflandırma & eksik evrak takibi',
      'Özel durum alarm sistemi',
      'Dahili ERP/Muhasebe yazılımı API eşleştirmesi'
    ],
    target_sectors: ['Fabrikalar', 'Muhasebe Ofisleri', 'Hukuk Büroları', 'Sigorta Şirketleri'],
    delivery_days: 7,
    monthly_income_potential: 5,
    pitch_template: 'Gelen evrakları tek tek sisteme girmekle saatlerinizi kaybetmeyin. AI OCR ile faturaları, sözleşmeleri ve irsaliyeleri saniyeler içinde sıfır hatayla okuyup kaydedelim.',
    steps: [
      'OCR motoru entegrasyonu ve evrak şablonlarının çıkarılması',
      'Eksik bilgi/imza doğrulaması için kural tabanlı yapay zeka entegrasyonu',
      'Arşivleme and ERP veri aktarım boru hattının kurulması'
    ],
    problem_story: 'Operasyon ekipleri her gün binlerce nakliye faturası, irsaliye veya beyannameyi elle sisteme girmeye çalışıyor. Bu hem zaman alıyor hem de hatalı girişlerden dolayı mali cezalara yol açıyor.',
    value_story: 'Ayda 5000 nakliye irsaliyesi işleyen lojistik firmasında işlem süresi evrak başına 12 dakikadan 45 saniyeye düştü. Hata oranı %3\'ten %0.01\'e geriledi. Operasyon ekibi 3 tam iş gününe eşdeğer zaman kazandı.',
    sales_script: '"Faturaları veya sözleşmeleri manuel işlemek için kaç saat harcıyorsunuz? AI ile işlem süresini %90 kısaltıp hata oranını sıfırlayabiliriz. Sistem nasıl çalışıyor göstermemi ister misiniz?"',
    sample_metrics: {
      "process_time_before": "12-15 dk",
      "process_time_after": "45-60 sn",
      "error_rate_before": "3.2%",
      "error_rate_after": "0.01%",
      "operational_savings": "Aylık ~120 saat",
      "reported_roi_first_60_days": "450%"
    },
    app_notes: 'LlamaIndex/DocumentIntelligence ile fatura/irsaliye pdf\'lerini OCR\'dan geçir → Json çıktısını al → e-Belge standartlarına göre doğrulama kurallarını çalıştır → Muhasebe yazılımına push et.',
    anti_patterns: 'Belge okumayı "jenerik AI" olarak pazarlama. "Belge başına 12 dakika tasarruf ve yasal hata güvencesi" diyerek sat.'
  },
  {
    name: 'Takip Zincirleri',
    category: 'Randevu & Hızlı Dönüş',
    tier: 'Starter',
    description: '5 adımlı kişiselleleştirilmiş takip → dönüşüm 3x. Randevu almayan lead\'leri kaçırmayın.',
    setup_fee: 5000,
    monthly_fee: 6000,
    setup_fee_usd: 200,
    monthly_fee_usd: 180,
    is_active: true,
    scope_items: [
      'Multi-channel follow-up zinciri (SMS, E-posta, WhatsApp)',
      'Otomatik randevu planlayıcı entegrasyonu',
      'No-show kurtarma senaryoları',
      'Lead durumu tetikleyicileri'
    ],
    target_sectors: ['Koçlar', 'Ajanslar', 'Danışmanlar', 'B2B Girişimler'],
    delivery_days: 3,
    monthly_income_potential: 8,
    pitch_template: 'Leadlerinizin %70\'inin ilk mesajdan sonra randevu almadığını biliyor musunuz? 5 adımlı akıllı takip zincirlerimizle randevu oranınızı 3 katına çıkaralım.',
    steps: [
      'Randevu almayan leadler için 5 adımlı akış şeması tasarlama',
      'WhatsApp ve E-posta otomasyon araçlarının bağlanması',
      'Tek tıkla randevu oluşturma linki entegrasyonu'
    ],
    problem_story: 'Kullanıcı reklamdan veya formdan formu dolduruyor. İlk mesaja cevap verip randevuya gelmiyor ya da tekliften sonra kayboluyor. Ekiplerin manuel olarak tek tek bunları aramaya veya yazmaya vakti yok.',
    value_story: 'Danışmanlık firması aylık 200 form alıyordu. Eskiden randevuya dönüşme oranı %18 iken, 5 adımlı akıllı takip zinciri sonrası randevu oranı %52\'ye yükseldi. Reklam harcaması ROI\'si 2.8 katına çıktı.',
    sales_script: '"Form doldurup kaybolan veya randevuya gelmeyen müşteriler için ne kadar bütçe kaybediyorsunuz? Akıllı takip zincirimizle no-show oranlarını %60 azaltabiliriz."',
    sample_metrics: {
      "leads_followed_up": "100%",
      "booking_rate_before": "18%",
      "booking_rate_after": "52%",
      "no_show_rate_before": "25%",
      "no_show_rate_after": "8%",
      "reported_roi_first_60_days": "350%"
    },
    app_notes: 'Typeform/Calendly webhook tetikleyicisi → Randevu yoksa 2. saat, 1. gün, 3. gün kişiselleştirilmiş SMS/WA mesajları gönder → Randevu alındığı an akışı otomatik durdur.',
    anti_patterns: 'Sürekli spam atan bir yapı kurma. Her adımda gerçekten değer katan içerik veya teklif sun. Araya bekleme sürelerini doğru koy.'
  },
  {
    name: 'Dahili Raporlama',
    category: 'Yönetim Masası',
    tier: 'Growth',
    description: 'Birden fazla araç → tek dashboard, saatler → saniyeler. Kârlılığınızı ve satış ekiplerinizi gerçek zamanlı izleyin.',
    setup_fee: 10000,
    monthly_fee: 9000,
    setup_fee_usd: 350,
    monthly_fee_usd: 300,
    is_active: true,
    scope_items: [
      'CEO / Kurucu özel yönetim ekranı',
      'Meta, Google & CRM veri entegrasyonu',
      'Satış boru hattı (pipeline) sağlığı',
      'Ekip performansı izleyici',
      'Haftalık anomali uyarıları'
    ],
    target_sectors: ['Çok Araçlı İşletmeler', 'İnşaat', 'Satış Ekipleri', 'Marketing Departmanları'],
    delivery_days: 5,
    monthly_income_potential: 6,
    pitch_template: 'Hangi pazarlama kanalının ne kadar kazandırdığını veya satış ekibinin anlık performansını excel tablolarında aramayın. Tüm verinizi tek bir premium ekranda toplayalım.',
    steps: [
      'Pazarlama ve CRM araçlarının API bağlantılarının yapılması',
      'Tek ekranda kârlılık, ROI ve satış hızı metriklerinin tasarlanması',
      'Haftalık otomatik AI rapor özetlerinin kurulması'
    ],
    problem_story: 'Kurucu şirketin kârlılığını, hangi satış temsilcisinin ne kadar ciro yaptığını veya hangi reklamın ROI getirdiğini görmek için 5 farklı sisteme girmek zorunda kalıyor. Haftalık raporlama için asistanlar saatlerce excel hazırlıyor.',
    value_story: 'Çok lokasyonlu bir diş kliniği zincirinde tüm şubelerin günlük ciro, reklam harcaması geri dönüşü ve randevu oranları tek panelde toplandı. Rapor hazırlama süresi haftalık 8 saatten 0\'a düştü, karar alma hızı 4x arttı.',
    sales_script: '"Şu an kârlılığınızı ve satış ekibinizin anlık performansını görmek için kaç farklı ekrana bakıyorsunuz? Tek panelde gerçek zamanlı CEO dashboard\'u kuralım."',
    sample_metrics: {
      "data_sources": "Meta + Google + CRM + ERP",
      "reporting_time_before": "Haftalık 8 saat",
      "reporting_time_after": "0 saat (Real-time)",
      "decision_speed": "4x Hızlanma",
      "anomaly_detection": "Anında uyarı",
      "reported_roi_first_60_days": "200%"
    },
    app_notes: 'Supabase real-time veri dinleme + Stripe/Iyzico + Google Ads + Meta Ads API bağlantıları → Unified Data Warehouse şeması → DashboardClient Recharts ekran entegrasyonu.',
    anti_patterns: 'Karmaşık yüzlerce grafik koyma. CEO\'nun bilmesi gereken 3 ana metrik (Gelir, Gider, ROI) en tepede en büyük boyutta olmalı.'
  },
  {
    name: 'Outbound Copywriting Ustalığı',
    category: 'AI Reklam Lab',
    tier: 'Growth',
    description: '4 adım + 7 psikoloji prensibi → tanımadığın birine satış. Soğuk outreach mesajları ve reklam metinleri.',
    setup_fee: 7500,
    monthly_fee: 11000,
    setup_fee_usd: 250,
    monthly_fee_usd: 350,
    is_active: true,
    scope_items: [
      '7 psikolojik ikna prensibi entegre edilmiş şablonlar',
      'Sektöre özel cold-email ve DM mesaj serileri',
      'AI destekli kreatif reklam metni varyasyonları',
      'Kişiselleştirilmiş hook & CTA kütüphanesi'
    ],
    target_sectors: ['Tüm B2B Sektörler', 'E-Ticaret', 'SaaS', 'Hizmet Firmaları'],
    delivery_days: 5,
    monthly_income_potential: 6,
    pitch_template: 'Gönderdiğiniz soğuk mesajların neden yanıt almadığını biliyor musunuz? 4 adım ve 7 psikoloji prensibiyle yazılmış yeni cold-outreach metinlerimizle yanıt oranınızı 4x artıralım.',
    steps: [
      'Hedef kitlenin acı noktalarının ve motivasyonlarının haritalanması',
      '4 adımlı AIDA (Attention, Interest, Desire, Action) akışının kurulması',
      'Farklı kitleler için 5 alternatif mesaj setinin hazırlanması'
    ],
    problem_story: 'Outreach yaparken veya soğuk e-posta gönderirken jenerik, uzun ve sıkıcı "biz harika bir ajansız" mesajları atılıyor. Bu mesajların açılma oranları %10\'un, yanıt oranları %1\'in altında kalıyor.',
    value_story: 'B2B lojistik yazılımı satan bir KOBİ\'de soğuk LinkedIn mesajlarının yanıt oranı %2.1\'den %14.8\'e çıktı. 30 günde 18 yeni demo randevusu alındı. Satış boru hattı 220 bin TL büyüdü.',
    sample_metrics: {
      "open_rate_before": "12-15%",
      "open_rate_after": "45-50%",
      "response_rate_before": "0.8%",
      "response_rate_after": "6.5%",
      "new_demos_monthly": "18 randevu",
      "reported_roi_first_60_days": "600%"
    },
    app_notes: 'İkna psikolojisi kurallarını barındıran system prompt\'ları hazırla → OpenAI/Gemini üzerinden lead\'in web sitesi verilerini çekip kişiye özel cold-icebreaker cümlesi üret → E-posta gönderim aracına yükle.',
    anti_patterns: 'Uzun, kendini öven yazılardan kaçın. Maksimum 3 paragraf, tamamen karşı tarafın sorunu odaklı ve süper net bir "soru" ile biten mesajlar yaz.'
  },
  {
    name: 'Hızlı Lead Yanıtı',
    category: 'Randevu & Hızlı Dönüş',
    tier: 'Premium',
    description: '5 dakikada yanıt → dönüşüm 2x. Reklamlardan gelen müşteriyi soğutmadan WhatsApp randevusuna çevirin.',
    setup_fee: 20000,
    monthly_fee: 14000,
    setup_fee_usd: 600,
    monthly_fee_usd: 450,
    is_active: true,
    scope_items: [
      'Meta Lead Ads / Web Form anlık webhook entegrasyonu',
      '5 dakikadan kısa sürede otomatik WhatsApp ilk temas akışı',
      'AI lead sınıflandırma (hazır/soğuk ayrımı)',
      'Otomatik randevu takvimi eşleştirme',
      'Satış ekibine anlık bildirim ve alarm'
    ],
    target_sectors: ['Özel Sağlık', 'Diş Kliniği', 'Estetik', 'Gayrimenkul', 'Eğitim', 'Otomotiv'],
    delivery_days: 5,
    monthly_income_potential: 4,
    pitch_template: 'Reklamlarınızdan gelen leadlere kaç saat sonra dönüyorsunuz? 5 dakikadan sonra lead dönüşüm oranınız %80 düşer. Hızlı lead yanıtı otomasyonumuzla satışlarınızı 2 katına çıkaralım.',
    steps: [
      'Reklam ve form kanallarının webhook bağlantılarının yapılması',
      'AI randevu asistanının WhatsApp hattına bağlanması',
      'Satış ekibinin telefonlarına anlık alarm sisteminin kurulması'
    ],
    problem_story: 'Klinik veya emlak firması reklama binlerce lira harcıyor. Gelen lead\'e satış ekibi 4 saat sonra, bazen ertesi gün dönüyor. O sırada müşteri çoktan başka bir firmayla anlaşmış veya heyecanını kaybetmiş oluyor.',
    value_story: 'Sağlık turizmi yapan bir saç ekim merkezinde lead dönüş süresi ortalama 3.5 saatten 2.5 dakikaya indirildi. Reklam dönüşüm oranı %4.5\'ten %11.2\'ye yükseldi. Ciro aylık 180 bin TL arttı.',
    sales_script: '"Gelen leadlere ortalama kaç dakikada dönüyorsunuz? Hızımızı 5 dakikanın altına indirerek reklam harcamanızı değiştirmeden ciroyu 2x yapabiliriz. Test edelim mi?"',
    sample_metrics: {
      "response_time_before": "210 dk",
      "response_time_after": "2.5 dk",
      "conversion_rate_before": "4.5%",
      "conversion_rate_after": "11.2%",
      "monthly_revenue_increase": "₺180,000+",
      "reported_roi_first_60_days": "800%"
    },
    app_notes: 'Facebook Lead Ads / Elementor Form → Make/Zapier Webhook → WhatsApp Business API (ManyChat/WABA) → Randevu/Süreç tetikleyicisi → Temsilciye Slack/Telegram bildirimi.',
    anti_patterns: 'Robotik, jenerik "Mesajınız alındı" mesajları atma. "Merhaba [İsim], [Hizmet] ile ilgili talebinizi aldım. Yarın saat 11:00 veya 14:00 uygun mu?" gibi anında aksiyon odaklı yaz.'
  },
  {
    name: 'Randevu Asistanı (Diyetisyen & Klinik)',
    category: 'Randevu & Hızlı Dönüş',
    tier: 'Premium',
    description: 'Diyetisyen ve klinikler için 7/24 randevu planlama, kalori/diyet hatırlatıcı ve kişiselleştirilmiş WhatsApp asistanı.',
    setup_fee: 25000,
    monthly_fee: 12000,
    setup_fee_usd: 750,
    monthly_fee_usd: 350,
    is_active: true,
    scope_items: [
      '7/24 Akıllı WhatsApp Randevu Botu',
      'Diyet Planı & Kalori Hatırlatıcı Otomasyonu',
      'Kişiselleştirilmiş Kilo & Ölçüm Takip Arayüzü',
      'No-show önleyici SMS/WhatsApp bildirimleri',
      'Ön görüşme & Form doldurma entegrasyonu'
    ],
    target_sectors: ['Diyetisyenler', 'Güzellik Merkezleri', 'Kişisel Antrenörler', 'Beslenme Danışmanları'],
    delivery_days: 7,
    monthly_income_potential: 5,
    pitch_template: 'Randevu kaçıran veya diyet planına uymayan danışanlarınızı takip etmek için zaman kaybetmeyin. 7/24 çalışan WhatsApp AI asistanı ile randevuları doldurup bağlılığı 2.5 katına çıkaralım.',
    steps: [
      'WhatsApp Business API ve Randevu takvimi bağlantısı',
      'Diyet hatırlatıcı ve kilo takip akışlarının tasarlanması',
      'Ön görüşme ve randevu onay şablonlarının AI entegrasyonu'
    ],
    problem_story: 'Diyetisyenler gün boyu seanstayken randevu almak veya diyet takibini yapmak için asistanları veya kendileri saatlerce WhatsApp\'ta yazışıyor. Birçok lead geç dönüş yüzünden rakip diyetisyenlere kaçıyor.',
    value_story: 'Örnek Diyetisyen Kliniği: Ayda 150 randevu talebi, eski sistemle dönüş hızı 2 saat, randevu oranı %35. Yapay Zekâ Randevu Asistanı sonrası anında dönüşle randevu oranı %78\'e çıktı. Ekstra personel istihdam etmeden aylık ciroda ₺65.000 artış sağlandı.',
    sales_script: '"Danışanlarınızın randevu almak veya diyetlerini takip etmek için saatlerce WhatsApp\'ta beklemesine son verelim. 7/24 çalışan akıllı AI asistanımızla randevu doluluk oranınızı %80\'in üzerine çıkarabiliriz. Demo yapmak ister misiniz?"',
    sample_metrics: {
      "leads_responded": "100% (Anında)",
      "booking_rate_before": "35%",
      "booking_rate_after": "78%",
      "staff_time_saved": "Aylık ~60 saat",
      "monthly_extra_revenue": "₺65,000",
      "reported_roi_first_60_days": "520%"
    },
    app_notes: 'Meta Cloud API (WhatsApp) → Make.com → OpenAI / Gemini Assistant API (Diyetisyen karakterinde eğitilmiş) → Calendly / Google Takvim entegrasyonu → CRM güncelleme.',
    anti_patterns: 'ASLA danışanlara sadece jenerik "randevunuz alındı" diyen kuru bir bot sunmayın. Karşısında gerçekten onun diyetini önemseyen, sempatik ve empatik bir AI asistan varmış hissi yaratın.'
  },
  {
    name: 'Mali Müşavir & Vergi OCR',
    category: 'Belge & Uyum',
    tier: 'Growth',
    description: 'Mali müşavirler için AI destekli fatura, dekont, vergi levhası okuma, fiş eşleştirme ve otomatik muhasebeleştirme motoru.',
    setup_fee: 35000,
    monthly_fee: 15000,
    setup_fee_usd: 1000,
    monthly_fee_usd: 450,
    is_active: true,
    scope_items: [
      'Çoklu formatta AI OCR evrak tarama',
      'Fatura-Fiş otomatik muhasebe eşleştirme',
      'Vergi Beyannamesi otomatik kontrol robotu',
      'E-Fatura / E-Arşiv anlık çekme ve arşivleme',
      'Muhasebe yazılımları (Luca, Zirve vb.) entegrasyon API'
    ],
    target_sectors: ['Mali Müşavir Ofisleri', 'Muhasebe Departmanları', 'KOBİ\'ler', 'E-Ticaret Firmaları'],
    delivery_days: 10,
    monthly_income_potential: 6,
    pitch_template: 'Her ay binlerce faturayı ve fişi manuel olarak sisteme girmekle ekibinizin günlerini harcamayın. Yapay zekâ OCR ile tüm evrakları saniyeler içinde okuyup muhasebe sisteminize sıfır hatayla aktaralım.',
    steps: [
      'Evrak tarama ve bulut depolama entegrasyonu',
      'LlamaIndex / Google Document AI OCR modelinin eğitilmesi ve şablonların eşlenmesi',
      'Luca/Zirve gibi sistemlere veri aktarım boru hattının kurulması'
    ],
    problem_story: 'Mali müşavirlikte ay sonu geldiğinde binlerce fatura, dekont ve fiş klasörlerle gelir. Ekip bunları tek tek elle girmekten helak olur. Hatalı girmelerden dolayı vergi cezaları ve sürekli düzeltmelerle vakit kaybedilir.',
    value_story: '5 personeli olan bir Mali Müşavirlik ofisinde ayda 8.000 fatura elle giriliyordu. AI OCR entegrasyonu sonrası fatura giriş süresi %92 azaldı. Ekip ay sonu mesailerinden kurtuldu ve yeni mükellef kabul etmeye başladı. Ofis kapasitesi %150 arttı.',
    sales_script: '"Mükelleflerinizden gelen evrakları sisteme manuel girmek için ayda kaç gün harcıyorsunuz? AI Muhasebe robotumuzla bu süreyi 1 güne indirelim, ekibiniz de beyanname kontrollerine odaklanarak hata riskini sıfıra indirsin."',
    sample_metrics: {
      "monthly_documents_processed": "8,000+",
      "processing_time_before": "120 saat/ay",
      "processing_time_after": "8 saat/ay",
      "accuracy_rate": "99.98%",
      "capacity_increase": "150%",
      "reported_roi_first_60_days": "650%"
    },
    app_notes: 'Google Cloud Vision API / LlamaIndex Document Intelligence → Fatura / Dekont Parser (Regex + LLM Json Formatting) → Luca XML formatı veya ilgili muhasebe API\'sine otomatik push.',
    anti_patterns: 'ASLA "jenerik OCR" deme. Mali müşavirlerin en çok kullandığı Luca veya Zirve gibi yerel muhasebe programları adıyla konuşup doğrudan "beyanname öncesi sıfır hata garantisi" olarak sat.'
  },
  {
    name: 'Sözleşme Analist & Hukuk Danışman AI',
    category: 'Belge & Uyum',
    tier: 'Premium',
    description: 'Hukuk büroları ve şirketler için Türkçe sözleşmelerde risk analizi, eksik maddelerin tespiti ve mevzuat uyum kontrolü yapan AI asistan.',
    setup_fee: 40000,
    monthly_fee: 18000,
    setup_fee_usd: 1200,
    monthly_fee_usd: 500,
    is_active: true,
    scope_items: [
      'Türkçe Hukuki Sözleşme Risk Analiz Motoru',
      'Mevzuat & KVKK Uyum Kontrol Otomasyonu',
      'Eksik / Kritik Madde Tespit ve Uyarı Sistemi',
      'AI Destekli Alternatif Madde Önerici',
      'Hukuk Büroları İçin Güvenli Yerel Depolama'
    ],
    target_sectors: ['Hukuk Büroları', 'Şirket Hukuk Müşavirlikleri', 'Gayrimenkul Firmaları', 'SaaS Girişimleri'],
    delivery_days: 12,
    monthly_income_potential: 5,
    pitch_template: 'Sözleşmelerdeki gözden kaçan tek bir kelime yüzünden milyonlarca liralık tazminat davalarıyla karşılaşmayın. AI Sözleşme Analistimiz ile tüm sözleşmelerinizi 1 dakikada KVKK ve Türk Borçlar Kanunu\'na göre inceleyelim.',
    steps: [
      'Sözleşme tipi ve hukuki standartların sisteme tanımlanması',
      'Custom LLM Prompt ve Hukuk Bilgi Bankası (RAG) kurgusu',
      'Word / PDF eklentisi ve risk raporu oluşturma arayüzü'
    ],
    problem_story: 'Şirketler veya avukatlar her gün onlarca sayfalık sözleşmeleri satır satır okumak zorunda. Yorgunluktan veya dikkatsizlikten dolayı gözden kaçan tek bir cezai şart veya fesih maddesi şirketi büyük hukuki risklere sokuyor.',
    value_story: 'Orta ölçekli bir inşaat ve gayrimenkul firmasında tedarikçi ve taşeron sözleşmeleri inceleniyordu. AI Legal asistan devreye alındıktan sonra 20 sayfalık bir sözleşmenin inceleme süresi 4 saatten 3 dakikaya düştü. Sözleşmelerdeki 12 kritik riskli cezai şart önceden tespit edildi ve firma olası ₺850.000 cezadan korundu.',
    sales_script: '"Sözleşme incelemeleri avukatlarınızın veya sizin ne kadar vaktinizi alıyor? Gözden kaçabilecek kritik maddeleri ve riskleri sıfıra indirmek için sözleşmelerinizi 1 dakikada analiz eden AI asistanı devreye alalım."',
    sample_metrics: {
      "contract_review_time_before": "4 saat",
      "contract_review_time_after": "3 dk",
      "critical_risks_detected": "100%",
      "legal_cost_savings": "Aylık ₺45,000",
      "dispute_risk_reduction": "95%",
      "reported_roi_first_60_days": "700%"
    },
    app_notes: 'Pinecone RAG (Türk Borçlar Kanunu, KVKK, Yargıtay emsal kararları) + LangChain → PDF/Word Text Extraction → LLM Risk Assessment (JSON output formatında madde madde risk skoru ve öneriler) → Dashboard raporlama.',
    anti_patterns: 'ASLA "AI avukatın yerini alacak" deme. Avukatın elini güçlendiren, onun işini 10 kat hızlandıran ve "ikinci bir göz" olarak çalışan güvenilir bir asistan olarak konumlandır.'
  },
  {
    name: 'E-Ticaret Yorum Analitiği & Destek',
    category: 'AI Reklam Lab',
    tier: 'Growth',
    description: 'Trendyol, Hepsiburada ve Amazon yorumlarını otomatik analiz eden, rakip açıklarını bulan, ürün geliştirme fikirleri sunan ve AI destekli hızlı yanıt robotu.',
    setup_fee: 20000,
    monthly_fee: 10000,
    setup_fee_usd: 600,
    monthly_fee_usd: 300,
    is_active: true,
    scope_items: [
      'Çoklu Pazaryeri Müşteri Yorum Analiz Modülü',
      'AI Destekli Hızlı ve Kişiselleştirilmiş Yorum Yanıtlayıcı',
      'Rakip Ürün Analizi ve Fırsat Keşif Motoru',
      'Müşteri Memnuniyetsizlik / İade Sebepleri Raporu',
      'Pazarlama Metinleri & SEO Uyumlu Ürün İlanı Robotu'
    ],
    target_sectors: ['E-Ticaret Mağazaları', 'Amazon/Trendyol Satıcıları', 'Kozmetik & Giyim Markaları', 'D2C Markaları'],
    delivery_days: 6,
    monthly_income_potential: 7,
    pitch_template: 'Yüzlerce müşteri yorumunu tek tek okuyup anlamaya çalışmayın. AI Yorum Analitiğimiz ile müşterilerinizin ürününüzde en çok neyi sevdiğini, neden iade ettiğini ve rakiplerinizin hangi açıklarından yararlanabileceğinizi anında raporlayalım.',
    steps: [
      'Pazaryeri mağaza API veya scraping entegrasyonu',
      'Müşteri yorumları sentiment ve konu başlığı segmentasyonu',
      'Otomatik yanıt şablonları ve pazarlama öneri motoru'
    ],
    problem_story: 'E-ticaret satıcıları binlerce yorum alıyor ama müşterilerin asıl şikayet nedenlerini (kargo paketi yırtık, beden dar vb.) topluca göremiyor. Manuel yorum yanıtlamak zaman alıyor, geç dönüldüğünde ise mağaza puanı düşüyor.',
    value_story: 'Trendyol ve Hepsiburada\'da ayda 40.000 adet ürün satan bir kozmetik markasında iade oranları %8.5 civarındaydı. AI Yorum Analizimiz yorumları tarayarak iade sebebinin "pompa kapağının sızdırması" olduğunu saptadı. Kapak değiştirildi, iadeler %2.1\'e düştü. Mağaza puanı 8.9\'dan 9.7\'ye yükseldi. Ciro %35 arttı.',
    sales_script: '"Müşteri yorumlarınızı ve iade sebeplerinizi analiz etmek için ne kadar vakit harcıyorsunuz? AI analiz robotumuzla en çok satan ürünlerinizdeki gizli şikayetleri ve rakip açıklarını 5 dakikada ortaya çıkaralım."',
    sample_metrics: {
      "reviews_analyzed_monthly": "5,000+",
      "return_rate_before": "8.5%",
      "return_rate_after": "2.1%",
      "store_rating_before": "8.9",
      "store_rating_after": "9.7",
      "reported_roi_first_60_days": "600%"
    },
    app_notes: 'Trendyol/Amazon API veya Web Scraper → Sentiment & Entity Extraction (LLM tabanlı sınıflandırma) → İade ve memnuniyet korelasyon analizi → Dashboard entegrasyonu.',
    anti_patterns: 'Sadece "yorumları cevaplar" diyerek satma. "İade oranlarını düşüren, ürün kalitesini artıran ve mağaza puanınızı yükselterek üst sıralara çıkmanızı sağlayan Büyüme Motoru" de.'
  },
  {
    name: 'Emlak Portföy & Akıllı Açıklama',
    category: 'Randevu & Hızlı Dönüş',
    tier: 'Starter',
    description: 'Emlak ofisleri için sahibinden ve emlak ilan sitelerindeki verileri analiz eden, otomatik ilan açıklaması yazan ve WhatsApp gayrimenkul eşleştirme botu.',
    setup_fee: 12000,
    monthly_fee: 7000,
    setup_fee_usd: 400,
    monthly_fee_usd: 200,
    is_active: true,
    scope_items: [
      'WhatsApp AI Gayrimenkul Danışman Botu',
      'Sahibinden / Emlak İlanı Akıllı Açıklama Yazıcı',
      'Müşteri Talebi - Portföy Otomatik Eşleştirme Motoru',
      'Fotoğraflardan Otomatik Ev Özellikleri Analizi',
      'Randevu & Yer Gösterme Takip Entegrasyonu'
    ],
    target_sectors: ['Emlak Ofisleri', 'Gayrimenkul Danışmanları', 'İnşaat Projeleri', 'Konut Geliştiricileri'],
    delivery_days: 5,
    monthly_income_potential: 8,
    pitch_template: 'Müşterilerinizin aradığı kriterlere uygun evi portföyünüzde aramakla vakit kaybetmeyin. WhatsApp AI Emlak Botumuz, müşterinin istediği kriterleri anlar ve portföyünüzdeki en uygun 3 evi saniyeler içinde WhatsApp\'tan ona sunar.',
    steps: [
      'Emlak portföy veri tabanının sisteme yüklenmesi',
      'WhatsApp chatbot akışının ve ilan eşleştirme kurallarının kurulması',
      'AI İlan açıklaması yazma aracının tasarlanması'
    ],
    problem_story: 'Bir emlak danışmanının yüzlerce ilanı var. Telefonuna gelen müşteriler sürekli "2+1, ebeveyn banyolu, metroya yakın" gibi isteklerde bulunuyor. Danışman portföyünde tarama yapıp ilan linklerini atana kadar müşteri ilgisini kaybediyor. Ayrıca ilan sitelerine girilen açıklamalar çok sıradan kalıyor.',
    value_story: 'Beşiktaş bölgesinde çalışan 15 kişilik bir emlak ofisinde, WhatsApp AI Emlak Botu devreye alındı. Müşteriler WhatsApp üzerinden aradıkları kriterleri yazdı. AI bot, portföydeki 400 daireyi saniyeler içinde tarayıp eşleşen daireleri fotoğrafları ve özellikleri ile sundu. Yer gösterme randevu oranları %22\'den %58\'e yükseldi, satış kapama süreleri yarı yarıya kısaldı.',
    sales_script: '"Müşterilerinizin taleplerini alıp uygun gayrimenkulü eşleştirmek ne kadar zamanınızı alıyor? WhatsApp AI emlak danışmanımızla portföyünüzü saniyeler içinde müşteriye sunup yer gösterme randevularınızı 2.5 katına çıkarabiliriz."',
    sample_metrics: {
      "portfolios_synced": "400+ Daire",
      "response_time_to_buyer": "Anında (< 10 sn)",
      "property_match_accuracy": "94%",
      "viewing_appointment_rate_before": "22%",
      "viewing_appointment_rate_after": "58%",
      "reported_roi_first_60_days": "400%"
    },
    app_notes: 'Airtable / Supabase Emlak Portföyü → Vector Database (Daire özellikleri ve konum bilgileri gömülü) → WhatsApp Business API + OpenAI GPT-4o-mini eşleştirme motoru → Sahibinden ilan açıklaması jeneratörü.',
    anti_patterns: 'ASLA robotik bir liste gibi link fırlatmayın. Müşterinin ihtiyaç duyduğu bütçe, oda ve konum kriterlerini samimi bir şekilde analiz edip en uygun 3 noktayı nedenleriyle açıklayarak sunun.'
  }
]

async function safeInsert(playbooksData: any[]) {
  try {
    const { data, error } = await supabaseAdmin.from('playbooks').insert(playbooksData).select('id')
    if (error) throw error
    return { success: true, count: data?.length || 0 }
  } catch (err: any) {
    if (err.code === '42703' || (err.message && err.message.includes('column'))) {
      console.warn('Migration 003 columns not found. Seeding basic fields only.')
      const basicPlaybooks = playbooksData.map(pb => ({
        name: pb.name,
        category: pb.category,
        tier: pb.tier,
        description: pb.description,
        setup_fee: pb.setup_fee,
        monthly_fee: pb.monthly_fee,
        is_active: pb.is_active ?? true,
        scope_items: pb.scope_items,
        target_sectors: pb.target_sectors,
        delivery_days: pb.delivery_days,
        monthly_income_potential: pb.monthly_income_potential,
        pitch_template: pb.pitch_template || pb.sales_script,
        steps: pb.steps
      }))
      const { data, error } = await supabaseAdmin.from('playbooks').insert(basicPlaybooks).select('id')
      if (error) throw error
      return { success: true, count: data?.length || 0, warning: 'Sadece temel alanlar yüklendi' }
    }
    throw err
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError
    const { data: existing } = await supabaseAdmin.from('playbooks').select('id').limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: false, message: 'Paketler zaten mevcut. PUT ile force-reseed yapın.' })
    }
    const result = await safeInsert(DEFAULT_PLAYBOOKS)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError
    // Delete existing playbooks to prevent unique constraints or duplication
    await supabaseAdmin.from('playbooks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const result = await safeInsert(DEFAULT_PLAYBOOKS)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
