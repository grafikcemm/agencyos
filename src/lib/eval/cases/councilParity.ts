// Golden: Lead-Intel council deterministik skor parity kilidi (plan §16, §7).
// computeDeterministicScores saf/LLM'siz taban yoldur. Council'i brain/verify'a
// taşırken (Faz 1+) bu skorlar BİREBİR korunmalı. Yalnız karar-ilişkili {design, ai}
// kilitlenir; reason string'leri (kozmetik) değil.

import { computeDeterministicScores } from '../../leadIntel/council'
import type { PersistedEvidence } from '../../leadIntel/evidenceStore'
import { makeGoldenSet } from '../harness'

function scores(evidence: PersistedEvidence[]): { design: number; ai: number } {
  const r = computeDeterministicScores(evidence)
  return { design: r.design, ai: r.ai }
}

// computeDeterministicScores yalnız id/kind/verified/payload/summary okur → test
// için minimal kanıt nesnesi yeterli (cast ile).
function ev(kind: string, payload: Record<string, unknown>): PersistedEvidence {
  return { id: `${kind}-1`, kind, payload, verified: true, summary: '' } as unknown as PersistedEvidence
}

export const councilParityGolden = makeGoldenSet<PersistedEvidence[], { design: number; ai: number }>({
  name: 'council.deterministicScores',
  fn: scores,
  cases: [
    { name: 'kanit-yok', input: [], expected: { design: 60, ai: 35 } },
    {
      name: 'site-yuklenmiyor',
      input: [ev('html_signal', { fetch_failed: true })],
      expected: { design: 70, ai: 35 },
    },
    {
      name: 'kotu-site-eksik-kanallar',
      input: [
        ev('html_signal', {
          website_quality_band: 'poor',
          has_social_link: false,
          has_whatsapp: false,
          has_online_booking: false,
          has_form: false,
        }),
      ],
      expected: { design: 70, ai: 67 },
    },
    {
      name: 'dusuk-psi-yuksek-yorum',
      input: [
        ev('html_signal', { website_quality_band: 'ok' }),
        ev('pagespeed', { performanceScore: 30 }),
        ev('review_signal', { review_count: 60 }),
      ],
      expected: { design: 55, ai: 50 },
    },
  ],
})
