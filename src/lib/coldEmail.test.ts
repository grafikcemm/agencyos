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
