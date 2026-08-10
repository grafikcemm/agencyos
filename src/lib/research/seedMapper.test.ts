import { describe, it, expect } from 'vitest'
import {
  mapResearchLead,
  mergeIntoExisting,
  insertRow,
  parseTriggerDate,
  PROTECTED_FIELDS,
  SOURCE_BATCH,
  researchCountryCode,
  type RawResearchLead,
} from './seedMapper'
import { normalizeDomain } from '../leads/domain'
import { toScoreReasons, breakdownMatchesScore, scoreBand } from './scoreReasons'

const NOW = '2026-08-10T09:00:00.000Z'

async function loadLeads(): Promise<RawResearchLead[]> {
  const mod = (await import('../../../docs/grafikcem-b2b-pazar-arastirmasi-2026-08-09.json', {
    with: { type: 'json' },
  })) as unknown as { default: { leads: RawResearchLead[] } }
  return mod.default.leads
}

describe('parseTriggerDate', () => {
  it('yalnız tam ISO tarihi ayrıştırır', () => {
    expect(parseTriggerDate('2026-07-23')).toBe('2026-07-23')
  })

  it('kesinlik UYDURMAZ — kısmi tarihler null döner', () => {
    for (const raw of ['2026', '2025-2026', '2026-02', '2026-Q1', '2025-09', 'Belirsiz', '']) {
      expect(parseTriggerDate(raw), `${raw} ayrıştırılmamalı`).toBeNull()
    }
    expect(parseTriggerDate(null)).toBeNull()
    expect(parseTriggerDate(undefined)).toBeNull()
  })

  it('takvimde olmayan tarihi reddeder', () => {
    expect(parseTriggerDate('2026-02-31')).toBeNull()
    expect(parseTriggerDate('2026-13-01')).toBeNull()
  })
})

