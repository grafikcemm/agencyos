// Çok-şehirli şehir×sektör hedefleme — deep-research (TÜİK GSYH + SGK işyeri + sektör
// ödeme gücü + dijital açık) sentezi. Motor artık sabit İstanbul değil; araştırma
// fırsat matrisinden beslenen deterministik şehir×sektör planı tarar.
//
// İki katman:
//  1) SCAN_CITIES — 20 şehir, ilçe ipuçları + cityBonus (leadScoringV3 CITY_BONUS ile senkron).
//  2) SCAN_TARGETS — top-30 şehir×sektör fırsat çifti (opportunityScore). Aday evreni budur;
//     20×25 kartezyen değil → tarama HEDEFLİ kalır.
//
// buildDailyTargetPlan deterministik sıralar: opportunityScore × bandWeight × learnedSector
// × learnedCity × jitter, exploration floor ile. Boş stats → araştırma sıralamasına düşer
// (graceful degradation). loadCityEngagement boş Map dönerse motor çökmez, sadece şehir öğrenmez.

import { supabaseAdmin } from '@/lib/supabase'
import { slugify } from '@/lib/geo'
import { SCAN_SECTORS, type ScanSector, type SectorEngagement, type TicketBand } from '@/lib/sectorRotation'

export interface ScanCity {
  id: string // slug, 'istanbul' — leads.city_slug ve SCAN_TARGETS.cityId ile eşleşir
  displayName: string // 'İstanbul' — geo CITY_CANONICAL ile birebir
  cityBonus: number // 0-15, leadScoringV3 CITY_BONUS ile senkron (cityBonusSync.test.ts)
  rank: number
  districts: string[] // araştırma ilçe ipuçları; [] → şehir-seviye tarama
  topSectors: string[] // kanonik SCAN sectorId'leri (matris fallback)
}

export interface ScanTarget {
  rank: number
  cityId: string
  sectorId: string // SCAN_SECTORS.id ile eşleşmeli
  opportunityScore: number // 0-100
  estimatedTargetCount?: string
  whyNow?: string
}

