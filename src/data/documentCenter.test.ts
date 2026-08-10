import { describe, it, expect } from 'vitest'
import {
  ALL_DOCUMENTS,
  DOCUMENT_DISCLAIMER,
  GLOBAL_DOCUMENTS,
  OUTREACH_COMPLIANCE_PACK,
  REVIEW_LABEL,
  STAGE_LABEL,
  STATUS_LABEL,
  TR_DOCUMENTS,
  counterpartOf,
  documentById,
  documentsFor,
  evaluateDocumentReadiness,
} from './documentCenter'
import {
  PENDING_PRICING_DECISIONS,
  PRICING_VERSIONS,
  approvedVersionFor,
  canSendProposal,
} from './pricingVersions'

describe('belge merkezi', () => {
  it('kimlikler benzersiz', () => {
    const ids = ALL_DOCUMENTS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('TR ve Global paketler ayrı ayrı dolu', () => {
    expect(TR_DOCUMENTS.length).toBeGreaterThanOrEqual(16)
    expect(GLOBAL_DOCUMENTS.length).toBeGreaterThanOrEqual(19)
    expect(documentsFor('TR').length).toBe(TR_DOCUMENTS.length + OUTREACH_COMPLIANCE_PACK.length)
  })

  it('eş belge bağı iki yönlü çözülür', () => {
    for (const doc of ALL_DOCUMENTS) {
      if (!doc.counterpart) continue
      const other = counterpartOf(doc.id)
      expect(other, `${doc.id} → ${doc.counterpart} bulunamadı`).not.toBeNull()
      expect(other!.jurisdiction).not.toBe(doc.jurisdiction)
    }
  })

  it('TR ve EN sürümler ÇEVİRİ değil ayrı hukuk metni olarak yönetilir', () => {
    const msa = documentById('en-msa')!
    const cerceve = documentById('tr-cerceve-hizmet-sozlesmesi')!
    expect(msa.counterpart).toBe(cerceve.id)
    // Girdi alanları ayrı isimlendirilmiştir — tek bir metnin çevirisi değildir.
    expect(msa.requiredInputs).not.toEqual(cerceve.requiredInputs)
  })

  it('hiçbir belge hazır/imzalı doğmaz', () => {
    for (const d of ALL_DOCUMENTS) {
      expect(d.status).toBe('sablon_yok')
    }
  })

  it('hukuki belgeler uzman incelemesi ister', () => {
    const legal = ['tr-cerceve-hizmet-sozlesmesi', 'en-msa', 'tr-nda', 'en-dpa', 'tr-kvkk-aydinlatma']
    for (const id of legal) {
      expect(documentById(id)!.requiresReview).not.toBe('yok')
    }
  })

  it('W-8 form türü VARSAYILMAZ', () => {
    const tax = documentById('en-tax-forms')!
    expect(tax.note).toContain('VARSAYILMAZ')
    expect(tax.requiresReview).toBe('mali_musavir')
  })

  it('outreach uyum paketi ülke politikası, tacir kanıtı ve suppression SOP taşır', () => {
    const ids = OUTREACH_COMPLIANCE_PACK.map((d) => d.id)
    expect(ids).toContain('pack-country-policy')
    expect(ids).toContain('pack-tacir-kaniti')
    expect(ids).toContain('pack-suppression-sop')
    expect(ids).toContain('pack-provenance')
  })

  it('arayüz etiketleri ham enum göstermez', () => {
    for (const v of Object.values(STAGE_LABEL)) expect(v).not.toMatch(/_/)
    for (const v of Object.values(STATUS_LABEL)) expect(v).not.toMatch(/[a-z]_[a-z]/)
    for (const v of Object.values(REVIEW_LABEL)) expect(v).not.toMatch(/[a-z]_[a-z]/)
  })
})

describe('belge üretilebilirliği', () => {
  const nda = documentById('tr-nda')!

  it('eksik girdiyle taslak ÜRETİLMEZ', () => {
    const r = evaluateDocumentReadiness(nda, { musteri_unvani: 'X A.Ş.' })
    expect(r.canDraft).toBe(false)
    expect(r.missingInputs.length).toBeGreaterThan(0)
  })

  it('boş string eksik sayılır', () => {
    const inputs = Object.fromEntries(nda.requiredInputs.map((k) => [k, 'x']))
    inputs.yetkili_kisi = '   '
    expect(evaluateDocumentReadiness(nda, inputs).canDraft).toBe(false)
  })

  it('girdiler tamsa taslak üretilebilir ama YİNE uzman uyarısı taşır', () => {
    const inputs = Object.fromEntries(nda.requiredInputs.map((k) => [k, 'x']))
    const r = evaluateDocumentReadiness(nda, inputs)
    expect(r.canDraft).toBe(true)
    expect(r.blockers).toContain(DOCUMENT_DISCLAIMER)
  })
})

describe('fiyat sürümleri — uydurma fiyat yok', () => {
  it('hiçbir sürüm onaylı DEĞİL', () => {
    expect(PRICING_VERSIONS.every((v) => v.status === 'draft')).toBe(true)
    expect(approvedVersionFor('tr')).toBeNull()
    expect(approvedVersionFor('global')).toBeNull()
  })

  it('hiçbir hizmetin tutarı uydurulmamış', () => {
    for (const v of PRICING_VERSIONS) {
      for (const s of v.services) {
        expect(s.amount).toBeNull()
        expect(s.assumptions.length).toBeGreaterThan(0)
      }
    }
  })

  it('teklif üretimi KARAR BEKLİYOR der ve kapalıdır', () => {
    for (const scope of ['tr', 'global'] as const) {
      const gate = canSendProposal(scope)
      expect(gate.allowed).toBe(false)
      expect(gate.reason).toContain('karar bekliyor')
    }
  })

  it('kullanıcıdan beklenen fiyat kararları açıkça listelenir', () => {
    expect(PENDING_PRICING_DECISIONS.length).toBeGreaterThanOrEqual(5)
    expect(PENDING_PRICING_DECISIONS.join(' ')).toContain('taban')
  })

  it('teklif belgesi onaylı fiyat sürümünü girdi olarak ister', () => {
    expect(documentById('tr-teklif')!.requiredInputs).toContain('onayli_fiyat_surumu')
    expect(documentById('en-proposal')!.requiredInputs).toContain('approved_pricing_version')
  })
})
