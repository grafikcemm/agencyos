import { describe, it, expect, vi, beforeEach } from 'vitest'

// runner.ts builder'larını mock'la — gerçek Supabase'e gitmeden dilim izolasyonunu test et.
const qualifiedLeadsContext = vi.fn()
const researcherContext = vi.fn()
const funnelContext = vi.fn()
const sectorMixContext = vi.fn()

vi.mock('@/lib/agents/runner', () => ({
  qualifiedLeadsContext: () => qualifiedLeadsContext(),
  researcherContext: () => researcherContext(),
  funnelContext: () => funnelContext(),
  sectorMixContext: () => sectorMixContext(),
}))

import { loadBusinessSlices, formatSlicesBlock, hasRealData } from './businessContext'

describe('loadBusinessSlices', () => {
  beforeEach(() => {
    qualifiedLeadsContext.mockReset()
    researcherContext.mockReset()
    funnelContext.mockReset()
    sectorMixContext.mockReset()
  })

  it('tüm dilimleri yükler ve etiketler', async () => {
    qualifiedLeadsContext.mockResolvedValue('1. ACME [A]')
    funnelContext.mockResolvedValue('toplam 5')
    sectorMixContext.mockResolvedValue('Klinik: 3')
    researcherContext.mockResolvedValue('Sektör fırsatları')

    const slices = await loadBusinessSlices()
    expect(slices.map((s) => s.key)).toEqual(['leads', 'funnel', 'sectors', 'signals'])
    expect(slices[0].text).toBe('1. ACME [A]')
    expect(hasRealData(slices)).toBe(true)
  })

  it('bir dilim fırlatırsa diğerlerini düşürmez (izolasyon)', async () => {
    qualifiedLeadsContext.mockRejectedValue(new Error('db down'))
    funnelContext.mockResolvedValue('toplam 5')
    sectorMixContext.mockResolvedValue('Klinik: 3')
    researcherContext.mockResolvedValue('Sektör fırsatları')

    const slices = await loadBusinessSlices()
    const leads = slices.find((s) => s.key === 'leads')!
    expect(leads.text).toBe('Veri yüklenemedi.')
    expect(slices.find((s) => s.key === 'funnel')!.text).toBe('toplam 5')
    expect(hasRealData(slices)).toBe(true) // funnel gerçek veri taşıyor
  })

  it('boş string dönen dilim placeholder olur', async () => {
    qualifiedLeadsContext.mockResolvedValue('   ')
    funnelContext.mockResolvedValue('')
    sectorMixContext.mockResolvedValue('')
    researcherContext.mockResolvedValue('')

    const slices = await loadBusinessSlices()
    expect(slices.every((s) => s.text === 'Veri yok.')).toBe(true)
    expect(hasRealData(slices)).toBe(false)
  })

  it('sadece istenen dilimleri yükler', async () => {
    qualifiedLeadsContext.mockResolvedValue('1. ACME')
    const slices = await loadBusinessSlices(['leads'])
    expect(slices).toHaveLength(1)
    expect(slices[0].key).toBe('leads')
    expect(funnelContext).not.toHaveBeenCalled()
  })

  it('formatSlicesBlock başlıklı blok üretir', () => {
    const block = formatSlicesBlock([
      { key: 'leads', label: 'Nitelikli Leadler', text: '1. ACME' },
    ])
    expect(block).toContain('### Nitelikli Leadler')
    expect(block).toContain('1. ACME')
  })
})
