'use client'

// Voice DNA inceleme paneli (Faz 4.1): candidate → (onay) → approved/active.
// Otomatik aktivasyon YOK; sıfır veri = "baseline" dürüstçe görünür.

import { useEffect, useState } from 'react'
import { Mic2 } from 'lucide-react'

interface PhraseCandidate { phrase: string; count: number; readyForReview: boolean }
interface StyleCandidate { rule: string; polarity: 'positive' | 'negative'; count: number; readyForReview: boolean }
interface Profile {
  baseline: boolean
  observationCount: number
  approved: { positive: string[]; negative: string[] }
  bannedPhrases: string[]
}

export function VoiceDnaPanel() {
  const [data, setData] = useState<{ phraseCandidates: PhraseCandidate[]; styleCandidates: StyleCandidate[]; profile: Profile } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = () =>
    fetch('/api/voice-dna')
      .then((r) => r.json())
      .then((d) => (d.profile ? setData(d) : setError(d.error ?? 'yüklenemedi')))
      .catch(() => setError('bağlantı hatası'))

  useEffect(() => {
    load()
  }, [])

  async function approve(kind: 'phrase' | 'style_positive' | 'style_negative', value: string) {
    setBusyKey(value)
    try {
      const res = await fetch('/api/voice-dna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      })
      if (res.ok) await load()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4" data-testid="voice-dna-panel">
      <div className="flex items-center gap-2 mb-2">
        <Mic2 className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-[12px] font-bold tracking-wide text-[var(--text-secondary)] uppercase">Voice DNA</h2>
      </div>

      {error && <p className="text-[12px] text-red-400">{error}</p>}
      {!data && !error && <p className="text-[12px] text-[var(--text-muted)]">Yükleniyor…</p>}

      {data && (
        <div className="space-y-3 text-[12px]">
          <p className="text-[11px] text-[var(--text-muted)]">
            {data.profile.baseline
              ? `Profil: profesyonel BASELINE (henüz onaylı kural yok — ${data.profile.observationCount} gözlem birikti). "Sesin öğrenildi" iddiası yapılmaz.`
              : `Aktif profil: ${data.profile.approved.positive.length} pozitif, ${data.profile.approved.negative.length} negatif kural, ${data.profile.bannedPhrases.length} yasak ifade.`}
          </p>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
              Stil kural adayları (onaysız AKTİF DEĞİL)
            </h3>
            {data.styleCandidates.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">Henüz aday yok — onaylı düzenlemeler biriktikçe oluşur.</p>
            ) : (
              <ul className="space-y-1">
                {data.styleCandidates.slice(0, 8).map((c) => (
                  <li key={c.rule} className="flex items-center gap-2">
                    <span className="text-[var(--text-primary)]">{c.rule}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">×{c.count}</span>
                    {c.readyForReview && !data.profile.approved.positive.includes(c.rule) && (
                      <button
                        onClick={() => approve('style_positive', c.rule)}
                        disabled={busyKey === c.rule}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 disabled:opacity-50"
                      >
                        Onayla → aktif
                      </button>
                    )}
                    {data.profile.approved.positive.includes(c.rule) && (
                      <span className="text-[10px] text-emerald-400">aktif ✓</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">
              Yasak ifade adayları (sildiklerin)
            </h3>
            {data.phraseCandidates.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)]">Henüz aday yok.</p>
            ) : (
              <ul className="space-y-1">
                {data.phraseCandidates.slice(0, 8).map((c) => (
                  <li key={c.phrase} className="flex items-center gap-2">
                    <span className="text-[var(--text-primary)] truncate max-w-[60%]">“{c.phrase}”</span>
                    <span className="text-[10px] text-[var(--text-muted)]">×{c.count}</span>
                    {c.readyForReview && !data.profile.bannedPhrases.includes(c.phrase) && (
                      <button
                        onClick={() => approve('phrase', c.phrase)}
                        disabled={busyKey === c.phrase}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        Yasakla
                      </button>
                    )}
                    {data.profile.bannedPhrases.includes(c.phrase) && (
                      <span className="text-[10px] text-red-400">yasak ✓</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