// 20 şehir — ödeme gücü sıralı. cityBonus leadScoringV3 CITY_BONUS ile AYNI olmalı.
export const SCAN_CITIES: ScanCity[] = [
  { id: 'istanbul', displayName: 'İstanbul', cityBonus: 15, rank: 1, districts: ['Şişli', 'Kadıköy', 'Beşiktaş', 'Bakırköy', 'Ataşehir', 'Başakşehir', 'Üsküdar', 'Beyoğlu'], topSectors: ['medikal_estetik', 'dis_klinigi', 'luks_gayrimenkul'] },
  { id: 'ankara', displayName: 'Ankara', cityBonus: 12, rank: 2, districts: ['Çankaya', 'Yenimahalle', 'Keçiören'], topSectors: ['hukuk', 'dis_klinigi', 'ozel_okul'] },
  { id: 'izmir', displayName: 'İzmir', cityBonus: 12, rank: 3, districts: ['Alsancak', 'Karşıyaka', 'Bornova', 'Bayraklı', 'Çeşme', 'Urla'], topSectors: ['dis_klinigi', 'medikal_estetik', 'emlak'] },
  { id: 'antalya', displayName: 'Antalya', cityBonus: 11, rank: 4, districts: ['Lara', 'Konyaaltı', 'Muratpaşa', 'Alanya', 'Belek', 'Kepez'], topSectors: ['medikal_turizm', 'otel', 'medikal_estetik'] },
  { id: 'bursa', displayName: 'Bursa', cityBonus: 9, rank: 5, districts: ['Nilüfer', 'Osmangazi', 'İnegöl'], topSectors: ['oto_servis', 'ev_dekorasyon', 'moda_giyim'] },
  { id: 'kocaeli', displayName: 'Kocaeli', cityBonus: 8, rank: 6, districts: ['İzmit', 'Gebze'], topSectors: ['oto_servis', 'sigorta', 'ozel_saglik'] },
  { id: 'mugla', displayName: 'Muğla', cityBonus: 8, rank: 7, districts: ['Bodrum', 'Fethiye', 'Marmaris', 'Datça', 'Göcek', 'Milas'], topSectors: ['otel', 'luks_gayrimenkul', 'medikal_estetik'] },
  { id: 'konya', displayName: 'Konya', cityBonus: 7, rank: 8, districts: ['Selçuklu', 'Meram'], topSectors: ['oto_servis', 'ev_dekorasyon', 'dis_klinigi'] },
  { id: 'gaziantep', displayName: 'Gaziantep', cityBonus: 7, rank: 9, districts: ['Şahinbey', 'Şehitkamil'], topSectors: ['moda_giyim', 'ev_dekorasyon', 'guzellik'] },
  { id: 'mersin', displayName: 'Mersin', cityBonus: 6, rank: 10, districts: ['Mezitli', 'Yenişehir'], topSectors: ['emlak', 'sigorta', 'otel'] },
  { id: 'adana', displayName: 'Adana', cityBonus: 6, rank: 11, districts: ['Seyhan', 'Çukurova'], topSectors: ['ozel_saglik', 'emlak', 'oto_servis'] },
  { id: 'denizli', displayName: 'Denizli', cityBonus: 5, rank: 12, districts: ['Merkezefendi', 'Pamukkale'], topSectors: ['ev_dekorasyon', 'moda_giyim', 'dis_klinigi'] },
  { id: 'kayseri', displayName: 'Kayseri', cityBonus: 5, rank: 13, districts: ['Melikgazi', 'Kocasinan'], topSectors: ['ev_dekorasyon', 'oto_servis', 'dis_klinigi'] },
  { id: 'sakarya', displayName: 'Sakarya', cityBonus: 5, rank: 14, districts: ['Adapazarı', 'Serdivan', 'Arifiye'], topSectors: ['oto_servis', 'sigorta', 'emlak'] },
  { id: 'tekirdag', displayName: 'Tekirdağ', cityBonus: 5, rank: 15, districts: ['Çorlu', 'Çerkezköy', 'Süleymanpaşa'], topSectors: ['oto_servis', 'moda_giyim', 'sigorta'] },
  { id: 'eskisehir', displayName: 'Eskişehir', cityBonus: 4, rank: 16, districts: ['Tepebaşı', 'Odunpazarı'], topSectors: ['ozel_kurs', 'dis_klinigi', 'psikolog_diyetisyen'] },
  { id: 'manisa', displayName: 'Manisa', cityBonus: 4, rank: 17, districts: ['Yunusemre', 'Turgutlu'], topSectors: ['oto_servis', 'ozel_saglik', 'ev_dekorasyon'] },
  { id: 'samsun', displayName: 'Samsun', cityBonus: 4, rank: 18, districts: ['İlkadım', 'Atakum'], topSectors: ['ozel_saglik', 'emlak', 'oto_servis'] },
  { id: 'trabzon', displayName: 'Trabzon', cityBonus: 3, rank: 19, districts: ['Ortahisar', 'Yomra', 'Akçaabat'], topSectors: ['ozel_saglik', 'otel', 'emlak'] },
  { id: 'sanliurfa', displayName: 'Şanlıurfa', cityBonus: 2, rank: 20, districts: ['Haliliye', 'Karaköprü'], topSectors: ['ozel_kurs', 'guzellik', 'restoran_kafe'] },
]

