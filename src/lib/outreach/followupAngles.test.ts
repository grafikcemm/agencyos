import { describe, it, expect } from 'vitest'
import { buildFollowUpDraft, shouldStopSequence, STEP_ANGLES } from './followupAngles'

const BASE = { businessName: 'Güler Klinik', contactName: 'Ayşe', sector: 'diş kliniği' }

describe('buildFollowUpDraft — açı motoru (Faz 4.2)', () => {
  it('her adım FARKLI açı ve FARKLI gövde üretir (kopya yok)', () => {
    const bodies: string[] = []
    const angles = new Set<string>()
    for (let step = 1; step <= 6; step++) {
      const d = buildFollowUpDraft({ ...BASE, step, evidenceSnippet: 'randevu formu mobilde açılmıyor', previousBodies: bodies })
      expect(d.angle).toBe(STEP_ANGLES[step])
      angles.add(d.angle)
      // önceki gövdelerin hiçbir cümlesi tekrar edilmez
      for (const prev of bodies) {
        // Selamlama satırı doğal olarak tekrar eder — kopya sayılmaz.
        const prevSentences = prev
          .split(/[.!?\n]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 20 && !s.toLowerCase().startsWith('merhaba'))
        for (const s of prevSentences) expect(d.body).not.toContain(s)
      }
      bodies.push(d.body)
    }
    expect(angles.size).toBe(6)
  })

  it('yeni-kanıt adımı: kanıt verilirse metne SPESİFİK girer; verilmezse iddiasız + evidenceMissing', () => {
    const withEv = buildFollowUpDraft({ ...BASE, step: 2, evidenceSnippet: 'menü linki kırık görünüyor' })
    expect(withEv.body).toContain('menü linki kırık')
    const withoutEv = buildFollowUpDraft({ ...BASE, step: 2 })
    expect(withoutEv.evidenceMissing).toBe(true)
    expect(withoutEv.body).not.toMatch(/%\d|kat|garanti/i)
  })

  it('bilinmeyen adım → close_loop (sonsuz sequence yok)', () => {
    expect(buildFollowUpDraft({ ...BASE, step: 9 }).angle).toBe('close_loop')
  })

  it('aynı açının tekrar üretimi (kopya çakışması) → close_loop fallback', () => {
    const first = buildFollowUpDraft({ ...BASE, step: 1 })
    const repeat = buildFollowUpDraft({ ...BASE, step: 1, previousBodies: [first.body] })
    expect(repeat.angle).toBe('close_loop')
  })
})

describe('shouldStopSequence — durdurma/fail-closed kuralları', () => {
  it('opt-out → sequence DURUR', () => {
    const d = shouldStopSequence({ hasInboundReply: false, optedOut: true, suppressed: false })
    expect(d).toMatchObject({ stop: true, reason: 'opt_out', stepBlocked: true })
  })
  it('inbound reply → sequence DURUR', () => {
    const d = shouldStopSequence({ hasInboundReply: true, optedOut: false, suppressed: false })
    expect(d).toMatchObject({ stop: true, reason: 'inbound_reply' })
  })
  it('suppression → adım bloklu (fail-closed); kontrol HATASI da bloklar', () => {
    expect(shouldStopSequence({ hasInboundReply: false, optedOut: false, suppressed: true }).stepBlocked).toBe(true)
    expect(
      shouldStopSequence({ hasInboundReply: false, optedOut: false, suppressed: false, suppressionCheckFailed: true })
        .stepBlocked,
    ).toBe(true)
    expect(
      shouldStopSequence({ hasInboundReply: false, optedOut: false, suppressed: false, suppressionCheckFailed: true }).blockReason,
    ).toBe('suppression_check_failed')
  })
  it('temiz durum → devam', () => {
    const d = shouldStopSequence({ hasInboundReply: false, optedOut: false, suppressed: false })
    expect(d).toMatchObject({ stop: false, stepBlocked: false })
  })
})
