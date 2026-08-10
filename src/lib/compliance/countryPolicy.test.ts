import { describe, it, expect } from 'vitest'
import {
  COUNTRY_POLICIES,
  SEND_ALLOWLIST_COUNTRIES,
  evaluateSendPolicy,
  policyFor,
  policyLabel,
  type PolicyRequirement,
  type RecipientFacts,
} from './countryPolicy'

/** Bir ülkenin TÜM gerekliliklerini kanıtlanmış say. */
function allProven(code: string): Partial<Record<PolicyRequirement, boolean>> {
  const out: Partial<Record<PolicyRequirement, boolean>> = {}
  for (const r of policyFor(code).requirements) out[r] = true
  return out
}

function facts(over: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    countryCode: 'TR',
    entityType: 'legal_entity',
    provenRequirements: allProven('TR'),
    suppressed: false,
    emailConfidence: 'verified',
    mailboxReady: true,
    ...over,
  }
}

describe('ülke kaydı', () => {
  it('ilk allowlist yalnız TR, US, GB', () => {
    expect([...SEND_ALLOWLIST_COUNTRIES]).toEqual(['TR', 'US', 'GB'])
    for (const c of SEND_ALLOWLIST_COUNTRIES) {
      expect(policyFor(c).ceiling).toBe('allowed')
    }
  })

  it('AB/AEA ülkeleri, Kanada ve Avustralya BLOKLU başlar', () => {
    for (const c of ['DE', 'FR', 'NL', 'IE', 'SE', 'NO', 'IS', 'CA', 'AU']) {
      expect(policyFor(c).ceiling).toBe('blocked')
    }
  })

  it('tanımsız ülke bloklu — sessiz "izinli" varsayımı yok', () => {
    for (const c of [null, undefined, '', 'XX', 'zz', 'JP']) {
      const d = evaluateSendPolicy(facts({ countryCode: c as string | null }))
      expect(d.policy).toBe('blocked')
      expect(d.sendAllowed).toBe(false)
      expect(d.draftAllowed).toBe(false)
    }
  })

  it('her politika doğrulanmış kaynak taşır (bloklu tanımsız ülke hariç)', () => {
    for (const [code, p] of Object.entries(COUNTRY_POLICIES)) {
      expect(p.code).toBe(code)
      expect(p.citation.startsWith('https://')).toBe(true)
      expect(p.regime.length).toBeGreaterThan(0)
    }
  })

  it('ülke kodu büyük/küçük harften bağımsız çözülür', () => {
    expect(policyFor('tr').code).toBe('TR')
    expect(policyFor(' gb ').code).toBe('GB')
  })
})

describe('suppression mutlaktır', () => {
  it('ret listesindeki alıcıya taslak bile üretilmez', () => {
    const d = evaluateSendPolicy(facts({ suppressed: true }))
    expect(d.policy).toBe('blocked')
    expect(d.draftAllowed).toBe(false)
    expect(d.sendAllowed).toBe(false)
  })

  it('suppression ülke ve kanıt durumundan BAĞIMSIZ olarak ezer', () => {
    const d = evaluateSendPolicy(facts({ countryCode: 'US', provenRequirements: allProven('US'), suppressed: true }))
    expect(d.policy).toBe('blocked')
  })
})

describe('Türkiye', () => {
  it('tacir/esnaf doğrulanmadan gönderim açılmaz', () => {
    const d = evaluateSendPolicy(facts({ provenRequirements: { ...allProven('TR'), merchant_status_verified: false } }))
    expect(d.policy).toBe('research_only')
    expect(d.sendAllowed).toBe(false)
    expect(d.draftAllowed).toBe(true)
    expect(d.missing).toContain('merchant_status_verified')
  })

  it('İYS kaydı/istisnası olmadan gönderim açılmaz', () => {
    const proven = allProven('TR')
    delete proven.iys_consent_or_exemption
    const d = evaluateSendPolicy(facts({ provenRequirements: proven }))
    expect(d.sendAllowed).toBe(false)
    expect(d.missing).toContain('iys_consent_or_exemption')
  })

  it('avukat gibi tacir/esnaf sayılmayan meslek BLOKLU — istisnaya sokulmaz', () => {
    for (const p of ['Avukat', 'X Hukuk Bürosu', 'serbest muhasebeci mali müşavir']) {
      const d = evaluateSendPolicy(facts({ profession: p }))
      expect(d.policy).toBe('blocked')
      expect(d.sendAllowed).toBe(false)
    }
  })

  it('tüm kanıtlar tamsa gönderime uygun ve ret süresi 3 iş günü', () => {
    const d = evaluateSendPolicy(facts())
    expect(d.policy).toBe('allowed')
    expect(d.sendAllowed).toBe(true)
    expect(d.suppressionDeadlineBusinessDays).toBe(3)
  })
})