// Top-30 şehir×sektör fırsat matrisi (iki rapor sentezi). Motorun ilk taraması bunlardan başlar.
export const SCAN_TARGETS: ScanTarget[] = [
  { rank: 1, cityId: 'antalya', sectorId: 'medikal_estetik', opportunityScore: 95, whyNow: 'Haziran-Ekim turizm + sağlık turizmi; hızlı WhatsApp dönüşü ciroya dokunur.' },
  { rank: 2, cityId: 'istanbul', sectorId: 'medikal_estetik', opportunityScore: 94, whyNow: 'Yerli premium + uluslararası hasta; sosyal kanıt/yorum/hız.' },
  { rank: 3, cityId: 'istanbul', sectorId: 'dis_klinigi', opportunityScore: 93, whyNow: 'İmplant/ortodonti yüksek bilet; yorum + WhatsApp belirleyici.' },
  { rank: 4, cityId: 'istanbul', sectorId: 'medikal_turizm', opportunityScore: 92, whyNow: 'Çok dilli lead + teklif akışı standart ihtiyaç; 5448 teşviki.' },
  { rank: 5, cityId: 'antalya', sectorId: 'otel', opportunityScore: 92, whyNow: 'Sezon içi; yorum + tekrar misafir + doğrudan rezervasyon.' },
  { rank: 6, cityId: 'istanbul', sectorId: 'luks_gayrimenkul', opportunityScore: 91, whyNow: 'Birkaç kapanış ajans ücretini katlar; görsel + hızlı lead.' },
  { rank: 7, cityId: 'mugla', sectorId: 'otel', opportunityScore: 90, whyNow: 'Bodrum-Fethiye-Marmaris sezon piki; butik oyuncular DM/WhatsApp açığı.' },
  { rank: 8, cityId: 'antalya', sectorId: 'dis_klinigi', opportunityScore: 90, whyNow: 'Yabancı hasta diş turizmi; çok dilli randevu botu.' },
  { rank: 9, cityId: 'izmir', sectorId: 'dis_klinigi', opportunityScore: 89, whyNow: 'Orta-üst gelir + kıyı ilçeleri klinik yoğunluğu.' },
  { rank: 10, cityId: 'antalya', sectorId: 'medikal_turizm', opportunityScore: 89, whyNow: 'Turizm + sağlık turizmi aynı anda; çok dilli otomasyon.' },
  { rank: 11, cityId: 'istanbul', sectorId: 'guzellik', opportunityScore: 88, whyNow: 'Devasa hacim, Instagram DM patlaması, botlara acil ihtiyaç.' },
  { rank: 12, cityId: 'ankara', sectorId: 'hukuk', opportunityScore: 88, whyNow: 'Yüksek avukat yoğunluğu; web güveni + lead ön eleme.' },
  { rank: 13, cityId: 'izmir', sectorId: 'emlak', opportunityScore: 88, whyNow: 'Kıyı ilçeleri + kentsel dönüşüm; sürekli içerik + hızlı lead.' },
  { rank: 14, cityId: 'ankara', sectorId: 'dis_klinigi', opportunityScore: 87, whyNow: 'Beyaz yaka + planlı randevu disiplini; sistemli lead takibi.' },
  { rank: 15, cityId: 'istanbul', sectorId: 'ozel_okul', opportunityScore: 87, whyNow: 'Kayıt/erken kayıt penceresi; veli lead hızı net getiri.' },
  { rank: 16, cityId: 'antalya', sectorId: 'luks_gayrimenkul', opportunityScore: 86, whyNow: 'Turizm + yabancı alıcı akışı; kıyı premium projeler.' },
  { rank: 17, cityId: 'kayseri', sectorId: 'ev_dekorasyon', opportunityScore: 84, whyNow: 'Mobilya merkezi; katalog + AI mockup + teklif otomasyonu.' },
  { rank: 18, cityId: 'kocaeli', sectorId: 'oto_servis', opportunityScore: 84, whyNow: 'Sanayi + yüksek araç yoğunluğu; otomasyon + yorum.' },
  { rank: 19, cityId: 'izmir', sectorId: 'medikal_estetik', opportunityScore: 84, whyNow: 'Yaşam tarzı harcaması yüksek; estetik talep güçlü.' },
  { rank: 20, cityId: 'mersin', sectorId: 'emlak', opportunityScore: 85, whyNow: 'Yabancı satış 3. sıra + liman büyümesi; portföy + WhatsApp.' },
  { rank: 21, cityId: 'bursa', sectorId: 'oto_servis', opportunityScore: 85, whyNow: 'Otomotiv şehri; bakım hatırlatma + yorum anında fark.' },
  { rank: 22, cityId: 'ankara', sectorId: 'guzellik', opportunityScore: 84, whyNow: 'Beyaz yaka abonelik; randevu botları kritik.' },
  { rank: 23, cityId: 'izmir', sectorId: 'guzellik', opportunityScore: 83, whyNow: 'Kişisel bakıma yüksek gelir oranı.' },
  { rank: 24, cityId: 'mugla', sectorId: 'luks_gayrimenkul', opportunityScore: 83, whyNow: 'Bodrum-Göcek yaz sezonu portföy hareketi; premium kreatif.' },
  { rank: 25, cityId: 'denizli', sectorId: 'ev_dekorasyon', opportunityScore: 83, whyNow: 'Ev tekstili tasarım kültürü; before-after kreatif demoları.' },
  { rank: 26, cityId: 'gaziantep', sectorId: 'moda_giyim', opportunityScore: 82, whyNow: 'Tekstil/halı merkezi; sosyal + katalog kreatifi.' },
  { rank: 27, cityId: 'konya', sectorId: 'oto_servis', opportunityScore: 82, whyNow: 'Üretim şehri araç yoğunluğu; owner-led erişim.' },
  { rank: 28, cityId: 'istanbul', sectorId: 'sigorta', opportunityScore: 82, whyNow: 'Poliçe yenileme ayları; CRM + hatırlatma kurtarıcı.' },
  { rank: 29, cityId: 'ankara', sectorId: 'ozel_okul', opportunityScore: 81, whyNow: 'Erken kayıt + bursluluk; CRM verimi yüksek.' },
  { rank: 30, cityId: 'sakarya', sectorId: 'oto_servis', opportunityScore: 80, whyNow: 'Otomotiv ihracatı sonrası bakım/servis ekosistemi kalın.' },
]

