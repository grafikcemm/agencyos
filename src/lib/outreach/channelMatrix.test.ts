import { describe, it, expect } from 'vitest'
import { buildMultiChannelPlan, inferCustomerType, CHANNEL_PRIORITY } from './channelMatrix'

describe('buildMultiChannelPlan — gün-bazlı 6 adım', () => {
  it('6 adım, artan gün sırası', () => {
    const plan = buildMultiChannelPlan('ecommerce')
    expect(plan).toHaveLength(6)
    expect(plan.map((s) => s.day)).toEqual([1, 2, 4, 7, 10, 14])
  })

  it('e-posta adımları her zaman email kanalında', () => {
    const plan = buildMultiChannelPlan('agency_b2b')
    const emailSteps = plan.filter((s) => s.kind.includes('email') || s.kind === 'close_loop')
    expect(emailSteps.every((s) => s.channel === 'email')).toBe(true)
  })

  it('e-ticaret sosyal adımı Instagram, B2B sosyal adımı LinkedIn', () => {
    const ecom = buildMultiChannelPlan('ecommerce').find((s) => s.kind === 'social_dm')!
    const b2b = buildMultiChannelPlan('agency_b2b').find((s) => s.kind === 'social_dm')!
    expect(ecom.channel).toBe('instagram')
    expect(b2b.channel).toBe('linkedin')
  })

  it('yerel işletme doğrudan adımı telefon/whatsapp', () => {
    const direct = buildMultiChannelPlan('local').find((s) => s.kind === 'direct')!
    expect(['phone', 'whatsapp']).toContain(direct.channel)
  })
})

describe('inferCustomerType', () => {
  it('e-ticaret/moda sektörü → ecommerce', () => {
    expect(inferCustomerType({ sector: 'moda giyim' })).toBe('ecommerce')
    expect(inferCustomerType({ sector: 'x', hasEcommerce: true })).toBe('ecommerce')
  })

  it('ajans/yazılım → agency_b2b', () => {
    expect(inferCustomerType({ sector: 'dijital ajans' })).toBe('agency_b2b')
  })

  it('restoran/klinik → local', () => {
    expect(inferCustomerType({ sector: 'restoran' })).toBe('local')
    expect(inferCustomerType({ sector: 'diş kliniği' })).toBe('local')
  })
})

describe('CHANNEL_PRIORITY', () => {
  it('her müşteri tipi için boş olmayan öncelik listesi', () => {
    for (const type of ['ecommerce', 'local', 'agency_b2b', 'founder'] as const) {
      expect(CHANNEL_PRIORITY[type].length).toBeGreaterThan(0)
    }
  })
})
