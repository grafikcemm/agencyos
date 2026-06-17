import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BusinessSlice } from '@/lib/agents/businessContext'

const callLight = vi.fn()
const callMedium = vi.fn()
const loadBusinessSlices = vi.fn()

vi.mock('@/lib/openrouter', () => ({
  callLight: (...a: unknown[]) => callLight(...a),
  callMedium: (...a: unknown[]) => callMedium(...a),
}))

// businessContext: loadBusinessSlices mock'lanır; format/hasRealData gerçek mantığı taklit eder.
vi.mock('@/lib/agents/businessContext', () => ({
  loadBusinessSlices: () => loadBusinessSlices(),
  formatSlicesBlock: (slices: BusinessSlice[]) =>
    slices.map((s) => `### ${s.label}\n${s.text}`).join('\n\n'),
  hasRealData: (slices: BusinessSlice[]) => {
    const ph = ['Veri yok.', 'Veri yüklenemedi.']
    return slices.some((s) => s.text.length > 0 && !ph.includes(s.text))
  },
}))

// sanitizeForTelegram'i passthrough'a indir (mentorLoop import zincirini kısalt).
vi.mock('./mentorLoop', () => ({
  sanitizeForTelegram: (s: string) => s,
}))

import { deliberateBusiness } from './deliberate'

const REAL_SLICES: BusinessSlice[] = [
  { key: 'leads', label: 'Nitelikli Leadler', text: '1. ACME Klinik [A] — Tel: 0212\n2. Beta Diş [B] — Tel: 0216' },
  { key: 'funnel', label: 'Lead Funnel & MRR', text: 'toplam 12 | new: 8 contacted: 4' },
  { key: 'sectors', label: 'Sektör Dağılımı', text: 'Klinik: 5 | Diş: 3' },
  { key: 'signals', label: 'Fırsat & Sinyaller', text: 'Diş hekimliği yükselişte' },
]

describe('deliberateBusiness', () => {
  beforeEach(() => {
    callLight.mockReset()
    callMedium.mockReset()
    loadBusinessSlices.mockReset()
  })

  it('mutlu yol: tek ses cevap + aksiyonlar, "Ajan" sızıntısı yok', async () => {
    loadBusinessSlices.mockResolvedValue(REAL_SLICES)
    callLight.mockResolvedValue('Görüş: ACME aranmalı')
    callMedium.mockResolvedValue(
      'Bugün önceliğin ACME Klinik. Funnel\'da 8 new var, temas zayıf.\n\nAksiyonlar:\n- ACME Klinik\'i ara (0212)\n- Beta Diş\'e teklif taslağı hazırla',
    )

    const res = await deliberateBusiness('bugün kimi arayayım?')
    expect(res.degraded).toBe(false)
    expect(res.reply).toContain('ACME')
    expect(res.actions.length).toBe(2)
    expect(res.actions[0]).toContain('ACME')
    expect(res.reply.toLowerCase()).not.toContain('ajan')
    expect(res.usedSlices).toEqual(['leads', 'funnel', 'sectors', 'signals'])
  })

  it('görüşlerden biri fırlatsa bile (allSettled) sentez çalışır', async () => {
    loadBusinessSlices.mockResolvedValue(REAL_SLICES)
    callLight
      .mockResolvedValueOnce('Satış görüşü')
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValueOnce('Ops görüşü')
    callMedium.mockResolvedValue('Net cevap.\nAksiyonlar:\n- Adım 1')

    const res = await deliberateBusiness('pipeline durumu ne?')
    expect(res.degraded).toBe(false)
    expect(res.reply).toContain('Net cevap')
  })

  it('sentez (callMedium) fırlatırsa degraded=true ve cevap gerçek lead taşır', async () => {
    loadBusinessSlices.mockResolvedValue(REAL_SLICES)
    callLight.mockResolvedValue('görüş')
    callMedium.mockRejectedValue(new Error('Aylık AI maliyet limiti aşıldı'))

    const res = await deliberateBusiness('müşteriler kim?')
    expect(res.degraded).toBe(true)
    expect(res.reply).toContain('ACME')
  })

  it('degraded: leads dilimi numaralı satır içermezse formatSlicesBlock\'a düşer', async () => {
    const noNumbered: BusinessSlice[] = [
      { key: 'leads', label: 'Nitelikli Leadler', text: 'Henüz işlenmiş lead yok ama veri var' },
      { key: 'funnel', label: 'Lead Funnel & MRR', text: 'toplam 3' },
    ]
    loadBusinessSlices.mockResolvedValue(noNumbered)
    callLight.mockResolvedValue('görüş')
    callMedium.mockRejectedValue(new Error('cap'))

    const res = await deliberateBusiness('müşteriler kim?')
    expect(res.degraded).toBe(true)
    // lead3 boş → formatSlicesBlock bloğu (funnel verisi) cevapta görünür.
    expect(res.reply).toContain('toplam 3')
  })

  it('sentez 4\'ten fazla aksiyon dönerse en fazla 4 alınır', async () => {
    loadBusinessSlices.mockResolvedValue(REAL_SLICES)
    callLight.mockResolvedValue('görüş')
    callMedium.mockResolvedValue(
      'Cevap.\nAksiyonlar:\n- A\n- B\n- C\n- D\n- E\n- F',
    )
    const res = await deliberateBusiness('kimi arayayım?')
    expect(res.actions).toHaveLength(4)
    expect(res.actions).toEqual(['A', 'B', 'C', 'D'])
  })

  it('tüm dilimler boşsa "veri görünmüyor" der', async () => {
    const empty: BusinessSlice[] = REAL_SLICES.map((s) => ({ ...s, text: 'Veri yok.' }))
    loadBusinessSlices.mockResolvedValue(empty)
    callLight.mockResolvedValue('görüş')
    callMedium.mockResolvedValue('') // boş sentez → degraded

    const res = await deliberateBusiness('müşteriler kim?')
    expect(res.degraded).toBe(true)
    expect(res.reply).toContain('veri görünmüyor')
  })
})