export interface TargetCandidate {
  cityId: string
  city: string // canonical display ('İstanbul') — normalizeLocation için
  districts: string[] // boş → şehir-seviye
  sector: ScanSector
  opportunityScore: number
  rank: number // hesaplanan plan sıralama skoru (deterministik)
}

// sectorRotation ile aynı smoothing — dönüşüm geçmişi 0.5x..2.5x çarpan.
const BAND_WEIGHT: Record<TicketBand, number> = { premium: 4, high: 3, mid: 2, low: 1 }
const PRIOR_ENGAGEMENT = 0.2
const LEARNED_MIN = 0.5
const LEARNED_MAX = 2.5
const EXPLORATION_SLOT = 1

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function hash01(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0) / 2 ** 32
}

// Laplace-smoothed engagement → öğrenilmiş çarpan. Veri yoksa nötr 1.0 civarı.
function learnedMultiplier(st: SectorEngagement | undefined): number {
  const total = st?.total ?? 0
  const engaged = (st?.engaged ?? 0) + (st?.converted ?? 0) // dönüşüm çift sayılır
  const smoothed = (engaged + 1) / (total + 1 / PRIOR_ENGAGEMENT)
  return clamp(smoothed / PRIOR_ENGAGEMENT, LEARNED_MIN, LEARNED_MAX)
}

/**
 * Günün şehir×sektör tarama planı. Deterministik: aynı daySequence + aynı stats → aynı plan.
 * Aday evreni SCAN_TARGETS (top-30) — hedefli kalır. Eksik şehir/sektör adayları sessizce atlanır.
 *
 * rank = opportunityScore × bandWeight × learnedSector × learnedCity × jitter
 * exploration floor: SCAN_TARGETS[day % N] plan slot 1'e zorlanır (her çift N günde garanti).
 */
