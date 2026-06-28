import { describe, it, expect } from 'vitest'
import { isMissingCategoryColumnError, stripCategoryKeys, CATEGORY_PERSIST_KEYS } from './categoryPersist'

describe('isMissingCategoryColumnError', () => {
  it('PGRST204 kodunu yakalar', () => {
    expect(isMissingCategoryColumnError({ code: 'PGRST204', message: '' })).toBe(true)
  })

  it("mesajda kategori kolon adı geçerse yakalar", () => {
    expect(isMissingCategoryColumnError({
      message: "Could not find the 'customer_category' column of 'leads' in the schema cache",
    })).toBe(true)
  })

  it('alakasız hatayı yakalamaz', () => {
    expect(isMissingCategoryColumnError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingCategoryColumnError(null)).toBe(false)
    expect(isMissingCategoryColumnError(undefined)).toBe(false)
  })
})

describe('stripCategoryKeys', () => {
  it('yalnız kategori kolonlarını çıkarır, diğerlerini korur', () => {
    const payload = {
      business_name: 'X',
      customer_category: 'web_yok',
      website_quality_band: 'none',
      category_reasons: ['a'],
      has_social_link: false,
      quality_score: 80,
    }
    const stripped = stripCategoryKeys(payload)
    for (const k of CATEGORY_PERSIST_KEYS) expect(k in stripped).toBe(false)
    expect(stripped.business_name).toBe('X')
    expect(stripped.quality_score).toBe(80)
  })

  it('orijinali mutasyona uğratmaz', () => {
    const payload = { customer_category: 'web_yok', business_name: 'X' }
    stripCategoryKeys(payload)
    expect(payload.customer_category).toBe('web_yok')
  })
})
