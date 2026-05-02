import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const DEFAULT_PLAYBOOKS = [
  {
    name: 'Logo & Marka Kimliği',
    category: 'Tasarım',
    description: 'Profesyonel logo tasarımı, marka renk paleti, tipografi kılavuzu ve temel marka kimliği dosyaları.',
    setup_fee: 5000,
    monthly_fee: 0,
    is_active: true,
    pitch_template: 'Markanızın ilk izlenimi logonuzla başlar. Güçlü, akılda kalıcı ve profesyonel bir kimlik için Logo & Marka Kimliği paketimizi sunuyoruz. Tek seferlik ₺5.000 yatırımla rakiplerinizden sıyrılın.',
    steps: ['Brifing toplantısı', 'Konsept geliştirme (3 seçenek)', 'Revizyon turu', 'Final dosyalar teslimi']
  },
  {
    name: 'Sosyal Medya Yönetimi',
    category: 'Dijital',
    description: 'Aylık 20 post, story yönetimi, hashtag stratejisi, etkileşim takibi ve aylık rapor.',
    setup_fee: 2000,
    monthly_fee: 8000,
    is_active: true,
    pitch_template: 'Sosyal medyanızı düzenli ve profesyonel tutmak artık çok daha kolay. Aylık ₺8.000 ile tüm içerik üretimi, planlama ve yayınlama işlerini biz üstleniyoruz. Siz işinize odaklanın, biz dijital varlığınızı büyütelim.',
    steps: ['İçerik takvimi hazırlama', 'Görsel & metin üretimi', 'Zamanlı yayınlama', 'Aylık analiz raporu']
  },
  {
    name: 'Web Sitesi Tasarımı',
    category: 'Dijital',
    description: 'Modern, mobil uyumlu kurumsal web sitesi. Hosting, domain kurulumu ve aylık teknik bakım dahil.',
    setup_fee: 15000,
    monthly_fee: 2000,
    is_active: true,
    pitch_template: 'Web siteniz olmadan Google\'da görünmek imkânsız. Kurulum ücreti ₺15.000, aylık bakım ₺2.000 ile işletmenizi 7/24 çalışan bir satış noktasına dönüştürün.',
    steps: ['Alan adı & hosting kurulumu', 'Tasarım & geliştirme', 'İçerik yerleştirme', 'Test & yayınlama', 'Aylık bakım']
  },
  {
    name: 'AI Görsel Üretimi',
    category: 'Dijital',
    description: 'Aylık 30 adet yapay zeka destekli ürün, kampanya ve sosyal medya görseli. Hızlı, ekonomik, özgün.',
    setup_fee: 0,
    monthly_fee: 5000,
    is_active: true,
    pitch_template: 'Profesyonel fotoğraf çekimi yaptırmadan, stok görsel satın almadan — yapay zeka ile işletmenize özel, özgün görseller. Aylık ₺5.000\'e 30 görseli hazır edin.',
    steps: ['Marka stili belirleme', 'Prompt kütüphanesi oluşturma', 'Aylık görsel üretimi', 'Revizyon & teslim']
  },
  {
    name: 'Kurumsal Kimlik Paketi',
    category: 'Paket',
    description: 'Logo, kartvizit, antetli kağıt, zarf, sosyal medya profil görselleri ve kapak fotoğrafları.',
    setup_fee: 12000,
    monthly_fee: 0,
    is_active: true,
    pitch_template: 'Kurumsal kimliğinizi tek seferde tamamlayın. Logo\'dan kartvizite, sosyal medya profilinden antetli kağıda — ₺12.000\'e tam bir marka paketi.',
    steps: ['Logo tasarımı', 'Kartvizit & kırtasiye', 'Sosyal medya profil görselleri', 'Marka kılavuzu PDF']
  },
  {
    name: 'Güzellik Salonu Dijital Paketi',
    category: 'Paket',
    description: 'Güzellik salonları için özel: logo, 20 Instagram şablonu, Google İşletmem optimizasyonu ve aylık içerik desteği.',
    setup_fee: 5500,
    monthly_fee: 3000,
    is_active: true,
    pitch_template: 'Güzellik salonunuzu Instagram\'da öne çıkaralım. Logo + 20 özel şablon + Google profilinizin optimizasyonu. Kurulum ₺5.500, aylık destek ₺3.000.',
    steps: ['Logo & renk paleti', 'Instagram şablon seti', 'Google İşletmem kurulumu', 'Aylık içerik desteği']
  },
  {
    name: 'Kafe & Restoran Dijital Paketi',
    category: 'Paket',
    description: 'Kafe ve restoranlar için: logo, dijital menü, sosyal medya yönetimi ve AI görsel üretimi.',
    setup_fee: 6000,
    monthly_fee: 4000,
    is_active: true,
    pitch_template: 'Müşterileriniz gelip gitmeden önce sizi internette buluyor. Kafe & Restoran Paketimizle logo, dijital menü ve sosyal medya yönetimini bir arada sunuyoruz. Kurulum ₺6.000, aylık ₺4.000.',
    steps: ['Logo & marka rengi', 'Dijital menü tasarımı', 'Sosyal medya yönetimi', 'Aylık AI görsel üretimi']
  },
  {
    name: 'Sosyal Medya Şablon Seti',
    category: 'Tasarım',
    description: '30 adet düzenlenebilir Instagram ve Facebook post şablonu. Marka renklerine uygun, Canva üzerinden teslim.',
    setup_fee: 3500,
    monthly_fee: 0,
    is_active: true,
    pitch_template: 'Kendi sosyal medyanızı kendiniz yönetmek istiyorsanız ama profesyonel görünmekten ödün vermiyorsanız — 30 adet hazır şablon tam size göre. Tek seferlik ₺3.500.',
    steps: ['Marka rengi & tipografi uyumu', '30 şablon tasarımı', 'Canva üzerinden teslim', 'Kullanım rehberi']
  },
  {
    name: 'SEO & Google İşletmem',
    category: 'Strateji',
    description: 'Google İşletmem optimizasyonu, temel SEO kurulumu, anahtar kelime analizi ve aylık takip raporu.',
    setup_fee: 2500,
    monthly_fee: 3000,
    is_active: true,
    pitch_template: 'Google\'da ilk sayfada çıkmak artık zorunluluk. SEO & Google İşletmem paketiyle yerel aramalarda üst sıralara yükselmenizi sağlıyoruz. Kurulum ₺2.500, aylık ₺3.000.',
    steps: ['Google İşletmem profil kurulumu', 'Anahtar kelime analizi', 'Sayfa içi SEO optimizasyonu', 'Aylık sıralama raporu']
  },
  {
    name: 'Ambalaj & Etiket Tasarımı',
    category: 'Tasarım',
    description: 'Ürün ambalajı, etiket, sticker ve kutu tasarımı. Baskıya hazır dosyalar dahil.',
    setup_fee: 5000,
    monthly_fee: 0,
    is_active: true,
    pitch_template: 'Ürününüzün paketi, satın alma kararının %70\'ini etkiliyor. Profesyonel ambalaj & etiket tasarımıyla rakiplerinizin önüne geçin. Tek seferlik ₺5.000.',
    steps: ['Konsept tasarım', 'Revizyon turu', 'Baskıya hazır dosyalar', 'Tedarikçi önerileri']
  },
]

export async function POST() {
  try {
    // Check if playbooks already exist
    const { data: existing } = await supabaseAdmin
      .from('playbooks')
      .select('id')
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: false, message: 'Paketler zaten mevcut. Önce temizleyin.' })
    }

    const { data, error } = await supabaseAdmin
      .from('playbooks')
      .insert(DEFAULT_PLAYBOOKS)
      .select('id')

    if (error) throw error

    return NextResponse.json({ success: true, count: data?.length || 0 })
  } catch (error: any) {
    console.error('[SEED] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// Force-reseed (replaces existing)
export async function PUT() {
  try {
    await supabaseAdmin
      .from('playbooks')
      .delete()
      .gte('created_at', '2000-01-01T00:00:00.000Z')

    const { data, error } = await supabaseAdmin
      .from('playbooks')
      .insert(DEFAULT_PLAYBOOKS)
      .select('id')

    if (error) throw error

    return NextResponse.json({ success: true, count: data?.length || 0 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