export function buildDailyTargetPlan(
  daySequence: number,
  sectorStats: Map<string, SectorEngagement>,
  cityStats: Map<string, SectorEngagement>,
): TargetCandidate[] {
  const cityById = new Map(SCAN_CITIES.map(c => [c.id, c]))
  const sectorById = new Map(SCAN_SECTORS.map(s => [s.id, s]))

  const scored = SCAN_TARGETS
    .map(target => {
      const city = cityById.get(target.cityId)
      const sector = sectorById.get(target.sectorId)
      if (!city || !sector) return null // savunmacı: tanımsız çift atlanır

      const learnedSector = learnedMultiplier(sectorStats.get(sector.id))
      const learnedCity = learnedMultiplier(cityStats.get(`${city.id}:${sector.id}`))
      const jitter = 0.85 + 0.3 * hash01(`${daySequence}:${city.id}:${sector.id}`)
      const rank =
        target.opportunityScore *
        BAND_WEIGHT[sector.ticketBand] *
        learnedSector *
        learnedCity *
        jitter

      const candidate: TargetCandidate = {
        cityId: city.id,
        city: city.displayName,
        districts: city.districts,
        sector,
        opportunityScore: target.opportunityScore,
        rank,
      }
      return { candidate, targetId: `${target.cityId}:${target.sectorId}` }
    })
    .filter((x): x is { candidate: TargetCandidate; targetId: string } => x !== null)

  const ordered = scored.sort((a, b) => b.candidate.rank - a.candidate.rank).map(x => x.candidate)

  // Exploration floor: bugünün zorunlu çifti planın 2. sırasına çekilir.
  if (ordered.length > EXPLORATION_SLOT) {
    const floorTarget = SCAN_TARGETS[((daySequence % SCAN_TARGETS.length) + SCAN_TARGETS.length) % SCAN_TARGETS.length]
    const floorIdx = ordered.findIndex(c => c.cityId === floorTarget.cityId && c.sector.id === floorTarget.sectorId)
    if (floorIdx > EXPLORATION_SLOT) {
      const [floor] = ordered.splice(floorIdx, 1)
      ordered.splice(EXPLORATION_SLOT, 0, floor)
    }
  }

  return ordered
}

interface CityEngagementRow {
  sector_key: string | null
  city_key: string | null
  total_leads: number | null
  engaged_leads: number | null
  converted_leads: number | null
}

/**
 * sector_city_engagement_stats view'ından şehir×sektör engagement okur.
 * Composite key: `${cityId}:${sectorId}`. View yoksa/boşsa boş Map (graceful degradation) —
 * plan saf opportunityScore + bandWeight'e düşer, ASLA throw etmez.
 */
export async function loadCityEngagement(): Promise<Map<string, SectorEngagement>> {
  const stats = new Map<string, SectorEngagement>()
  try {
    const { data, error } = await supabaseAdmin
      .from('sector_city_engagement_stats')
      .select('sector_key, city_key, total_leads, engaged_leads, converted_leads')

    if (error || !data) {
      if (error) console.warn('[CITY TARGETING] Engagement view okunamadı:', error.message)
      return stats
    }

    for (const row of data as CityEngagementRow[]) {
      const sectorKey = (row.sector_key || '').toLowerCase().trim()
      const cityKey = (row.city_key || '').toLowerCase().trim()
      if (!sectorKey || !cityKey) continue

      const sector = SCAN_SECTORS.find(s => s.matchKeywords.some(kw => sectorKey.includes(kw)))
      if (!sector) continue
      const city = SCAN_CITIES.find(c => cityKey === c.id || cityKey.startsWith(c.id + '-') || slugify(cityKey) === c.id)
      if (!city) continue

      const compositeKey = `${city.id}:${sector.id}`
      const prev = stats.get(compositeKey) || { total: 0, engaged: 0, converted: 0 }
      stats.set(compositeKey, {
        total: prev.total + (row.total_leads || 0),
        engaged: prev.engaged + (row.engaged_leads || 0),
        converted: prev.converted + (row.converted_leads || 0),
      })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.warn('[CITY TARGETING] Engagement yüklenemedi, araştırma sıralamasına düşülüyor:', msg)
  }
  return stats
}