describe('mapResearchLead — 60 kaydın tamamı', () => {
  it('her kaydı eşleştirilebilir bir anahtarla haritalar', async () => {
    const leads = await loadLeads()
    expect(leads).toHaveLength(60)

    const keys = new Set<string>()
    for (const raw of leads) {
      const mapped = mapResearchLead(raw, NOW)
      expect(mapped.matchKey, `${raw.company} anahtarsız`).not.toBe('')
      expect(mapped.matchKey).toBe(normalizeDomain(raw.domain))
      keys.add(mapped.matchKey)
    }
    expect(keys.size).toBe(60)
  })

  it('kırılım toplamı skoru tutuyor — 60/60 skor yazılabilir', async () => {
    const leads = await loadLeads()
    for (const raw of leads) {
      expect(
        breakdownMatchesScore(raw.lead_score_breakdown, raw.lead_score),
        `${raw.company} kırılımı uyuşmuyor`,
      ).toBe(true)
      const mapped = mapResearchLead(raw, NOW)
      expect(mapped.fields.research_score).toBe(raw.lead_score)
      expect(mapped.warnings).toEqual([])
    }
  })

  it('operasyonel skor alanlarına HİÇ dokunmaz', async () => {
    const leads = await loadLeads()
    for (const raw of leads) {
      const mapped = mapResearchLead(raw, NOW)
      for (const forbidden of ['potential_score', 'base_score', 'score_reasons', 'confidence']) {
        expect(mapped.fields).not.toHaveProperty(forbidden)
      }
    }
  })

  it('boş decision_maker_linkedin null a iner (58/60 kayıtta boş string)', async () => {
    const leads = await loadLeads()
    const empties = leads.filter((l) => l.decision_maker_linkedin === '')
    expect(empties.length).toBe(58)
    const mapped = mapResearchLead(empties[0], NOW)
    const prov = mapped.fields.provenance as { decision_maker_linkedin: string | null }
    expect(prov.decision_maker_linkedin).toBeNull()
  })

  it('niş dağılımı 20/20/20, güven dağılımı 36/22/2', async () => {
    const leads = await loadLeads()
    const byNiche: Record<string, number> = {}
    const byConfidence: Record<string, number> = {}
    for (const raw of leads) {
      const mapped = mapResearchLead(raw, NOW)
      byNiche[mapped.fields.niche_id as string] = (byNiche[mapped.fields.niche_id as string] ?? 0) + 1
      const c = mapped.fields.research_confidence as string
      byConfidence[c] = (byConfidence[c] ?? 0) + 1
    }
    expect(byNiche).toEqual({
      beauty_fragrance_cosmetics: 20,
      premium_home_kitchen_multibrand: 20,
      toy_kids_family: 20,
    })
    expect(byConfidence).toEqual({ high: 36, medium: 22, low: 2 })
  })

  it('Türkiye ve Global pazar kapsamını ülke koduyla birlikte taşır', async () => {
    const leads = await loadLeads()
    for (const raw of leads) {
      const fields = mapResearchLead(raw, NOW).fields
      const code = researchCountryCode(raw.country)
      expect(code, raw.country).toMatch(/^[A-Z]{2}$/)
      expect(fields.country_code).toBe(code)
      expect(fields.market_scope).toBe(code === 'TR' ? 'tr' : 'global')
      expect(fields.source_provider).toBe('research_seed')
    }
    expect(leads.filter((lead) => researchCountryCode(lead.country) === 'TR')).toHaveLength(45)
    expect(leads.filter((lead) => researchCountryCode(lead.country) !== 'TR')).toHaveLength(15)
  })

  it('9 Ağustos verisi 10 Ağustos ta zaten 14 günden yeni — yeniden doğrulama gerekmez', async () => {
    const leads = await loadLeads()
    const mapped = mapResearchLead(leads[0], NOW)
    expect(mapped.needsReverification).toBe(false)
    expect(mapped.fields.next_check_date).toBeNull()
  })

  it('14 günden eski olduğunda satış eylemi için yeniden doğrulama işaretlenir', async () => {
    const leads = await loadLeads()
    const mapped = mapResearchLead(leads[0], '2026-09-01T09:00:00.000Z')
    expect(mapped.needsReverification).toBe(true)
    expect(mapped.fields.next_check_date).toBe('2026-09-01')
  })

  it('provenance her kayıtta kaynak, tarih ve kanıt taşır', async () => {
    const leads = await loadLeads()
    for (const raw of leads) {
      const prov = mapResearchLead(raw, NOW).fields.provenance as Record<string, unknown>
      expect(prov.source).toBe('research_seed')
      expect(prov.research_date).toBe('2026-08-09')
      expect(Array.isArray(prov.evidence_urls)).toBe(true)
      expect((prov.evidence_urls as string[]).length).toBe(2)
    }
  })
})

