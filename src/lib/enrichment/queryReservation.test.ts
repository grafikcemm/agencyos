import { describe, it, expect } from 'vitest'
import {
  queryHash,
  DRAFTING_ALWAYS_ALLOWED,
  canSendWith,
  sendBlockReason,
  STALE_AFTER_MS,
  type ReservationRequest,
} from './queryReservation'

const base: ReservationRequest = {
  provider: 'apollo',
  subjectType: 'company',
  subjectKey: 'sinoz.com.tr',
  params: { person_titles: ['CMO', 'Brand Director'], organization_num_employees_ranges: ['51,200'] },
}

describe('queryHash — çift ödeme korumasının anahtarı', () => {
  it('aynı sorgu aynı hash i üretir', () => {
    expect(queryHash(base)).toBe(queryHash({ ...base }))
  })

  it('parametre SIRASI hash i değiştirmez — aynı sorgu ikinci kez ödenmez', () => {
    const reordered: ReservationRequest = {
      ...base,
      params: {
        organization_num_employees_ranges: ['51,200'],
        person_titles: ['CMO', 'Brand Director'],
      },
    }
    expect(queryHash(reordered)).toBe(queryHash(base))
  })

  it('yuvalanmış nesnelerde de sıra bağımsız', () => {
    const a: ReservationRequest = { ...base, params: { f: { x: 1, y: 2 }, g: 3 } }
    const b: ReservationRequest = { ...base, params: { g: 3, f: { y: 2, x: 1 } } }
    expect(queryHash(a)).toBe(queryHash(b))
  })

  it('dizi SIRASI anlamlıdır — farklı sorgu sayılır', () => {
    const swapped: ReservationRequest = {
      ...base,
      params: { ...base.params, person_titles: ['Brand Director', 'CMO'] },
    }
    expect(queryHash(swapped)).not.toBe(queryHash(base))
  })

  it('özne anahtarı büyük/küçük harf ve boşluktan bağımsız', () => {
    expect(queryHash({ ...base, subjectKey: '  SINOZ.COM.TR ' })).toBe(queryHash(base))
  })

  it('sağlayıcı, özne tipi ve parametre değişimi hash i değiştirir', () => {
    expect(queryHash({ ...base, provider: 'serpapi' })).not.toBe(queryHash(base))
    expect(queryHash({ ...base, subjectType: 'person' })).not.toBe(queryHash(base))
    expect(queryHash({ ...base, subjectKey: 'bellamaison.com' })).not.toBe(queryHash(base))
    expect(queryHash({ ...base, params: { ...base.params, q_keywords: 'yeni' } })).not.toBe(
      queryHash(base),
    )
  })

  it('sha256 hex üretir — 64 karakter', () => {
    expect(queryHash(base)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('tahmin edilmiş e-posta kapısı', () => {
  it('taslak hazırlama güven seviyesinden BAĞIMSIZ olarak serbesttir', () => {
    // Bilinçli olarak dallanma yok: taslak yazmak ücretsiz ve geri alınabilir.
    expect(DRAFTING_ALWAYS_ALLOWED).toBe(true)
  })

  it('yalnız verified gönderilebilir', () => {
    expect(canSendWith('verified')).toBe(true)
    expect(canSendWith('probable')).toBe(false)
    expect(canSendWith('guessed')).toBe(false)
    expect(canSendWith(null)).toBe(false)
    expect(canSendWith(undefined)).toBe(false)
  })

  it('engel gerekçesi kullanıcıya okunabilir ve ayırt edici', () => {
    expect(sendBlockReason('verified')).toBeNull()
    expect(sendBlockReason('guessed')).toContain('sağlayıcı tahmini')
    expect(sendBlockReason('probable')).toContain('pattern eşleşmesi')
    expect(sendBlockReason(null)).toContain('bilinmiyor')
  })
})

describe('stale eşiği', () => {
  it('DB varsayılanıyla (5 dk) aynı — ayrışırsa devralma yanlış zamanda olur', () => {
    expect(STALE_AFTER_MS).toBe(5 * 60 * 1000)
  })
})
