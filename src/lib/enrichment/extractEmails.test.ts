import { describe, it, expect, vi } from 'vitest'

// Faz 4 — runner'ın SAF web e-posta çıkarımı. Gerçek fetch/DB yok (bu test
// yalnız pure helper'ı sürer; DB yolları E2E'de kanıtlanır).
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/contacts/contactService', () => ({ createContact: vi.fn(), resolveCanonicalRecipients: vi.fn() }))
vi.mock('@/lib/leadIntel/evidenceCollector', () => ({ collectEvidence: vi.fn() }))
vi.mock('@/lib/leadIntel/evidenceStore', () => ({ persistEvidence: vi.fn() }))
vi.mock('@/lib/personLeads/apollo', () => ({ searchPeople: vi.fn() }))
vi.mock('@/lib/leadIntel/urlGuard', () => ({ guardedFetch: vi.fn() }))

import { extractEmailsFromHtml } from './enrichmentRunner'

describe('extractEmailsFromHtml — UYDURMA YOK, gerçek sayfa adresleri', () => {
  it('mailto ve düz metin e-postalarını bulur; tekilleştirir', () => {
    const html = `
      <a href="mailto:info@ornek.com">Yaz</a>
      İletişim: satis@ornek.com veya info@ornek.com
    `
    const found = extractEmailsFromHtml(html, 'ornek.com')
    const emails = found.map((c) => c.email).sort()
    expect(emails).toEqual(['info@ornek.com', 'satis@ornek.com'])
    expect(found[0].source).toBe('website')
    expect(found[0].confidence).toBeGreaterThan(0)
    expect(found[0].fetchedAt).toBeTruthy()
  })

  it('statik asset / örnek adresleri (farklı alan) eler', () => {
    const html = 'logo@example.com sentry@sentry.io kisi@baska-gmail.com info@ornek.com'
    const found = extractEmailsFromHtml(html, 'ornek.com')
    expect(found.map((c) => c.email)).toContain('info@ornek.com')
    expect(found.map((c) => c.email)).not.toContain('logo@example.com')
  })

  it('e-posta yoksa boş dizi', () => {
    expect(extractEmailsFromHtml('<p>hiç adres yok</p>', 'ornek.com')).toEqual([])
  })

  it('en çok 3 adres döndürür (gürültü sınırı)', () => {
    const html = 'a@ornek.com b@ornek.com c@ornek.com d@ornek.com e@ornek.com'
    expect(extractEmailsFromHtml(html, 'ornek.com').length).toBeLessThanOrEqual(3)
  })

  it('domainHint null iken de çalışır', () => {
    const found = extractEmailsFromHtml('info@site.com', null)
    expect(found).toHaveLength(1)
    expect(found[0].fullName).toContain('site')
  })
})
