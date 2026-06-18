import { describe, it, expect } from 'vitest'
import {
  SCAN_CITIES,
  SCAN_TARGETS,
  buildDailyTargetPlan,
} from './cityTargeting'
import { SCAN_SECTORS, type SectorEngagement } from './sectorRotation'
import { matchSectorProfile } from './sectorPriority'
import { getCityBonus } from './leadScoringV3'
import { normalizeSector } from './geo'

const EMPTY = new Map<string, SectorEngagement>()

describe('SCAN_TARGETS / SCAN_CITIES bütünlüğü', () => {
  it('her hedefin cityId SCAN_CITIES içinde olmalı', () => {
    const cityIds = new Set(SCAN_CITIES.map(c => c.id))
    for (const t of SCAN_TARGETS) {
      expect(cityIds.has(t.cityId), `bilinmeyen şehir: ${t.cityId}`).toBe(true)
    }
  })

  it('her hedefin sectorId SCAN_SECTORS içinde olmalı', () => {
    const sectorIds = new Set(SCAN_SECTORS.map(s => s.id))
    for (const t of SCAN_TARGETS) {
      expect(sectorIds.has(t.sectorId), `bilinmeyen sektör: ${t.sectorId}`).toBe(true)
    }
  })

  it('her şehrin topSectors girdileri SCAN_SECTORS içinde olmalı', () => {
    const sectorIds = new Set(SCAN_SECTORS.map(s => s.id))
    for (const c of SCAN_CITIES) {
      for (const sid of c.topSectors) {
        expect(sectorIds.has(sid), `${c.id} topSectors bilinmeyen: ${sid}`).toBe(true)
      }
    }
  })

  it('cityBonus leadScoringV3 CITY_BONUS ile senkron olmalı', () => {
    for (const c of SCAN_CITIES) {
      expect(getCityBonus(c.displayName), `${c.id} bonus drift`).toBe(c.cityBonus)
    }
  })
})

describe('buildDailyTargetPlan', () => {
  it('boş stats → opportunityScore × bandWeight sırasına yakın deterministik plan', () => {
    const a = buildDailyTargetPlan(0, EMPTY, EMPTY)
    const b = buildDailyTargetPlan(0, EMPTY, EMPTY)
    // Determinizm
    expect(a.map(c => `${c.cityId}:${c.sector.id}`)).toEqual(b.map(c => `${c.cityId}:${c.sector.id}`))
    expect(a.length).toBe(SCAN_TARGETS.length)
  })

  it('farklı günler farklı jitter → en azından bazı sıralar değişir', () => {
    const d0 = buildDailyTargetPlan(0, EMPTY, EMPTY).map(c => `${c.cityId}:${c.sector.id}`)
    const d7 = buildDailyTargetPlan(7, EMPTY, EMPTY).map(c => `${c.cityId}:${c.sector.id}`)
    expect(d0).not.toEqual(d7)
  })

  it('yüksek dönüşümlü şehir×sektör çifti üst sıraya çıkar', () => {
    const target = SCAN_TARGETS[SCAN_TARGETS.length - 1] // en düşük opportunityScore
    const key = `${target.cityId}:${target.sectorId}`
    const baseline = buildDailyTargetPlan(3, EMPTY, EMPTY)
    const baseIdx = baseline.findIndex(c => `${c.cityId}:${c.sector.id}` === key)

    const cityStats = new Map<string, SectorEngagement>()
    cityStats.set(key, { total: 20, engaged: 18, converted: 15 }) // güçlü dönüşüm
    const boosted = buildDailyTargetPlan(3, EMPTY, cityStats)
    const boostedIdx = boosted.findIndex(c => `${c.cityId}:${c.sector.id}` === key)

    expect(boostedIdx).toBeLessThan(baseIdx)
  })

  it('exploration floor: günün zorunlu çifti slot 1\'e gelir', () => {
    // daySequence öyle seç ki floor çifti normalde üst 2\'de olmasın.
    for (let day = 0; day < SCAN_TARGETS.length; day++) {
      const plan = buildDailyTargetPlan(day, EMPTY, EMPTY)
      const floor = SCAN_TARGETS[day % SCAN_TARGETS.length]
      const floorKey = `${floor.cityId}:${floor.sectorId}`
      const idx = plan.findIndex(c => `${c.cityId}:${c.sector.id}` === floorKey)
      // floor ya slot 0 (zaten üstte) ya da slot 1\'e zorlanmış olmalı
      expect(idx, `gün ${day} floor ${floorKey} idx ${idx}`).toBeLessThanOrEqual(1)
    }
  })

  it('candidate.city geo canonical, districts dizi', () => {
    const plan = buildDailyTargetPlan(0, EMPTY, EMPTY)
    for (const c of plan) {
      expect(typeof c.city).toBe('string')
      expect(c.city.length).toBeGreaterThan(0)
      expect(Array.isArray(c.districts)).toBe(true)
    }
  })
})