describe('ABD — CAN-SPAM', () => {
  it('fiziksel posta adresi olmadan gönderim açılmaz', () => {
    const proven = allProven('US')
    delete proven.physical_postal_address
    const d = evaluateSendPolicy(facts({ countryCode: 'US', provenRequirements: proven }))
    expect(d.policy).toBe('research_only')
    expect(d.missing).toContain('physical_postal_address')
  })

  it('B2B istisnası YOKTUR — tüzel kişi de aynı gerekliliklere tabidir', () => {
    expect(policyFor('US').note).toContain('B2B')
    const d = evaluateSendPolicy(facts({ countryCode: 'US', provenRequirements: allProven('US') }))
    expect(d.policy).toBe('allowed')
    expect(d.suppressionDeadlineBusinessDays).toBe(10)
  })
})

describe('Birleşik Krallık — PECR', () => {
  it('sole trader birey gibi ele alınır → gönderim yok', () => {
    const d = evaluateSendPolicy(facts({ countryCode: 'GB', entityType: 'sole_trader', provenRequirements: allProven('GB') }))
    expect(d.policy).toBe('research_only')
    expect(d.sendAllowed).toBe(false)
  })

  it('corporate subscriber doğrulanmadan gönderim yok', () => {
    const proven = allProven('GB')
    delete proven.corporate_subscriber_verified
    const d = evaluateSendPolicy(facts({ countryCode: 'GB', provenRequirements: proven }))
    expect(d.missing).toContain('corporate_subscriber_verified')
    expect(d.sendAllowed).toBe(false)
  })

  it('LIA kaydı olan doğrulanmış corporate subscriber gönderime uygun', () => {
    const d = evaluateSendPolicy(facts({ countryCode: 'GB', provenRequirements: allProven('GB') }))
    expect(d.policy).toBe('allowed')
  })
})

describe('teknik kapılar', () => {
  it('tahmin edilmiş e-posta taslağı ENGELLEMEZ, gönderimi engeller', () => {
    const d = evaluateSendPolicy(facts({ emailConfidence: 'guessed' }))
    expect(d.draftAllowed).toBe(true)
    expect(d.sendAllowed).toBe(false)
    expect(d.policy).toBe('research_only')
  })

  it('bilinmeyen e-posta güveni YAPISAL engel değildir ama gerekçeye yazılır', () => {
    // Bilinçli karar: `null` bir HUKUKİ kapı değil VERİ KALİTESİ sinyalidir.
    // Gerçek gönderim ayrıca mailbox hazırlığı + insan onayından geçer.
    const d = evaluateSendPolicy(facts({ emailConfidence: null }))
    expect(d.sendAllowed).toBe(true)
    expect(d.reasons.join(' ')).toContain('veri kalitesi')
    expect(evaluateSendPolicy(facts({ emailConfidence: 'probable' })).sendAllowed).toBe(true)
  })

  it('mailbox hazır değilse gönderim açılmaz', () => {
    const d = evaluateSendPolicy(facts({ mailboxReady: false }))
    expect(d.sendAllowed).toBe(false)
    expect(d.reasons.join(' ')).toContain('altyapısı')
  })

  it('alıcı tipi bilinmiyorsa gönderim açılmaz', () => {
    expect(evaluateSendPolicy(facts({ entityType: 'unknown' })).sendAllowed).toBe(false)
    expect(evaluateSendPolicy(facts({ entityType: 'individual' })).sendAllowed).toBe(false)
  })

  it('public kaynaktan e-posta bulmak consent SAYILMAZ — kanıt yoksa araştırma', () => {
    const d = evaluateSendPolicy(facts({ provenRequirements: {} }))
    expect(d.policy).toBe('research_only')
    expect(d.missing.length).toBe(policyFor('TR').requirements.length)
  })
})

describe('kullanıcı dili', () => {
  it('durum etiketleri ham enum değil', () => {
    expect(policyLabel('allowed')).toBe('Gönderime uygun')
    expect(policyLabel('research_only')).toBe('Yalnız araştırma')
    expect(policyLabel('blocked')).toBe('Gönderim kapalı')
  })

  it('gerekçeler insan diliyle yazılır', () => {
    const d = evaluateSendPolicy(facts({ countryCode: 'DE' }))
    expect(d.reasons[0]).toContain('Almanya')
    expect(d.reasons[0]).not.toMatch(/[a-z]_[a-z]/) // snake_case enum sızmasın
  })
})
