import { describe, it, expect, vi, beforeEach } from 'vitest'

// Canonical outbound gate (FINALIZATION Faz 1): sahiplik + semantik kanıt-uyum
// + fail-closed davranış + digest kararlılığı. Evidence META ve Voice DNA
// kontrollü mock; lint GERÇEK (qualityLint) çalışır.

let evidenceRows: Array<Record<string, unknown>> = []
let evidenceError: { message: string } | null = null
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        select: () => api,
        eq: () => api,
        limit: () => api,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            table === 'lead_evidence'
              ? { data: evidenceError ? null : evidenceRows, error: evidenceError }
              : { data: [], error: null },
          ).then(resolve),
      })
      return api
    },
  },
}))

let bannedPhrases: string[] = []
let bannedThrow = false
vi.mock('@/lib/outreach/voiceDna', () => ({
  getBannedPhrases: async () => {
    if (bannedThrow) throw new Error('banned okunamadı')
    return bannedPhrases
  },
}))

import { evaluateOutboundText, VIOLATION_FIX } from './outboundGate'
import { OPT_OUT_MARKER } from './auditCompliance'

// Geçerli e-posta iskeleti: işletme adı + tek CTA + opt-out (İYS).
const BASE_BODY = (extra: string) =>
  `Merhaba, Test Klinik için yazıyorum. ${extra} 15 dakika uygun musunuz?\n\nBu tür e-postaları istemiyorsanız "ret" yazmanız yeterli ${OPT_OUT_MARKER}.`

function opts(body: string, claimEvidence?: Array<{ claim: string; evidenceIds: string[] }>) {
  return {
    leadId: 'L1',
    businessName: 'Test Klinik',
    subject: 'Web siteniz hakkında',
    body,
    kind: 'cold_email' as const,
    claimEvidence,
  }
}

beforeEach(() => {
  evidenceRows = []
  evidenceError = null
  bannedPhrases = []
  bannedThrow = false
})