describe('keyword-sync sözleşmesi', () => {
  // Her SCAN sektörünün displayName\'i normalizeSector sonrası gerçek bir scoring
  // profiline (other değil) düşmeli — yoksa scan eder ama priority 25 alır.
  it('her SCAN_SECTORS displayName bir profile (other değil) eşleşmeli', () => {
    for (const s of SCAN_SECTORS) {
      const leadSector = normalizeSector(s.displayName)
      const profile = matchSectorProfile(leadSector)
      expect(profile.id, `${s.id} → other\'a düşüyor (scoring profili yok)`).not.toBe('other')
    }
  })

  it('her SCAN_SECTORS displayName kendi matchKeywords\'ünden en az birini içermeli (engagement attribution)', () => {
    for (const s of SCAN_SECTORS) {
      const lower = s.displayName.toLowerCase()
      const hit = s.matchKeywords.some(kw => lower.includes(kw))
      expect(hit, `${s.id} displayName "${s.displayName}" hiçbir matchKeyword içermiyor`).toBe(true)
    }
  })

  it('kritik SCAN sektörleri DOĞRU profile düşmeli (generic-steal yok)', () => {
    // SCAN id → beklenen SECTOR_PROFILES id
    const expected: Record<string, string> = {
      medikal_turizm: 'medical_tourism',
      klinik_zinciri: 'clinic_chain',
      veteriner: 'veterinary',
      psikolog_diyetisyen: 'psychology',
      dis_klinigi: 'health_clinic',
      medikal_estetik: 'health_clinic',
      ozel_saglik: 'health_clinic',
      luks_gayrimenkul: 'luxury_real_estate',
      emlak: 'real_estate',
      guzellik: 'beauty',
      moda_giyim: 'fashion',
      restoran_kafe: 'restaurant',
      hukuk: 'legal',
      mimarlik: 'architecture',
      ev_dekorasyon: 'home_decor',
      otel: 'tourism',
      spor_salonu: 'spor',
      dugun_organizasyon: 'wedding',
      ozel_kurs: 'private_course',
      ozel_okul: 'education',
    }
    for (const [scanId, profileId] of Object.entries(expected)) {
      const scan = SCAN_SECTORS.find(s => s.id === scanId)
      expect(scan, `SCAN sektörü yok: ${scanId}`).toBeTruthy()
      const profile = matchSectorProfile(normalizeSector(scan!.displayName))
      expect(profile.id, `${scanId} → ${profile.id} (beklenen ${profileId})`).toBe(profileId)
    }
  })

  it('engagement keyword loop her SCAN sektörünü kendi id\'sine çözmeli (ilk-eşleşen sıra doğru)', () => {
    // loadSectorEngagement: SCAN_SECTORS.find(s => matchKeywords.some(kw => key.includes(kw)))
    for (const s of SCAN_SECTORS) {
      const key = normalizeSector(s.displayName).toLowerCase().trim()
      const resolved = SCAN_SECTORS.find(x => x.matchKeywords.some(kw => key.includes(kw)))
      expect(resolved?.id, `${s.id} engagement\'ı ${resolved?.id}\'e mis-credit ediliyor`).toBe(s.id)
    }
  })
})
