import { describe, it, expect } from 'vitest'
import { extractEmails, runEvidenceEngine } from './evidenceEngine'

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
