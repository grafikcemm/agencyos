'use client'

// Bugün Aranacaklar paneli (Faz C1/C2/C3):
// - İlk 5 = "mutlaka bugün"; kalanı backlog (aç/kapa).
// - Satır aksiyonları: Arandı / Ulaşılamadı / Görüşme / Sonra / Not — hepsi
//   /api/leads/[id]/action üzerinden AYNI service katmanına gider (audit'li).
//   Optimistic işaretleme var ama server sonucu authoritative: hata → geri alınır.
// - Tahmini süre + ilerleme + "sıradaki en iyi aksiyon" vurgusu.
// - Duplicate telefonlar bilgi olarak görünür (otomatik merge YOK).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall } from 'lucide-react'
import type { PanelResult, CallLead, CallDuplicate } from '@/lib/cockpit/shared'
import { MUST_TODAY_COUNT, MINUTES_PER_CALL } from '@/lib/cockpit/shared'

type RowAction = 'called' | 'no_answer' | 'meeting' | 'later' | 'note'
type RowState = { done: string | null; busy: boolean; error: string | null }

// Modül seviyesinde — React Compiler purity kuralı bileşen gövdesinde Date.now istemez.
function tomorrowIso(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

/** Idempotency anahtarı gün kapsamı (aynı gün aynı aksiyon = tek uygulama). */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Faz 0.4: aksiyon başına operation id.
 * - note: HER kullanıcı submit'i YENİ bir iştir → UUID (aynı güne ikinci not
 *   kaybolmaz); ağ retry'ı AYNI id'yi taşır (fetch öncesi üretilir) → replay.
 * - diğerleri: gün kapsamlı sabit anahtar (aynı gün "arandı" iki kez basılırsa
 *   tek uygulanır — istenen davranış).
 */
function operationKey(leadId: string, action: RowAction): string {
  if (action === 'note') return `ui-${leadId}-note-${crypto.randomUUID()}`
  return `ui-${leadId}-${action}-${todayKey()}`
}

/** Modül seviyesinde — React Compiler purity kuralı bileşen gövdesinde Date.now istemez. */
function isFutureTs(t: number): boolean {
  return Number.isFinite(t) && t > Date.now()
}

const ACTION_DONE_LABEL: Record<RowAction, string> = {
  called: 'Arandı ✓',
  no_answer: 'Ulaşılamadı',
  meeting: 'Görüşme ✓',
  later: 'Ertelendi',
  note: 'Not eklendi',
}

