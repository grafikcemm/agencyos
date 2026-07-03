// Sektör tarama havuzu + öğrenen ağırlıklı günlük rotasyon planı.
// Amaç: motor sadece aynı nişleri (diş kliniği vb.) değil, ödeme gücü yüksek
// geniş bir sektör havuzunu tarasın; dönüşüm sinyali veren sektörler zamanla
// daha sık taransın (kapalı döngü öğrenme), hiç dönüşmeyenler gerilesin.
// Deterministik: aynı gün + aynı istatistikler → aynı plan (cron idempotent).

import { supabaseAdmin } from '@/lib/supabase'

export type TicketBand = 'low' | 'mid' | 'high' | 'premium'

export interface ScanSector {
  id: string
  /** leads.sector'a yazılan ad — mevcut 5 sektör adı birebir korunur (geriye uyum). */
  displayName: string
  /** Google Places textsearch sorguları. */
  queries: string[]
  ticketBand: TicketBand
  /** sector_engagement_stats.sector_key eşleştirmesi (lowercase includes). */
  matchKeywords: string[]
}

export interface SectorEngagement {
  total: number
  engaged: number
  converted: number
}

// Ödeme gücü sıralı havuz — premium/high bütçeli sektörler ağırlıklı.
export const SCAN_SECTORS: ScanSector[] = [
  {
    id: 'dis_klinigi',
    displayName: 'Diş Kliniği / Ağız Sağlığı',
    queries: ['diş kliniği', 'diş hekimi', 'ortodonti'],
    ticketBand: 'premium',
    matchKeywords: ['diş', 'dental', 'ortodonti', 'ağız sağlığı'],
  },
  {
    id: 'medikal_estetik',
    displayName: 'Medikal Estetik',
    queries: ['medikal estetik', 'estetik merkezi', 'saç ekim merkezi'],
    ticketBand: 'premium',
    matchKeywords: ['estetik', 'saç ekim', 'lazer epilasyon', 'plastik cerrah'],
  },
  {
    id: 'ozel_saglik',
    displayName: 'Özel Poliklinik / Tıp Merkezi',
    queries: ['özel poliklinik', 'tıp merkezi', 'fizik tedavi merkezi'],
    ticketBand: 'premium',
    matchKeywords: ['poliklinik', 'fizyoterapi', 'fizik tedavi', 'özel hastane', 'göz'],
  },
  // Deep-research Tier A yeni sektörler: medikal turizm (5448 teşvik → fiyat itirazı düşük) +
  // klinik zinciri (çok lokasyonlu, yüksek LTV). matchKeywords özgül tutuldu (cross-credit önler).
  {
    id: 'medikal_turizm',
    displayName: 'Medikal Turizm / Aracı Kuruluş',
    queries: ['sağlık turizmi acentesi', 'medikal turizm aracı kuruluş', 'saç ekim merkezi', 'health tourism agency'],
    ticketBand: 'premium',
    matchKeywords: ['medikal turizm', 'sağlık turizmi', 'aracı kuruluş'],
  },
  {
    id: 'klinik_zinciri',
    displayName: 'Klinik Zinciri / Sağlık Grubu',
    queries: ['özel hastane', 'sağlık grubu', 'tıp merkezleri zinciri'],
    ticketBand: 'premium',
    matchKeywords: ['klinik zinciri', 'sağlık grubu', 'hastane grubu', 'tıp merkezi'],
  },
  {
    id: 'hukuk',
    displayName: 'Hukuk Bürosu',
    queries: ['hukuk bürosu', 'avukatlık bürosu'],
    ticketBand: 'premium',
    matchKeywords: ['hukuk', 'avukat'],
  },
  {
    id: 'mimarlik',
    displayName: 'Mimarlık / İç Mimarlık',
    queries: ['mimarlık ofisi', 'iç mimarlık'],
    ticketBand: 'premium',
    matchKeywords: ['mimarlık', 'mimari', 'iç mimar'],
  },
  // Lüks gayrimenkul: ayrı SCAN sektörü — generic emlaktan daha yüksek bilet + kreatif bağımlılık.
  // emlak'tan ÖNCE: engagement attribution'da emlak'ın 'gayrimenkul' keyword'ü çalmasın.
  {
    id: 'luks_gayrimenkul',
    displayName: 'Lüks Gayrimenkul / Rezidans',
    queries: ['lüks gayrimenkul', 'luxury real estate', 'rezidans projesi', 'villa satış'],
    ticketBand: 'premium',
    matchKeywords: ['lüks gayrimenkul', 'rezidans', 'luxury real estate', 'lüks emlak'],
  },
  {
    id: 'emlak',
    displayName: 'Emlak / Gayrimenkul',
    queries: ['emlak ofisi', 'gayrimenkul danışmanlığı'],
    ticketBand: 'premium',
    matchKeywords: ['emlak', 'gayrimenkul', 'proje satış', 'müteahhit'],
  },
  {
    id: 'sigorta',
    displayName: 'Sigorta Acentesi',
    queries: ['sigorta acentesi', 'sigorta brokeri'],
    ticketBand: 'high',
    matchKeywords: ['sigorta', 'broker', 'acente'],
  },
  {
    id: 'otel',
    displayName: 'Otel / Butik Otel',
    queries: ['butik otel', 'otel'],
    ticketBand: 'high',
    matchKeywords: ['otel', 'turizm', 'resort', 'pansiyon'],
  },
  {
    id: 'oto_servis',
    displayName: 'Oto Servis / Ekspertiz',
    queries: ['oto servis', 'oto ekspertiz', 'oto galeri'],
    ticketBand: 'high',
    matchKeywords: ['oto servis', 'oto ekspertiz', 'oto bakım', 'galeri', 'otomotiv', 'araç'],
  },
  {
    id: 'ozel_okul',
    displayName: 'Özel Okul / Kolej',
    queries: ['özel okul', 'kolej', 'anaokulu'],
    ticketBand: 'high',
    matchKeywords: ['özel okul', 'kolej', 'anaokulu', 'kreş'],
  },
  {
    id: 'e_ticaret',
    displayName: 'E-Ticaret / Toptan Mağaza',
    queries: ['toptan satış mağazası', 'butik mağaza'],
    ticketBand: 'high',
    matchKeywords: ['e-ticaret', 'eticaret', 'toptan', 'mağaza', 'online satış'],
  },
  {
    id: 'muhasebe',
    displayName: 'Muhasebe / Mali Müşavir',
    queries: ['mali müşavir', 'muhasebe bürosu'],
    ticketBand: 'mid',
    matchKeywords: ['muhasebe', 'mali müşavir', 'smmm'],
  },
  {
    id: 'psikolog_diyetisyen',
    displayName: 'Psikolog / Diyetisyen',
    queries: ['psikolog', 'diyetisyen'],
    ticketBand: 'mid',
    matchKeywords: ['psikolog', 'diyetisyen', 'danışmanlık merkezi'],
  },
  {
    id: 'veteriner',
    displayName: 'Veteriner Kliniği',
    queries: ['veteriner kliniği'],
    ticketBand: 'mid',
    matchKeywords: ['veteriner'],
  },
  {
    id: 'ozel_kurs',
    displayName: 'Özel Kurs / Eğitim Merkezi',
    queries: ['dil kursu', 'eğitim merkezi', 'sürücü kursu'],
    ticketBand: 'mid',
    matchKeywords: ['kurs', 'eğitim', 'dersane'],
  },
  {
    id: 'dugun_organizasyon',
    displayName: 'Düğün / Etkinlik Organizasyon',
    queries: ['düğün organizasyon', 'davet organizasyon'],
    ticketBand: 'mid',
    matchKeywords: ['düğün', 'organizasyon', 'davet'],
  },
  {
    id: 'spor_salonu',
    displayName: 'Spor Salonu / Stüdyo',
    queries: ['fitness merkezi', 'pilates stüdyosu'],
    ticketBand: 'mid',
    matchKeywords: ['fitness', 'pilates', 'spor salonu'],
  },
  {
    id: 'guzellik',
    displayName: 'Güzellik Salonu',
    queries: ['güzellik salonu', 'cilt bakım merkezi', 'lazer epilasyon merkezi'],
    // Deep-research: devasa hacim + maksimum dijital açık (op. %90 Instagram). low→mid
    // (dengeli orta-yüksek) → rotasyonda daha sık taranır.
    ticketBand: 'mid',
    // 'salon' bilinçli dışarıda: "düğün salonu" gibi sektörlerle substring çakışması yapar.
    matchKeywords: ['güzellik', 'kuaför', 'berber', 'cilt bakım'],
  },
  // Tüketici/e-ticaret dikeyleri (TR araştırma Tier A): yüksek görsel ihtiyaç +
  // güçlü sosyal medya görünürlüğü. Additive — öğrenme döngüsü dönüşüme göre sıralar.
  {
    id: 'moda_giyim',
    displayName: 'Moda / Giyim Butiği',
    queries: ['butik giyim mağazası', 'moda butik', 'tekstil mağazası'],
    ticketBand: 'mid',
    matchKeywords: ['moda', 'giyim', 'butik', 'tekstil', 'ayakkabı', 'aksesuar'],
  },
  {
    id: 'ev_dekorasyon',
    displayName: 'Ev Dekorasyon / Mobilya',
    queries: ['mobilya mağazası', 'ev dekorasyon', 'iç dekorasyon mağazası'],
    ticketBand: 'mid',
    matchKeywords: ['mobilya', 'dekorasyon', 'ev tekstil', 'aydınlatma', 'mutfak dolabı'],
  },
  {
    id: 'restoran_kafe',
    displayName: 'Restoran / Kafe',
    queries: ['restoran', 'kafe', 'cafe'],
    ticketBand: 'low',
    matchKeywords: ['restoran', 'kafe', 'cafe', 'lokanta', 'bistro', 'kahve'],
  },
]

