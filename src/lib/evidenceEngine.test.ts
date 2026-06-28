import { describe, it, expect } from 'vitest'
import { extractEmails, extractSignals, runEvidenceEngine } from './evidenceEngine'

describe('extractEmails', () => {
  it('extracts mailto and plain-text emails, lowercased and deduped', () => {
    const html = `
      <a href="mailto:Info@KlinikOrnek.com">Yaz</a>
      <p>iletişim: info@klinikornek.com — destek: destek@klinikornek.com</p>
    `
    const emails = extractEmails(html)
    expect(emails).toContain('info@klinikornek.com')
    expect(emails).toContain('destek@klinikornek.com')
    expect(emails.filter(e => e === 'info@klinikornek.com')).toHaveLength(1)
  })

  it('filters junk matches (image filenames, platform noise, placeholders)', () => {
    const html = `
      <img src="logo@2x.png" />
      <script>user@sentry.io</script>
      <span>ornek@example.com</span>
      <span>gercek@isletme.com.tr</span>
    `
    const emails = extractEmails(html)
    expect(emails).toEqual(['gercek@isletme.com.tr'])
  })

  it('prefers business-looking addresses first', () => {
    const html = 'ali.veli@gmail.com info@salon.com'
    const emails = extractEmails(html)
    expect(emails[0]).toBe('info@salon.com')
  })

  it('returns empty array when nothing matches', () => {
    expect(extractEmails('<html><body>İletişim için arayın</body></html>')).toEqual([])
  })
})

describe('runEvidenceEngine — websitesiz/Instagram lead (ağ erişimi yok)', () => {
  it('does NOT claim Instagram usage when there is no website at all', async () => {
    const result = await runEvidenceEngine({
      website: null,
      sector: 'kuaför',
      businessName: 'Test Kuaför',
      rating: 4.1,
      reviewCount: 8,
    })
    expect(result.instagram_as_site).toBe(false)
    expect(result.first_message).not.toContain('Instagram kullanıyorsunuz')
    expect(result.evidence_verified).toBe(false)
    expect(result.found_email).toBeNull()
  })

  it('claims Instagram usage only when the site URL is actually Instagram', async () => {
    const result = await runEvidenceEngine({
      website: 'https://instagram.com/testkuafor',
      sector: 'kuaför',
      businessName: 'Test Kuaför',
      rating: 4.1,
      reviewCount: 8,
    })
    expect(result.instagram_as_site).toBe(true)
    expect(result.first_message).toContain('Instagram kullanıyorsunuz')
    expect(result.recommended_offer_id).toBe('website')
  })

  it('phrases unverified WhatsApp absence as "tespit edilemedi", not a hard claim', async () => {
    const result = await runEvidenceEngine({
      website: null,
      sector: 'güzellik salonu',
      businessName: 'Salon X',
      rating: 4.5,
      reviewCount: 30,
    })
    const whatsappPain = result.pain_signals.find(p => p.includes('WhatsApp'))
    expect(whatsappPain).toBeDefined()
    expect(whatsappPain).toContain('tespit edilemedi')
  })
})

// Determinism: now enjekte edilir → telif-yılı işareti testte sabitlenir.
const NOW = new Date('2026-06-28T00:00:00Z')
const FILLER = 'x'.repeat(2000) // tiny-page (<1500) işaretini önler

describe('extractSignals — website_quality_band', () => {
  it("ok: viewport var, https, dolgun sayfa, kötü işaret yok → 'ok'", () => {
    const html = `<html><head><meta name="viewport" content="width=device-width"></head><body>${FILLER}</body></html>`
    expect(extractSignals(html, 'https://ornek.com', NOW).website_quality_band).toBe('ok')
  })

  it("poor: viewport yok + http-only (2 işaret) → 'poor'", () => {
    const html = `<html><head></head><body>${FILLER}</body></html>`
    expect(extractSignals(html, 'http://ornek.com', NOW).website_quality_band).toBe('poor')
  })

  it("poor: eski telif yılı + viewport yok → 'poor' (now sabit 2026)", () => {
    const html = `<html><head></head><body>© 2018 Ornek${FILLER}</body></html>`
    expect(extractSignals(html, 'https://ornek.com', NOW).website_quality_band).toBe('poor')
  })

  it('ok: yeni telif yılı tek başına bandı düşürmez', () => {
    const html = `<html><head><meta name="viewport" content="width=device-width"></head><body>© 2026 Ornek${FILLER}</body></html>`
    expect(extractSignals(html, 'https://ornek.com', NOW).website_quality_band).toBe('ok')
  })

  it("poor: site-builder izi + viewport yok → 'poor'", () => {
    const html = `<html><head></head><body>Made with wix.com${FILLER}</body></html>`
    expect(extractSignals(html, 'https://ornek.com', NOW).website_quality_band).toBe('poor')
  })
})

describe('extractSignals — has_social_link', () => {
  it('Instagram bağlantısı varsa true', () => {
    const html = `<html><body><a href="https://instagram.com/ornek">IG</a>${FILLER}</body></html>`
    expect(extractSignals(html, 'https://ornek.com', NOW).has_social_link).toBe(true)
  })

  it('sosyal bağlantı yoksa false', () => {
    const html = `<html><body>${FILLER}</body></html>`
    expect(extractSignals(html, 'https://ornek.com', NOW).has_social_link).toBe(false)
  })
})
