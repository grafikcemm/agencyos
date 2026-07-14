import { describe, it, expect, vi, beforeEach } from 'vitest'

// settings key/value mock deposu (+ kontrollü hata enjeksiyonu)
const store = new Map<string, string>()
let readError: string | null = null
let writeError: string | null = null
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_c: string, key: string) => ({
          maybeSingle: async () => {
            if (readError) return { data: null, error: { message: readError } }
            const v = store.get(key)
            return { data: v != null ? { value: v, id: `id-${key}` } : null, error: null }
          },
        }),
      }),
      update: (patch: { value: string }) => ({
        eq: async (_c: string, id: string) => {
          if (writeError) return { error: { message: writeError } }
          store.set(id.replace('id-', ''), patch.value)
          return { error: null }
        },
      }),
      insert: async (row: { key: string; value: string }) => {
        if (writeError) return { error: { message: writeError } }
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
  approveStyleRule,
  getApprovedStyleRules,
  getStyleCandidates,
  getVoiceContext,
  getVoiceProfile,
  recordStyleDelta,
  analyzeVoiceSamples,
  ingestVoiceSamples,
  PROMOTE_THRESHOLD,
} from './voiceDna'

describe('Voice DNA v0 (Faz D1)', () => {
  beforeEach(() => { store.clear(); readError = null; writeError = null })

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


// ── Faz 4.1: yapısal stil profili ─────────────────────────────────────────────
import { analyzeStyleDelta } from './voiceDna'

describe('analyzeStyleDelta (Faz 4.1 — yapısal profil, saf)', () => {
  it('resmiyet artışı + kısa cümle + CTA biçimi + kanıt korunumu çıkarılır', () => {
    const original =
      'Selam, sana çok uzun ve dolambaçlı bir şekilde anlatmak istediğim bir konu var ve bu cümle gerçekten gereksiz uzun. Görüşelim mi?'
    const final =
      'Merhaba Ayşe Hanım. Randevu formunuzu inceledim. Sizinle 15 dakika uygun musunuz?'
    const d = analyzeStyleDelta(original, final)
    expect(d.formalityDelta).toBe(1) // sen→siz/hanım
    expect(d.sentenceLen).toBe('shorter')
    expect(d.ctaForm).toBe('soru-15dk')
    expect(d.keepsEvidence).toBe(true) // "inceledim" korunmuş
    expect(d.finalOpening).toContain('Merhaba')
  })

  it('PII içeren açılış profile SIZMAZ', () => {
    const d = analyzeStyleDelta('x', 'ayse@klinik.com adresine yazdım bugün. Görüşelim mi?')
    expect(d.finalOpening === null || !d.finalOpening.includes('@')).toBe(true)
  })

  it('fark yoksa deltalar nötr', () => {
    const body = 'Merhaba, kısa bir not. Görüşelim mi?'
    const d = analyzeStyleDelta(body, body)
    expect(d.formalityDelta).toBe(0)
    expect(d.sentenceLen).toBe('same')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 2 — voiceDna kritik eşiğe alındı (≥90L/85B): fail-closed
// hata yolları + yapısal gözlem/aday/profil/context zinciri.
// ─────────────────────────────────────────────────────────────────────────────
describe('fail-closed hata yolları (Faz 3.5/3.6)', () => {
  beforeEach(() => { store.clear(); readError = null; writeError = null })

  it('getBannedPhrases: okuma hatası THROW (fail-open yok)', async () => {
    readError = 'db down'
    await expect(getBannedPhrases()).rejects.toThrow(/okunamadı/)
  })

  it('getBannedPhrases: bozuk JSON THROW; dizi-dışı değer boş liste', async () => {
    store.set('voice_banned_phrases', '{bozuk')
    await expect(getBannedPhrases()).rejects.toThrow()
    store.set('voice_banned_phrases', '{"a":1}')
    expect(await getBannedPhrases()).toEqual([])
    store.set('voice_banned_phrases', '["x", 3, "y"]' as string)
    expect(await getBannedPhrases()).toEqual(['x', 'y'])
  })

  it('getApprovedStyleRules: kayıt yok → boş; okuma hatası → throw', async () => {
    expect(await getApprovedStyleRules()).toEqual({ positive: [], negative: [] })
    readError = 'down'
    await expect(getApprovedStyleRules()).rejects.toThrow(/okunamadı/)
  })

  it('approveStyleRule: kural tek yönlü eklenir; duplicate eklemez', async () => {
    await approveStyleRule('kısa cümleler', 'positive')
    await approveStyleRule('kısa cümleler', 'positive')
    await approveStyleRule('emoji kullanma', 'negative')
    expect(await getApprovedStyleRules()).toEqual({ positive: ['kısa cümleler'], negative: ['emoji kullanma'] })
  })

  it('approveBannedPhrase: yazma hatası THROW (sessiz kayıp yok)', async () => {
    writeError = 'disk dolu'
    await expect(approveBannedPhrase('kötü kalıp')).rejects.toThrow(/yazılamadı/)
  })

  it('recordVoiceDelta: yazma hatası akışı DÜŞÜRMEZ, 0 döner (görünür log)', async () => {
    readError = 'down'
    const n = await recordVoiceDelta('Silinecek uzun bir cümle burada.', 'Tamamen farklı içerik.')
    expect(n).toBe(0)
  })

  it('bozuk/eksik aday alanları: count/lastSeen fallback dallari (0, boş, trim sırası)', async () => {
    store.set('voice_phrase_candidates', JSON.stringify({ 'alansiz aday ifade': {}, 'sayili aday ifade': { count: 2, lastSeen: 't' } }))
    const c = await getPhraseCandidates()
    expect(c.find((x) => x.phrase === 'alansiz aday ifade')).toMatchObject({ count: 0, lastSeen: '', readyForReview: false })
    // recordVoiceDelta mevcut alansız girdinin üstüne sayaç ekler (prev?.count ?? 0 dalı).
    const n = await recordVoiceDelta('alansiz aday ifade burada duruyor.', 'Tamamen başka içerik.')
    expect(n).toBe(1)
    const after = await getPhraseCandidates()
    expect(after.find((x) => x.phrase.startsWith('alansiz aday ifade'))!.count).toBeGreaterThanOrEqual(1)
  })

  it('getPhraseCandidates: okuma hatası throw; kayıt yok → boş liste', async () => {
    expect(await getPhraseCandidates()).toEqual([])
    readError = 'down'
    await expect(getPhraseCandidates()).rejects.toThrow(/okunamadı/)
  })
})

describe('yapısal gözlem → aday → profil zinciri (Faz 4.1)', () => {
  beforeEach(() => { store.clear(); readError = null; writeError = null })

  const ORIG = 'Selam, sen bunu yapmalısın çünkü rakiplerin çok ilerde ve senin siten eski kaldı artık.'
  const FINAL = 'Merhaba, sitenizi inceledim. Sizinle kısa bir görüşme yapmak isterim. 15 dakika uygun musunuz?'

  it('recordStyleDelta: gözlem sayaçları birikir (sektör varyantı dahil)', async () => {
    await recordStyleDelta(ORIG, FINAL, 'klinik')
    await recordStyleDelta(ORIG, FINAL, 'klinik')
    await recordStyleDelta(ORIG, FINAL)
    const candidates = await getStyleCandidates()
    expect(candidates.length).toBeGreaterThan(0)
    const formal = candidates.find((c) => c.rule.includes('resmi'))
    expect(formal?.count).toBe(3)
    expect(formal?.readyForReview).toBe(true)
    const opening = candidates.find((c) => c.rule.startsWith('Açılış biçimi'))
    expect(opening).toBeTruthy()
    const cta = candidates.find((c) => c.rule.startsWith('CTA biçimi'))
    expect(cta).toBeTruthy()
    const evid = candidates.find((c) => c.rule.includes('kanıt'))
    expect(evid?.count).toBe(3)
  })

  it('recordStyleDelta: yazma hatası akışı düşürmez (best-effort)', async () => {
    writeError = 'down'
    await expect(recordStyleDelta(ORIG, FINAL)).resolves.toBeUndefined()
  })

  it('getVoiceProfile: sıfır veri = baseline; onaylı kural gelince baseline düşer', async () => {
    const p0 = await getVoiceProfile()
    expect(p0.baseline).toBe(true)
    expect(p0.observationCount).toBe(0)
    await approveStyleRule('kısa cümleler', 'positive')
    await recordStyleDelta(ORIG, FINAL)
    const p1 = await getVoiceProfile()
    expect(p1.baseline).toBe(false)
    expect(p1.observationCount).toBe(1)
    expect(p1.approved.positive).toEqual(['kısa cümleler'])
  })

  it('getVoiceContext: kurallar + yasaklılar tek noktadan; okuma hatası THROW', async () => {
    await approveStyleRule('kısa cümleler', 'positive')
    store.set('voice_banned_phrases', JSON.stringify(['sinerji']))
    const ctx = await getVoiceContext()
    expect(ctx.rules.positive).toEqual(['kısa cümleler'])
    expect(ctx.banned).toEqual(['sinerji'])
    readError = 'down'
    await expect(getVoiceContext()).rejects.toThrow()
  })

  it('getStyleCandidates: daha uzun cümle + samimi ton yönleri de aday üretir', async () => {
    const orig = 'Merhaba, sizinle kısa bir bilgi paylaşmak isterim. Rica etsem bakar mısınız?'
    const fin = 'Selam, sen bence şu siteye bir bak çünkü orada senin işine yarayacak epey uzun ve detaylı anlatılmış pek çok şey var kanka.'
    await recordStyleDelta(orig, fin)
    const candidates = await getStyleCandidates()
    expect(candidates.find((c) => c.rule.includes('samimi'))?.count).toBe(1)
    expect(candidates.find((c) => c.rule.includes('uzun'))?.count).toBe(1)
  })
})

describe('Voice DNA ONBOARDING — örnek yükleme (Faz 7)', () => {
  beforeEach(() => { store.clear(); readError = null; writeError = null })

  it('analyzeVoiceSamples: resmi ton + kısa cümle + açılış çıkarır (SAF)', () => {
    const a = analyzeVoiceSamples([
      'Merhaba, size kısa bir teklifimiz var. Rica ederim değerlendirin. Saygılar.',
      'Sayın yetkili, sizin için hazırladık. İyi çalışmalar.',
    ])
    expect(a.sampleCount).toBe(2)
    expect(a.formality.formal).toBe(2)
    expect(a.sentenceLen.shorter).toBeGreaterThan(0)
    expect(Object.keys(a.openings).length).toBeGreaterThan(0)
  })

  it('analyzeVoiceSamples: çok kısa metin örnek sayılmaz', () => {
    const a = analyzeVoiceSamples(['kısa', 'ok'])
    expect(a.sampleCount).toBe(0)
  })

  it('analyzeVoiceSamples: samimi ton tespiti', () => {
    const a = analyzeVoiceSamples(['Selam kanka, sana bir fikrim var. Hey, bak ne buldum.'])
    expect(a.formality.informal).toBe(1)
  })

  it('ingestVoiceSamples: gözlem havuzuna EKLER ama ONAYSIZ AKTİF ETMEZ', async () => {
    const n = await ingestVoiceSamples([
      'Merhaba, size kısa bir teklifimiz var. Rica ederim değerlendirin. Saygılar.',
      'Sayın yetkili, sizin için özel hazırladık. İyi çalışmalar dilerim.',
    ])
    expect(n).toBe(2)
    // Aday olarak yüzeye çıkar...
    const candidates = await getStyleCandidates()
    expect(candidates.length).toBeGreaterThan(0)
    // ...ama AKTİF profil hâlâ BOŞ (onay yapılmadı).
    const active = await getApprovedStyleRules()
    expect(active.positive).toHaveLength(0)
    expect(active.negative).toHaveLength(0)
  })

  it('ingestVoiceSamples: örnek yoksa 0 (sahte iddia yok, yazım yok)', async () => {
    const n = await ingestVoiceSamples(['x', ''])
    expect(n).toBe(0)
    const active = await getApprovedStyleRules()
    expect(active.positive).toHaveLength(0)
  })
})
