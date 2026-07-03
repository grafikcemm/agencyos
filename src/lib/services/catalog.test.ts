import { describe, it, expect, vi } from 'vitest'
import {
  SERVICE_FAMILIES,
  SERVICE_PACKAGES,
  findServiceBySlug,
  domainOfPackage,
  resolveServiceSlug,
} from './catalog'
import { mergeCatalog } from './catalogOverrides'
import { OFFERS } from '../offers'

// Kanıtsız iddia lint'i: yüzde, ROI, "3X", "2 katına" gibi ölçülmemiş vaatler satış
// metninde YASAK. (Sayı tek başına serbest: "10 adet", "5 dakika" gibi teslimat
// tanımları iddia değildir.)
const UNPROVEN_CLAIM_RE = /%|\bROI\b|\bROAS\b|\d+\s*[xX]\b|katına|kat daha/u

describe('kanonik hizmet kataloğu', () => {
  it('slug\'lar unique', () => {
    const slugs = SERVICE_PACKAGES.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('her paket geçerli bir aileye, her aile geçerli bir domain\'e bağlı', () => {
    const familyIds = new Set(SERVICE_FAMILIES.map((f) => f.id))
    for (const pkg of SERVICE_PACKAGES) {
      expect(familyIds.has(pkg.familyId), `${pkg.slug} ailesi yok: ${pkg.familyId}`).toBe(true)
      expect(['tasarim', 'ai_otomasyon', 'hibrit']).toContain(domainOfPackage(pkg))
    }
  })

  it('upsell slug\'ları katalogda mevcut', () => {
    for (const pkg of SERVICE_PACKAGES) {
      for (const up of pkg.upsellSlugs) {
        expect(findServiceBySlug(up), `${pkg.slug} → upsell yok: ${up}`).toBeDefined()
      }
    }
  })

  it('30 legacy OFFERS id\'sinin TAMAMI kanonik slug\'a çözülür', () => {
    expect(OFFERS.length).toBe(30)
    for (const offer of OFFERS) {
      const slug = resolveServiceSlug(offer.id)
      expect(slug, `çözülmeyen offer id: ${offer.id}`).not.toBeNull()
      expect(findServiceBySlug(slug!)).toBeDefined()
    }
  })

  it('her legacy offer id tam BİR pakete eşlenir (çift eşleme yok)', () => {
    const seen = new Map<string, string>()
    for (const pkg of SERVICE_PACKAGES) {
      for (const id of pkg.legacyOfferIds) {
        expect(seen.has(id), `offer id iki pakete eşlenmiş: ${id} (${seen.get(id)} ve ${pkg.slug})`).toBe(false)
        seen.set(id, pkg.slug)
      }
    }
  })

  it('seed-playbooks (21) ve migration 002 (15) adlarının tamamı çözülür', () => {
    const defaultPlaybooks = [
      'Logo & Marka Kimliği', 'Sosyal Medya Yönetimi', 'Web Sitesi Tasarımı',
      'AI Görsel Üretimi', 'Kurumsal Kimlik Paketi', 'Güzellik Salonu Dijital Paketi',
      'Kafe & Restoran Dijital Paketi', 'Sosyal Medya Şablon Seti', 'SEO & Google İşletmem',
      'Ambalaj & Etiket Tasarımı', 'Eski Müşteri Canlandırma', 'Belge İşleme Otomasyonu',
      'Takip Zincirleri', 'Dahili Raporlama', 'Outbound Copywriting Ustalığı',
      'Hızlı Lead Yanıtı', 'Randevu Asistanı (Diyetisyen & Klinik)', 'Mali Müşavir & Vergi OCR',
      'Sözleşme Analist & Hukuk Danışman AI', 'E-Ticaret Yorum Analitiği & Destek',
      'Emlak Portföy & Akıllı Açıklama',
    ]
    const migration002 = [
      'Eski Müşteri Canlandırma', 'AI Chatbot Kurulumu', 'Lead Generasyon Sistemi',
      'E-posta Otomasyon Sistemi', 'Kurumsal Kimlik Paketi', 'Ambalaj & Etiket Tasarımı',
      'Sunum & Pitch Deck Tasarımı', 'Sosyal Medya İçerik Şablonları', 'Dijital Reklam Görselleri',
      'İnfografik & Data Görselleştirme', 'Broşür & Katalog Tasarımı', 'Marka Rehberi (Brand Guideline)',
      'Google Business Profil Yönetimi', 'Instagram Profil Optimizasyonu', 'Rakip Analizi Raporu',
    ]
    expect(defaultPlaybooks.length).toBe(21)
    expect(migration002.length).toBe(15)
    for (const name of [...defaultPlaybooks, ...migration002]) {
      expect(resolveServiceSlug(name), `çözülmeyen playbook adı: ${name}`).not.toBeNull()
    }
  })

  it('satış metinlerinde kanıtsız %/ROI/kat iddiası yok', () => {
    for (const pkg of SERVICE_PACKAGES) {
      const texts = [pkg.salesCopy.promise, ...pkg.salesCopy.antiPatterns, ...pkg.salesCopy.checklist]
      for (const t of texts) {
        expect(UNPROVEN_CLAIM_RE.test(t), `${pkg.slug} kanıtsız iddia içeriyor: "${t}"`).toBe(false)
      }
    }
  })

  it('kanonik slug verilirse aynen döner; bilinmeyen girdi null (uydurma yok)', () => {
    expect(resolveServiceSlug('web-sitesi')).toBe('web-sitesi')
    expect(resolveServiceSlug('olmayan-hizmet-xyz')).toBeNull()
    expect(resolveServiceSlug(null)).toBeNull()
    expect(resolveServiceSlug(undefined)).toBeNull()
    expect(resolveServiceSlug('')).toBeNull()
  })

  it('offers.ts fiyatları katalogda birebir taşınır (tek fiyat kaynağı)', () => {
    const website = findServiceBySlug('web-sitesi')!
    const websiteOffer = OFFERS.find((o) => o.id === 'website')!
    expect(website.defaultSetupPriceTl).toBe(websiteOffer.setupPrice)
    expect(website.defaultMonthlyPriceTl).toBe(websiteOffer.monthlyPrice)
  })
})

describe('mergeCatalog (fiyat override + aktiflik)', () => {
  it('override yoksa kod default\'ları geçerli, hepsi aktif', () => {
    const merged = mergeCatalog([])
    expect(merged.length).toBe(SERVICE_PACKAGES.length)
    const web = merged.find((m) => m.slug === 'web-sitesi')!
    expect(web.setupPriceTl).toBe(web.defaultSetupPriceTl)
    expect(web.active).toBe(true)
    expect(web.domain).toBe('tasarim')
    expect(web.familyName).toBe('Web Tasarım')
  })

  it('override fiyatı ve aktifliği ezer; diğer paketler etkilenmez', () => {
    const merged = mergeCatalog([
      { slug: 'web-sitesi', setup_price_override_tl: 30000, monthly_price_override_tl: null, active: false },
    ])
    const web = merged.find((m) => m.slug === 'web-sitesi')!
    expect(web.setupPriceTl).toBe(30000)
    expect(web.monthlyPriceTl).toBe(web.defaultMonthlyPriceTl) // null override → default
    expect(web.active).toBe(false)
    const logo = merged.find((m) => m.slug === 'logo-marka-kimligi')!
    expect(logo.active).toBe(true)
  })

  it('bilinmeyen slug\'lı override sessizce yok sayılır (yapıyı DB belirleyemez)', () => {
    const merged = mergeCatalog([
      { slug: 'hayalet-paket', setup_price_override_tl: 1, monthly_price_override_tl: 1, active: true },
    ])
    expect(merged.find((m) => m.slug === 'hayalet-paket')).toBeUndefined()
    expect(merged.length).toBe(SERVICE_PACKAGES.length)
  })
})

describe('getCatalog (DB soft-skip)', () => {
  it('service_catalog tablosu yoksa (42P01) kod default\'larına düşer', async () => {
    vi.resetModules()
    vi.doMock('../supabase', () => ({
      supabaseAdmin: {
        from: () => ({
          select: async () => ({ data: null, error: { code: '42P01', message: 'relation "service_catalog" does not exist' } }),
        }),
      },
    }))
    const { getCatalog } = await import('./catalogOverrides')
    const catalog = await getCatalog()
    expect(catalog.length).toBe(SERVICE_PACKAGES.length)
    expect(catalog.every((c) => c.active)).toBe(true)
    vi.doUnmock('../supabase')
  })
})