describe('mergeIntoExisting — ezme yok', () => {
  it('korumalı alanların hiçbirine patch üretmez', async () => {
    const leads = await loadLeads()
    const mapped = mapResearchLead(leads[0], NOW)

    // Mevcut satır: her korumalı alan dolu ve araştırmadan FARKLI.
    const existing: Record<string, unknown> = {}
    for (const field of PROTECTED_FIELDS) existing[field] = 'OPERASYONEL-DEGER'

    const { patch } = mergeIntoExisting(existing, mapped)
    for (const field of PROTECTED_FIELDS) {
      expect(patch, `${field} ezildi`).not.toHaveProperty(field)
    }
  })

  it('dolu araştırma alanını korur, yalnız boş olanı doldurur', async () => {
    const leads = await loadLeads()
    const mapped = mapResearchLead(leads[0], NOW)

    const existing = {
      niche_id: 'ONCEDEN-VAR',
      trigger_label: null,
      case_match: '',
      evidence_urls: [],
    }

    const { patch, keptExisting } = mergeIntoExisting(existing, mapped)
    expect(keptExisting).toContain('niche_id')
    expect(patch).not.toHaveProperty('niche_id')
    // null / '' / [] boş sayılır → doldurulur
    expect(patch).toHaveProperty('trigger_label')
    expect(patch).toHaveProperty('case_match')
    expect(patch).toHaveProperty('evidence_urls')
  })

  it('mevcut satırın provenance ını EZMEZ — kökeni kaybolmaz', async () => {
    const leads = await loadLeads()
    const mapped = mapResearchLead(leads[0], NOW)
    const existing = {
      provenance: { source: 'google_places', discovered_at: '2026-05-01' },
      source_batch: 'places-2026-05',
    }
    const { patch, keptExisting } = mergeIntoExisting(existing, mapped)
    expect(patch).not.toHaveProperty('provenance')
    expect(patch).not.toHaveProperty('source_batch')
    expect(keptExisting).toEqual(expect.arrayContaining(['provenance', 'source_batch']))
  })

  it('IDEMPOTENT — seed sonrası ikinci koşu sıfır alan değiştirir', async () => {
    const leads = await loadLeads()
    for (const raw of leads.slice(0, 10)) {
      const mapped = mapResearchLead(raw, NOW)
      // İlk koşunun sonucu = insertRow çıktısı
      const afterFirstRun = insertRow(mapped)
      const { patch } = mergeIntoExisting(afterFirstRun, mapped)
      expect(patch, `${raw.company} ikinci koşuda değişti: ${JSON.stringify(patch)}`).toEqual({})
    }
  })

  it('tamamen boş bir satırda tüm araştırma alanlarını doldurur', async () => {
    const leads = await loadLeads()
    const mapped = mapResearchLead(leads[0], NOW)
    const { patch } = mergeIntoExisting({}, mapped)
    expect(Object.keys(patch).length).toBeGreaterThan(15)
    expect(patch.source_batch).toBe(SOURCE_BATCH)
  })
})

describe('insertRow — yeni satır başlangıç durumu', () => {
  it('uyum alanlarını varsaymaz', async () => {
    const leads = await loadLeads()
    const row = insertRow(mapResearchLead(leads[0], NOW))
    expect(row.status).toBe('new')
    expect(row.suppression_status).toBe('unknown')
    // Yasal dayanak sistemin varsayabileceği bir şey değil.
    expect(row.lawful_basis).toBeNull()
  })

  it('LinkedIn i olan kayıt enriched, olmayan unenriched başlar', async () => {
    const leads = await loadLeads()
    const withLinkedin = leads.find((l) => l.decision_maker_linkedin !== '')!
    const without = leads.find((l) => l.decision_maker_linkedin === '')!
    expect(insertRow(mapResearchLead(withLinkedin, NOW)).contact_status).toBe('enriched')
    expect(insertRow(mapResearchLead(without, NOW)).contact_status).toBe('unenriched')
  })
})

describe('scoreReasons', () => {
  it('ham kırılımı ağırlık sırasına göre gösterime çevirir', async () => {
    const leads = await loadLeads()
    const { reasons, total, unknownKeys } = toScoreReasons(leads[0].lead_score_breakdown)
    expect(unknownKeys).toEqual([])
    expect(reasons[0].reason).toBe('Hizmet uyumu')
    expect(reasons[0].max).toBe(25)
    expect(total).toBe(leads[0].lead_score)
  })

  it('tanınmayan anahtarı sessizce yutmaz', () => {
    const { unknownKeys } = toScoreReasons({ service_fit: 25, yeni_kriter: 10 } as never)
    expect(unknownKeys).toEqual(['yeni_kriter'])
  })

  it('kırılım skoru tutmuyorsa güvenilmez sayar', () => {
    expect(breakdownMatchesScore({ service_fit: 25 }, 94)).toBe(false)
    expect(breakdownMatchesScore(null, 94)).toBe(false)
    expect(breakdownMatchesScore({ service_fit: 25 }, null)).toBe(false)
  })

  it('araştırma eşiklerini uygular', () => {
    expect(scoreBand(95)).toBe('immediate')
    expect(scoreBand(80)).toBe('immediate')
    expect(scoreBand(79)).toBe('second_priority')
    expect(scoreBand(65)).toBe('second_priority')
    expect(scoreBand(64)).toBe('nurture')
    expect(scoreBand(52)).toBe('nurture')
    expect(scoreBand(49)).toBe('exclude')
    expect(scoreBand(null)).toBeNull()
  })
})