describe('evaluateOutboundText — temel akış', () => {
  it('iddiasız temiz metin: ok', async () => {
    const v = await evaluateOutboundText(opts(BASE_BODY('Web sitenizi yenilemek isterim.')))
    expect(v.ok).toBe(true)
    expect(v.violations).toEqual([])
    expect(v.digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('iddia + eşleme yok: CLAIM_WITHOUT_EVIDENCE bloklar (fix metni bağlı)', async () => {
    const v = await evaluateOutboundText(opts(BASE_BODY('Sitenize baktım, eksikler var.')))
    expect(v.ok).toBe(false)
    const codes = v.violations.map((x) => x.code)
    expect(codes).toContain('CLAIM_WITHOUT_EVIDENCE')
    expect(v.violations[0].fix).toBe(VIOLATION_FIX[v.violations[0].code])
  })

  it('iddia + sahipli uyumlu kanıt: ok', async () => {
    evidenceRows = [{ id: 'e1', kind: 'html_signal', source: 'scan', summary: 'site incelendi', payload: null, verified: false }]
    const v = await evaluateOutboundText(
      opts(BASE_BODY('Sitenize baktım, eksikler var.'), [{ claim: 'Sitenize baktım', evidenceIds: ['e1'] }]),
    )
    expect(v.ok).toBe(true)
  })

  it("lead'e ait OLMAYAN evidence id: eşleme düşer → bloklar", async () => {
    evidenceRows = [{ id: 'e1', kind: 'html_signal', source: 'scan', summary: '', payload: null, verified: false }]
    const v = await evaluateOutboundText(
      opts(BASE_BODY('Sitenize baktım.'), [{ claim: 'Sitenize baktım', evidenceIds: ['baska-leadin-kaniti'] }]),
    )
    expect(v.ok).toBe(false)
    expect(v.violations.map((x) => x.code)).toContain('CLAIM_WITHOUT_EVIDENCE')
  })
})

describe('semantik kanıt-uyum (CLAIM_EVIDENCE_MISMATCH)', () => {
  it('sonuç vaadi + gözlemsel kanıt: MISMATCH bloklar (alakasız kanıta bağlama geçmez)', async () => {
    evidenceRows = [{ id: 'e1', kind: 'pagespeed', source: 'scan', summary: 'LCP 6s', payload: null, verified: false }]
    const v = await evaluateOutboundText(
      opts(BASE_BODY('Bu değişiklik dönüşüm artışı sağlar.'), [{ claim: 'dönüşüm artışı sağlar', evidenceIds: ['e1'] }]),
    )
    expect(v.ok).toBe(false)
    expect(v.violations.map((x) => x.code)).toContain('CLAIM_EVIDENCE_MISMATCH')
  })

  it('sonuç vaadi + verified vaka kaydı: geçer', async () => {
    evidenceRows = [{ id: 'e1', kind: 'client_result', source: 'manual', summary: 'X kliniği dönüşüm artışı ölçüldü', payload: null, verified: true }]
    const v = await evaluateOutboundText(
      opts(BASE_BODY('Bu değişiklik dönüşüm artışı sağlar.'), [{ claim: 'dönüşüm artışı sağlar', evidenceIds: ['e1'] }]),
    )
    expect(v.ok).toBe(true)
  })

  it('sayılı gözlem: sayı kanıt özetinde geçiyorsa geçer, geçmiyorsa MISMATCH', async () => {
    evidenceRows = [{ id: 'e1', kind: 'review_signal', source: 'places', summary: 'Google: 4.2 puan, 37 yorum', payload: null, verified: false }]
    const ok = await evaluateOutboundText(
      opts(BASE_BODY('37 yorumunuza rağmen siteniz yok, inceledim.'), [{ claim: '37 yorumunuza rağmen siteniz yok, inceledim', evidenceIds: ['e1'] }]),
    )
    expect(ok.ok).toBe(true)
    const bad = await evaluateOutboundText(
      opts(BASE_BODY('120 yorumunuzu inceledim.'), [{ claim: '120 yorumunuzu inceledim', evidenceIds: ['e1'] }]),
    )
    expect(bad.ok).toBe(false)
    expect(bad.violations.map((x) => x.code)).toContain('CLAIM_EVIDENCE_MISMATCH')
  })

  it('davranış iddiası (müşteri kaybı): yorum sinyaliyle geçer, pagespeed ile geçmez', async () => {
    evidenceRows = [
      { id: 'rev', kind: 'review_signal', source: 'places', summary: 'olumsuz yorumlar', payload: null, verified: false },
      { id: 'ps', kind: 'pagespeed', source: 'scan', summary: 'LCP 6s', payload: null, verified: false },
    ]
    const ok = await evaluateOutboundText(
      opts(BASE_BODY('Bu durum müşteri kaybına yol açıyor.'), [{ claim: 'müşteri kaybına yol açıyor', evidenceIds: ['rev'] }]),
    )
    expect(ok.ok).toBe(true)
    const bad = await evaluateOutboundText(
      opts(BASE_BODY('Bu durum müşteri kaybına yol açıyor.'), [{ claim: 'müşteri kaybına yol açıyor', evidenceIds: ['ps'] }]),
    )
    expect(bad.ok).toBe(false)
  })

  it('birden çok kanıttan BİRİ uyumluysa iddia geçer', async () => {
    evidenceRows = [
      { id: 'ps', kind: 'pagespeed', source: 'scan', summary: '', payload: null, verified: false },
      { id: 'rev', kind: 'review_signal', source: 'places', summary: '', payload: null, verified: false },
    ]
    const v = await evaluateOutboundText(
      opts(BASE_BODY('Müşteri kaybı riski görüyorum, inceledim.'), [
        { claim: 'Müşteri kaybı riski görüyorum, inceledim', evidenceIds: ['ps', 'rev'] },
      ]),
    )
    expect(v.ok).toBe(true)
  })
})

describe('fail-closed davranış', () => {
  it('evidence okuma hatası: meta boş → iddialar bloklanır (serbest bırakmaz)', async () => {
    evidenceError = { message: 'db down' }
    const v = await evaluateOutboundText(
      opts(BASE_BODY('Sitenize baktım.'), [{ claim: 'Sitenize baktım', evidenceIds: ['e1'] }]),
    )
    expect(v.ok).toBe(false)
  })

  it('banned-phrase okunamazsa: FIRLATIR (çağıran fail-closed)', async () => {
    bannedThrow = true
    await expect(evaluateOutboundText(opts(BASE_BODY('Merhaba.')))).rejects.toThrow()
  })

  it('Voice DNA yasak ifadesi: VOICE_BANNED_PHRASE', async () => {
    bannedPhrases = ['çözüm ortağınız olalım']
    const v = await evaluateOutboundText(opts(BASE_BODY('Çözüm ortağınız olalım isterim.')))
    expect(v.ok).toBe(false)
    expect(v.violations.map((x) => x.code)).toContain('VOICE_BANNED_PHRASE')
  })
})

describe('digest kararlılığı', () => {
  it('aynı girdi aynı digest; ihlal durumu değişince digest değişir', async () => {
    evidenceRows = [{ id: 'e1', kind: 'html_signal', source: 'scan', summary: '', payload: null, verified: false }]
    const clean = opts(BASE_BODY('Web sitenizi yenilemek isterim.'))
    const a = await evaluateOutboundText(clean)
    const b = await evaluateOutboundText(clean)
    expect(a.digest).toBe(b.digest)
    const withClaim = await evaluateOutboundText(opts(BASE_BODY('Sitenize baktım.')))
    expect(withClaim.digest).not.toBe(a.digest)
  })

  it('preloaded yol: DB turu atlanır, aynı sonuç', async () => {
    const v = await evaluateOutboundText(
      opts(BASE_BODY('Sitenize baktım.'), [{ claim: 'Sitenize baktım', evidenceIds: ['e1'] }]),
      {
        bannedPhrases: [],
        evidenceMeta: [{ id: 'e1', kind: 'html_signal', source: 'scan', summary: '', payload: null, verified: false }],
      },
    )
    expect(v.ok).toBe(true)
  })

  it('whatsapp kanalı (first_message): subject/opt-out aranmaz', async () => {
    const v = await evaluateOutboundText({
      leadId: null,
      businessName: 'Test Klinik',
      subject: null,
      body: 'Merhaba Test Klinik, web siteniz üzerine kısa bir görüşme uygun musunuz?',
      kind: 'first_message',
    })
    expect(v.ok).toBe(true)
  })
})
