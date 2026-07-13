import { describe, it, expect, vi, beforeEach } from 'vitest'

// settings key/value mock deposu
const store = new Map<string, string>()
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_c: string, key: string) => ({
          maybeSingle: async () => {
            const v = store.get(key)
            return { data: v != null ? { value: v, id: `id-${key}` } : null, error: null }
          },
        }),
      }),
      update: (patch: { value: string }) => ({
        eq: async (_c: string, id: string) => {
          store.set(id.replace('id-', ''), patch.value)
          return { error: null }
        },
      }),
      insert: async (row: { key: string; value: string }) => {
        store.set(row.key, row.value)
        return { error: null }
      },
    }),
  },
}))

import {
  extractRemovedPhrases,
  recordVoiceDelta,
  getBannedPhrases,
  getPhraseCandidates,
  approveBannedPhrase,
  PROMOTE_THRESHOLD,
} from './voiceDna'

describe('Voice DNA v0 (Faz D1)', () => {
  beforeEach(() => store.clear())

  it('extractRemovedPhrases: operatörün SİLDİĞİ cümleler yakalanır, kalanlar yakalanmaz', () => {
    const original =
      'Merhaba Ayşe Hanım. Sektör lideri çözümler sunuyoruz. Randevu formunuz mobilde çalışmıyor. 15 dakika uygun musunuz?'
    const final =
      'Merhaba Ayşe Hanım. Randevu formunuz mobilde çalışmıyor. 15 dakika uygun musunuz?'
    const removed = extractRemovedPhrases(original, final)
    expect(removed).toEqual(['Sektör lideri çözümler sunuyoruz'])
  })

  it('küçük yazım farkı silme SAYILMAZ (fold karşılaştırma)', () => {
    const removed = extractRemovedPhrases('Görüşmek isterim sizinle.', 'gorusmek isterim sizinle')
    expect(removed).toEqual([])
  })

  it('PII içeren parçalar aday OLMAZ', () => {
    const removed = extractRemovedPhrases(
      'Bana ali@ornek.com adresinden ulaşın. Sektör lideri çözümler sunuyoruz.',
      'Kısa bir not.',
    )
    expect(removed).toEqual(['Sektör lideri çözümler sunuyoruz'])
  })

  it('recordVoiceDelta sayacı artırır; eşik geçince readyForReview; otomatik yasak YOK', async () => {
    const orig = 'Sektör lideri çözümler sunuyoruz. Kalan metin.'
    const fin = 'Kalan metin.'
    for (let i = 0; i < PROMOTE_THRESHOLD; i++) await recordVoiceDelta(orig, fin)

    const candidates = await getPhraseCandidates()
    expect(candidates[0]).toMatchObject({
      phrase: 'Sektör lideri çözümler sunuyoruz',
      count: PROMOTE_THRESHOLD,
      readyForReview: true,
    })
    // Otomatik yasaklanmadı — onaylı liste hâlâ boş (salt model çıktısı ses sayılmaz).
    expect(await getBannedPhrases()).toEqual([])
  })

  it('approveBannedPhrase: operatör onayı adayı onaylı listeye taşır; lint bunu kullanır', async () => {
    await approveBannedPhrase('çözüm ortağınız')
    await approveBannedPhrase('çözüm ortağınız') // idempotent
    expect(await getBannedPhrases()).toEqual(['çözüm ortağınız'])
  })

  it('değişiklik yoksa hiçbir şey kaydedilmez', async () => {
    const n = await recordVoiceDelta('Aynı metin burada.', 'Aynı metin burada.')
    expect(n).toBe(0)
    expect(await getPhraseCandidates()).toEqual([])
  })
})