export function CallListPanel({
  initial,
  duplicates,
}: {
  initial: PanelResult<CallLead>
  duplicates: CallDuplicate[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [expanded, setExpanded] = useState(false)
  // Faz 0.3: server 'atomic:false' döndüyse operatör degraded modu görsün.
  const [degraded, setDegraded] = useState(false)

  const items = initial.items
  const mustToday = items.slice(0, MUST_TODAY_COUNT)
  const backlog = items.slice(MUST_TODAY_COUNT)
  const visible = expanded ? items : mustToday

  const doneCount = items.filter((l) => rows[l.id]?.done).length
  // 1.1: süre tahmini YALNIZ 'mutlaka bugün' (ilk 5) işleri sayar — backlog hariç.
  const mustRemaining = mustToday.filter((l) => !rows[l.id]?.done).length
  const remainingMinutes = mustRemaining * MINUTES_PER_CALL
  const nextBest = items.find((l) => !rows[l.id]?.done)

  function patch(id: string, p: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { done: null, busy: false, error: null }), ...p } }))
  }

  async function act(lead: CallLead, action: RowAction) {
    let note: string | undefined
    if (action === 'note') {
      const input = window.prompt(`${lead.businessName} için not:`)
      if (!input?.trim()) return
      note = input.trim()
    }
    // 1.2: 'daha sonra' sabit yarın DEĞİL — tarih/saat girilebilir (boş bırak = yarın).
    let laterAtIso: string | undefined
    if (action === 'later') {
      const def = tomorrowIso().slice(0, 16)
      const input = window.prompt(
        `${lead.businessName} ne zaman aransın? (YYYY-MM-DDTHH:mm — boş bırak = yarın)`,
        def,
      )
      if (input === null) return // vazgeçti — mutasyon yok
      const t = Date.parse(input.trim() || def)
      if (!isFutureTs(t)) {
        patch(lead.id, { error: 'Geçersiz/geçmiş tarih — aksiyon uygulanmadı' })
        return
      }
      laterAtIso = new Date(t).toISOString()
    }

    patch(lead.id, { busy: true, error: null })
    try {
      const res = await fetch(`/api/leads/${lead.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note,
          laterAtIso,
          idempotencyKey: operationKey(lead.id, action),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      if (json.atomic === false) setDegraded(true)
      // Server authoritative: başarı onaylandı.
      // 1.2: NOTE satırı TAMAMLAMAZ — lead hâlâ aranacak; diğer aksiyonlar işaretler.
      patch(lead.id, { busy: false, done: action === 'note' ? null : ACTION_DONE_LABEL[action] })
      router.refresh() // ilgili paneller (takipler/pipeline) sunucudan tazelensin
    } catch (err) {
      // Optimistic işaret geri alınır — hata görünür.
      patch(lead.id, { busy: false, done: null, error: err instanceof Error ? err.message : 'hata' })
    }
  }

  return (
    <section
      data-testid="panel-calls"
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <PhoneCall className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="text-[12px] font-bold tracking-wide text-[var(--text-secondary)] uppercase">
          Bugün Aranacaklar
        </h2>
        {items.length > 0 && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {degraded && (
        <p className="text-[10px] text-amber-400 mb-2" data-testid="call-degraded">
          ⚠ Aksiyonlar atomik olmayan yolda uygulanıyor (mig 058 onay bekliyor) — işlem yine kayıtlı, crash penceresi dokümante.
        </p>
      )}

      {items.length > 0 && (
        <div className="text-[11px] text-[var(--text-muted)] mb-3" data-testid="call-progress">
          Tahmini kalan süre ~{remainingMinutes} dk
          {nextBest && (
            <>
              {' · '}Sıradaki: <span className="text-[var(--accent)] font-semibold">{nextBest.businessName}</span>
            </>
          )}
        </div>
      )}

      {initial.error ? (
        <p className="text-[12px] text-red-400">Panel yüklenemedi: {initial.error}</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-[var(--text-muted)]">Bugün için aranacak aktif lead yok.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2.5">
            {visible.map((l, idx) => {
              const st = rows[l.id]
              const isNext = nextBest?.id === l.id
              return (
                <li
                  key={l.id}
                  data-testid={`call-lead-${l.id}`}
                  className={`text-[13px] rounded-lg px-2 py-1.5 ${isNext ? 'bg-[var(--accent)]/8 border border-[var(--accent)]/25' : ''} ${st?.done ? 'opacity-55' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                        l.source === 'due' ? 'bg-amber-500/15 text-amber-400' : 'bg-[var(--accent)]/15 text-[var(--accent)]'
                      }`}
                      title={l.reason}
                    >
                      {l.source === 'due' ? 'TAKİP' : 'GÜNÜN'}
                    </span>
                    {idx < MUST_TODAY_COUNT && !expanded && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-red-500/15 text-red-400 font-semibold">BUGÜN</span>
                    )}
                    <span className="text-[var(--text-primary)] font-medium truncate">{l.businessName}</span>
                    {l.tier && <span className="text-[10px] px-1.5 rounded bg-[var(--bg-elevated)] text-[var(--text-muted)]">{l.tier}</span>}
                    {l.phone ? (
                      <a
                        href={`tel:${l.phone.replace(/\s/g, '')}`}
                        className="ml-auto text-[11px] font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
                      >
                        Ara · {l.phone}
                      </a>
                    ) : (
                      <span className="ml-auto text-[11px] text-[var(--text-muted)]">telefon yok</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {st?.done ? (
                      <span className="text-[11px] font-semibold text-emerald-400">{st.done}</span>
                    ) : (
                      (['called', 'no_answer', 'meeting', 'later', 'note'] as RowAction[]).map((a) => (
                        <button
                          key={a}
                          type="button"
                          disabled={st?.busy}
                          onClick={() => act(l, a)}
                          data-testid={`lead-action-${a}-${l.id}`}
                          className="text-[10px] font-semibold px-2 py-1 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--accent)]/15 active:scale-95 transition disabled:opacity-50"
                        >
                          {a === 'called' ? 'Arandı' : a === 'no_answer' ? 'Ulaşılamadı' : a === 'meeting' ? 'Görüşme' : a === 'later' ? 'Sonra (yarın)' : 'Not'}
                        </button>
                      ))
                    )}
                    <a
                      href={`/harita?lead=${l.id}`}
                      className="text-[10px] font-semibold px-2 py-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] transition"
                    >
                      Detay →
                    </a>
                    {st?.error && <span className="text-[10px] text-red-400 truncate">{st.error}</span>}
                  </div>
                </li>
              )
            })}
          </ul>

          {backlog.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              data-testid="call-backlog-toggle"
              className="mt-3 text-[11px] font-semibold text-[var(--accent)] hover:underline"
            >
              {expanded ? 'Backlog’u gizle' : `Backlog’u aç (+${backlog.length})`}
            </button>
          )}

          {duplicates.length > 0 && (
            <div className="mt-3 text-[11px] text-amber-400" data-testid="call-duplicates">
              ⚠ {duplicates.length} olası duplicate telefon gizlendi:{' '}
              {duplicates.map((d) => `${d.duplicateName} → ${d.canonicalName}`).join(', ')}
              <span className="text-[var(--text-muted)]"> (birleştirme manuel — otomatik merge yapılmaz)</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}
