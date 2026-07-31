export const dynamic = 'force-dynamic'

import { AlertTriangle, FlaskConical, Gauge, Wallet } from 'lucide-react'
import { buildCockpit } from '@/lib/growth/cockpit'
import { loadCockpitInput } from '@/lib/growth/cockpitData'

// ─────────────────────────────────────────────────────────────────────────────
// DENEY KOKPİTİ — SALT OKUNUR.
//
// Buradan hiçbir şey başlatılamaz: koşu başlatma para harcar, gönderim geri
// alınamaz. İkisi de bir gösterge panelinin işi değil. Sayfa yalnız ne olduğunu
// gösterir; ne yapılacağına operatör başka bir yerde karar verir.
//
// Sayfa HESAP YAPMAZ — tüm oranlar `buildCockpit`ten gelir. Arayüzde ikinci bir
// hesap, er ya da geç raporla çelişen bir sayı üretirdi.
// ─────────────────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat('tr-TR')
const money = (v: number | null) => (v === null ? '—' : `$${v.toFixed(2)}`)
const rate = (v: number | null) => (v === null ? '—' : `%${v}`)

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
      <div className="label-eyebrow mb-1">{label}</div>
      <div className="text-lg font-bold text-[var(--text-primary)]">{value}</div>
      {hint && <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{hint}</div>}
    </div>
  )
}

export default async function ExperimentsPage() {
  const { input, warnings, recommendations } = await loadCockpitInput()
  const c = buildCockpit(input)

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6 max-w-5xl">
      <header className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-[var(--accent)]" />
        <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">Deneyler</h1>
        <span className="text-[11px] text-[var(--text-tertiary)] ml-2">salt okunur</span>
      </header>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-3">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
            <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
            Eksik kaynak
          </div>
          <ul className="mt-1.5 text-[12px] text-[var(--text-secondary)] list-disc pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Bütçe — okunamayan harcama SIFIR gösterilmez. */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="w-4 h-4 text-[var(--text-tertiary)]" />
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Bütçe · {c.budget.monthKey}</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Aylık tavan" value={money(c.budget.capUsd)} />
          <Stat
            label="Harcanan"
            value={c.budget.state === 'unmeasurable' ? 'ölçülemedi' : money(c.budget.spentUsd)}
            hint={c.budget.state === 'unmeasurable' ? 'koşu başlatma kapalı' : undefined}
          />
          <Stat label="Kalan" value={money(c.budget.remainingUsd)} />
          <Stat label="Yanan kredi" value={money(c.budget.burnedUsd)} hint="lead getirmeden harcanan" />
        </div>
      </section>

      {/* Gönderim kapısı */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="w-4 h-4 text-[var(--text-tertiary)]" />
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Pilot kapısı</h2>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-[13px]">
          {c.pilotGate.canSend ? (
            <span className="text-[var(--text-primary)]">
              Gönderim açık · günlük tavan {c.pilotGate.dailyCap} · bugün kalan {c.pilotGate.remainingToday}
            </span>
          ) : (
            <span className="text-[var(--text-secondary)]">
              Gönderim kapalı — <strong className="text-[var(--text-primary)]">{c.pilotGate.blockedReason}</strong>
            </span>
          )}
        </div>
      </section>

      {/* Sağlayıcı sağlığı — açık olmayan sağlayıcı YEŞİL görünmez. */}
      <section>
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-2">Sağlayıcılar</h2>
        <div className="grid md:grid-cols-2 gap-2">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="label-eyebrow mb-2">KAYNAK</div>
            <ul className="flex flex-col gap-1 text-[12px]">
              {c.providers.sources.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-primary)]">{p.key}</span>
                  <span className={p.enabled ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}>
                    {p.enabled ? 'açık' : (p.reason ?? 'kapalı')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="label-eyebrow mb-2">GÖNDERİM</div>
            <ul className="flex flex-col gap-1 text-[12px]">
              {c.providers.outreach.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-primary)]">{p.key}</span>
                  <span className={p.canSendReal ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}>
                    {p.canSendReal ? 'gerçek gönderim açık' : (p.reason ?? 'gerçek gönderim kapalı')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Deneyler */}
      <section>
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-2">Huni</h2>
        {c.experiments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-6 text-center text-[13px] text-[var(--text-tertiary)]">
            Kayıtlı deney yok.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {c.experiments.map((e) => (
              <article key={e.key} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-[13px] font-bold text-[var(--text-primary)]">{e.key}</h3>
                  <span className="text-[11px] text-[var(--text-tertiary)]">{e.status}</span>
                </div>
                {e.hypothesis && <p className="text-[12px] text-[var(--text-secondary)] mb-2">{e.hypothesis}</p>}

                <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-2">
                  <Stat label="Kaynak" value={nf.format(e.totals.sourced)} />
                  <Stat label="Kabul" value={nf.format(e.totals.accepted)} />
                  <Stat label="Gönderim" value={nf.format(e.totals.sent)} />
                  <Stat label="Teslim" value={nf.format(e.totals.delivered)} />
                  <Stat label="Cevap" value={rate(e.rates.replyRate)} />
                  <Stat label="Olumlu" value={rate(e.rates.positiveReplyRate)} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                  <Stat label="Bilinmeyen" value={nf.format(e.totals.unknown)} hint="sıfır sayılmaz" />
                  <Stat label="Bounce" value={rate(e.rates.bounceRate)} />
                  <Stat label="Lead maliyeti" value={money(e.cost.costPerAcceptedLeadUsd)} />
                  <Stat label="Cevap maliyeti" value={money(e.cost.costPerReplyUsd)} />
                </div>

                <div className="text-[12px] text-[var(--text-secondary)]">
                  {e.winner.decided ? (
                    <>
                      Kazanan: <strong className="text-[var(--text-primary)]">{e.winner.variantKey}</strong> ·
                      olumlu cevap %{e.winner.positiveReplyRate}
                    </>
                  ) : e.winner.reason === 'insufficient_sample' ? (
                    <>Kazanan yok — yetersiz örneklem ({e.winner.delivered}/{e.winner.needed} teslim)</>
                  ) : e.winner.reason === 'tie' ? (
                    <>Kazanan yok — varyantlar arasında fark yok</>
                  ) : (
                    <>Varyant tanımlı değil</>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* GrafikcemOS önerileri — SALT OKUNUR. Buradan uygulanamaz. */}
      <section>
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-2">
          Öneriler <span className="font-normal text-[var(--text-tertiary)]">· GrafikcemOS · salt okunur</span>
        </h2>
        {recommendations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-center text-[12px] text-[var(--text-tertiary)]">
            Öneri yok.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recommendations.map((r) => (
              <article key={r.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">{r.title}</h3>
                  <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">
                    {r.kind} · {r.status}
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">{r.rationale}</p>
                <p className="text-[12px] text-[var(--text-primary)] mt-1">→ {r.proposed_change}</p>
                <div className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
                  güven: {r.confidence}
                  {!r.sample_sufficient && (
                    // Örneklem yetersizse bunu SAKLAMAK, zayıf bir öneriyi
                    // güçlü göstermek olurdu.
                    <strong className="text-[var(--warning)]"> · örneklem yetersiz</strong>
                  )}
                  {r.experiment_key && <> · deney: {r.experiment_key}</>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="text-[11px] text-[var(--text-tertiary)] border-t border-[var(--border-subtle)] pt-3">
        <ul className="list-disc pl-5 flex flex-col gap-0.5">
          {c.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </footer>
    </div>
  )
}
