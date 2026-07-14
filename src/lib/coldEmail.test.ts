import { describe, it, expect } from 'vitest'
// ── Faz D2: rol-aware açı (deterministik) ─────────────────────────────────────
import { buildColdEmailUserPrompt as buildPrompt, ROLE_ANGLES } from './coldEmail'

describe('rol-aware cold email prompt (Faz D2)', () => {
  const lead = { business_name: 'Güler Klinik', sector: 'diş kliniği' } as Parameters<typeof buildPrompt>[0]

  it('contact verilince rol açısı prompt’a girer (CFO ≠ owner)', () => {
    const cfo = buildPrompt(lead, undefined, { fullName: 'Mehmet Bey', role: 'cfo' })
    expect(cfo).toContain('Mehmet Bey')
    expect(cfo).toContain(ROLE_ANGLES.cfo)
    const owner = buildPrompt(lead, undefined, { fullName: 'Ayşe Hanım', role: 'owner' })
    expect(owner).toContain(ROLE_ANGLES.owner)
    expect(owner).not.toContain(ROLE_ANGLES.cfo)
  })

  it('contact yoksa mevcut davranış korunur (rol satırı yok)', () => {
    const p = buildPrompt(lead)
    expect(p).not.toContain('ROL AÇISI')
  })

  it('her rolün açısı dolu ve birbirinden farklı', () => {
    const values = Object.values(ROLE_ANGLES)
    expect(new Set(values).size).toBe(values.length)
    for (const v of values) expect(v.length).toBeGreaterThan(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 1 — coldEmail çekirdeği kritik eşiğe alındı (≥90L/85B):
// parse (JSON + fallback + claims), imza/uyum footer'ı, kanıt/voice prompt'u.
// ─────────────────────────────────────────────────────────────────────────────
import {
  buildColdEmailSystemPrompt,
  buildColdEmailUserPrompt,
  buildSignatureBlock,
  buildComplianceFooter,
  parseColdEmailOutput,
  SIGNATURE_DEFAULTS,
} from './coldEmail'

describe('buildColdEmailSystemPrompt', () => {
  it('temel kurallar + kanıt disiplini + JSON çıktı talimatı içerir', () => {
    const p = buildColdEmailSystemPrompt()
    expect(p).toContain('KANIT DİSİPLİNİ')
    expect(p).toContain('"claims"')
    expect(p).not.toContain('ONAYLI SES/STİL KURALLARI')
  })

  it('Voice DNA kuralları verilirse UYGULA/KAÇIN satırları eklenir', () => {
    const p = buildColdEmailSystemPrompt({ positive: ['kısa cümleler kur'], negative: ['emoji kullanma'] })
    expect(p).toContain('KULLANICININ ONAYLI SES/STİL KURALLARI')
    expect(p).toContain('- UYGULA: kısa cümleler kur')
    expect(p).toContain('- KAÇIN: emoji kullanma')
  })

  it('boş kural seti: stil bölümü eklenmez', () => {
    const p = buildColdEmailSystemPrompt({ positive: [], negative: [] })
    expect(p).not.toContain('ONAYLI SES/STİL KURALLARI')
  })
})

describe('buildColdEmailUserPrompt — kanıt listesi ve lead alan dalları', () => {
  const lead = {
    id: 'L1', business_name: 'Test Klinik', sector: 'diş', district: 'Kadıköy',
    rating: 4.2, review_count: 37, has_real_website: false, has_whatsapp: false,
    has_ads_signal: null, has_job_signal: null, instagram_as_site: null,
    website: null, pain_signals: ['site yok'], proof_points: ['4.2 puan'],
    why_now: 'sezon', why_this_will_convert: 'talep var',
  }

  it('kanıt listesi verilirse id→özet satırları girer', () => {
    const p = buildColdEmailUserPrompt(lead, undefined, undefined, [{ id: 'ev-1', summary: 'sitesi yok' }])
    expect(p).toContain('KANIT LİSTESİ')
    expect(p).toContain('- id: ev-1 → sitesi yok')
  })

  it('kanıt listesi boşsa açık "iddia yazma" talimatı girer', () => {
    const p = buildColdEmailUserPrompt(lead)
    expect(p).toContain('KANIT LİSTESİ: BOŞ')
    expect(p).toContain('"claims": []')
  })

  it('website var + whatsapp bilinmiyor dalları', () => {
    const p = buildColdEmailUserPrompt({ ...lead, has_real_website: true, website: 'https://x.com', has_whatsapp: true })
    expect(p).toContain('Web sitesi: var (https://x.com)')
    expect(p).not.toContain('WhatsApp iletişim kanalı')
  })

  it('template verilirse açı/iskelet bölümü girer', () => {
    const p = buildColdEmailUserPrompt(lead, { id: 't1', angle: 'hız', skeleton: 'iskelet' } as never)
    expect(p).toContain('TERCİH EDİLEN AÇI')
    expect(p).toContain('Açı: hız')
  })
})

describe('parseColdEmailOutput', () => {
  it('temiz JSON: subject/body/claims parse edilir', () => {
    const r = parseColdEmailOutput(
      JSON.stringify({ subject: 'Konu', body: 'Gövde', claims: [{ text: 'sitenize baktım', evidenceId: 'ev-1' }] }),
    )
    expect(r).toEqual({ subject: 'Konu', body: 'Gövde', claims: [{ text: 'sitenize baktım', evidenceId: 'ev-1' }] })
  })

  it('markdown fence temizlenir', () => {
    const r = parseColdEmailOutput('```json\n{"subject":"K","body":"G","claims":[]}\n```')
    expect(r?.subject).toBe('K')
  })

  it('bozuk claims alanları elenir (text/evidenceId zorunlu, 500 kesme)', () => {
    const r = parseColdEmailOutput(
      JSON.stringify({
        subject: 'K', body: 'G',
        claims: [
          { text: 'x'.repeat(600), evidenceId: 'e1' },
          { text: '', evidenceId: 'e2' },
          { text: 'ok', evidenceId: '' },
          { text: 'ok2' },
          'string',
          null,
        ],
      }),
    )
    expect(r?.claims).toHaveLength(1)
    expect(r?.claims[0].text).toHaveLength(500)
  })

  it('claims dizi değilse [] kabul edilir', () => {
    const r = parseColdEmailOutput('{"subject":"K","body":"G","claims":"yok"}')
    expect(r?.claims).toEqual([])
  })

  it('bozuk JSON: regex fallback subject/body çözer, claims [] (fail-closed)', () => {
    const raw = '{"subject": "Konu \\"tırnaklı\\"", "body": "Satır1\nSatır2", "claims": [BOZUK'
    const r = parseColdEmailOutput(raw)
    expect(r?.subject).toBe('Konu "tırnaklı"')
    expect(r?.body).toBe('Satır1\nSatır2')
    expect(r?.claims).toEqual([])
  })

  it('boş subject/body: null (route 502 üretir)', () => {
    expect(parseColdEmailOutput('{"subject":"","body":"G"}')).toBeNull()
    expect(parseColdEmailOutput('tamamen serbest metin')).toBeNull()
  })
})

describe('buildSignatureBlock / buildComplianceFooter', () => {
  it('imza: settings değeri varsa onu, yoksa default kullanır', () => {
    const s = buildSignatureBlock({ signature_website: 'https://ozel.com' })
    expect(s).toContain('https://ozel.com')
    expect(s).toContain(SIGNATURE_DEFAULTS.signature_instagram)
    expect(s).toContain('Ali Cem Bozma')
  })

  it('footer: unvan+MERSİS ile ETK satırları üretir', () => {
    const f = buildComplianceFooter({ ticaret_unvani: 'Grafikcem', mersis_no: '123' })
    expect(f).toContain('Grafikcem | MERSİS: 123')
    expect(f).toContain('"ret" yazarak')
  })

  it('footer: compliance_enabled=false → boş', () => {
    expect(buildComplianceFooter({ compliance_enabled: 'false', ticaret_unvani: 'X' })).toBe('')
  })

  it('footer: unvan ve MERSİS boşsa → boş (yarım kimlikli footer yok)', () => {
    expect(buildComplianceFooter({})).toBe('')
  })

  it('footer: yalnız MERSİS varsa kimlik satırı MERSİS ile kurulur', () => {
    const f = buildComplianceFooter({ mersis_no: '42' })
    expect(f).toContain('MERSİS: 42')
  })
})