const BAND_WEIGHT: Record<TicketBand, number> = { premium: 4, high: 3, mid: 2, low: 1 }

// Laplace önseli: hiç verisi olmayan sektör nötr (1.0x) çarpan alır.
const PRIOR_ENGAGEMENT = 0.2
const LEARNED_MIN = 0.5
const LEARNED_MAX = 2.5
// Keşif tabanı: günün planında bu slota her sektör sırayla zorlanır.
const EXPLORATION_SLOT = 1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// FNV-1a string hash → [0, 1). Math.random yerine deterministik günlük jitter.
function hash01(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 2 ** 32
}

interface EngagementRow {
  sector_key: string | null
  total_leads: number | null
  engaged_leads: number | null
  converted_leads: number | null
}

/**
 * sector_engagement_stats view'ından sektör bazlı engagement okur ve
 * SCAN_SECTORS id'lerine eşler. View yoksa/boşsa boş Map döner —
 * plan saf ticketBand ağırlığına düşer (güvenli bozulma).
 */
export async function loadSectorEngagement(): Promise<Map<string, SectorEngagement>> {
  const stats = new Map<string, SectorEngagement>()
  try {
    // Önce v2 view (migration 035): 'contacted' başarı SAYILMAZ — yalnız gerçek satış
    // sinyalleri (responded/meeting/proposal/converted). Yoksa (42P01) eski view'a düş.
    let { data, error } = await supabaseAdmin
      .from('sector_engagement_stats_v2')
      .select('sector_key, total_leads, engaged_leads, converted_leads')

    if (error) {
      const fallback = await supabaseAdmin
        .from('sector_engagement_stats')
        .select('sector_key, total_leads, engaged_leads, converted_leads')
      data = fallback.data
      error = fallback.error
    }

    if (error || !data) {
      if (error) console.warn('[SECTOR ROTATION] Engagement view okunamadı:', error.message)
      return stats
    }

    for (const row of data as EngagementRow[]) {
      const key = (row.sector_key || '').toLowerCase().trim()
      if (!key) continue
      const sector = SCAN_SECTORS.find(s => s.matchKeywords.some(kw => key.includes(kw)))
      if (!sector) continue

      const prev = stats.get(sector.id) || { total: 0, engaged: 0, converted: 0 }
      stats.set(sector.id, {
        total: prev.total + (row.total_leads || 0),
        engaged: prev.engaged + (row.engaged_leads || 0),
        converted: prev.converted + (row.converted_leads || 0),
      })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.warn('[SECTOR ROTATION] Engagement yüklenemedi, band ağırlığına düşülüyor:', msg)
  }
  return stats
}

/**
 * Günün sıralı sektör planını üretir. Deterministik: aynı daySequence + aynı
 * istatistiklerle aynı plan döner.
 *
 * rank = bandWeight * learned * jitter
 * - learned: Laplace-smoothed engagement oranının önsele göre çarpanı
 *   (hiç dönüşmeyen sektör 0.5x'e iner, iyi dönüşen 2.5x'e çıkar)
 * - jitter: hash(daySequence, id) ∈ [0.85, 1.15) — günler arası doğal karışım
 * - exploration floor: SCAN_SECTORS[daySequence % N] planın 2. sırasına zorlanır,
 *   böylece her sektör en geç N günde bir garanti taranır.
 */
export function buildDailySectorPlan(
  daySequence: number,
  stats: Map<string, SectorEngagement>,
): ScanSector[] {
  const scored = SCAN_SECTORS.map(sector => {
    const st = stats.get(sector.id)
    const total = st?.total ?? 0
    // Dönüşüm engagement'tan daha değerli — çift sayılır.
    const engaged = (st?.engaged ?? 0) + (st?.converted ?? 0)
    const smoothed = (engaged + 1) / (total + 1 / PRIOR_ENGAGEMENT)
    const learned = clamp(smoothed / PRIOR_ENGAGEMENT, LEARNED_MIN, LEARNED_MAX)
    const weight = BAND_WEIGHT[sector.ticketBand] * learned
    const jitter = 0.85 + 0.3 * hash01(`${daySequence}:${sector.id}`)
    return { sector, rank: weight * jitter }
  })

  const ordered = scored
    .sort((a, b) => b.rank - a.rank)
    .map(entry => entry.sector)

  const floor = SCAN_SECTORS[((daySequence % SCAN_SECTORS.length) + SCAN_SECTORS.length) % SCAN_SECTORS.length]
  const floorIdx = ordered.findIndex(s => s.id === floor.id)
  if (floorIdx > EXPLORATION_SLOT) {
    ordered.splice(floorIdx, 1)
    ordered.splice(EXPLORATION_SLOT, 0, floor)
  }

  return ordered
}
