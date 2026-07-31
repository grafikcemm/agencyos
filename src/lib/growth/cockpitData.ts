import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { istanbulMonthKey } from './budget'
import type { SpendSummary } from './budget'
import type { CostInput, ExperimentSnapshot, FunnelCounts, VariantStats } from './cockpit'
import { describePilotGate } from './pilotGuards'
import { listOutreachHealth } from './outreach'
import { listProviderHealth } from './sources'

// ─────────────────────────────────────────────────────────────────────────────
// KOKPİT VERİ KATMANI — migration 066 UYGULANMADIĞI için her okuma fail-soft.
//
// Tablo yoksa sayfa ÇÖKMEZ ama "0 deney" de DEMEZ: eksik kaynak ADIYLA
// `warnings` içinde görünür. İkisi arasındaki fark, kullanıcının "henüz deney
// yok" ile "veri okunamıyor"u ayırt edebilmesidir — biri beklenen, diğeri arıza.
//
// Aylık harcama okunamadığında `spentUsd: null` döner; bütçe kapısı bunu
// ölçülemez sayıp koşuyu reddeder (bkz. `budget.ts`). Sıfıra düşürmek, tavanı
// sessizce kaldırmak olurdu.
// ─────────────────────────────────────────────────────────────────────────────

async function safe<T>(label: string, fn: () => Promise<T>, warnings: string[], fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    warnings.push(`${label} okunamadı (migration 066 uygulanmamış olabilir)`)
    return fallback
  }
}

const emptyCounts = (): FunnelCounts => ({
  sourced: 0, accepted: 0, eligible: 0, enqueued: 0, sent: 0, delivered: 0, replied: 0,
  positiveReplied: 0, meetings: 0, bounced: 0, optedOut: 0, complaints: 0, unknown: 0,
  opened: null, clicked: null,
})

interface ExperimentRow {
  key: string
  status: string
  niche: string | null
  offer: string | null
  hypothesis: string | null
}

interface VariantRow {
  key: string
  experiment_id: string
  changed_variable: string | null
}

const STATUSES = new Set(['draft', 'running', 'paused', 'concluded'])

export async function loadCockpitInput() {
  const warnings: string[] = []
  const monthKey = istanbulMonthKey()

  const experiments = await safe<ExperimentSnapshot[]>(
    'growth_experiments',
    async () => {
      // `select('*')` KULLANILMAZ: şema büyüdüğünde beklenmeyen sütunlar
      // sessizce arayüze akardı.
      const { data, error } = await supabaseAdmin
        .from('growth_experiments')
        .select('id,key,status,niche,offer,hypothesis')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      const rows = (data ?? []) as (ExperimentRow & { id: string })[]
      if (!rows.length) return []

      const { data: vData, error: vError } = await supabaseAdmin
        .from('growth_experiment_variants')
        .select('key,experiment_id,changed_variable')
        .in('experiment_id', rows.map((r) => r.id))
      if (vError) throw vError
      const variants = (vData ?? []) as VariantRow[]

      return rows.map((r) => ({
        key: r.key,
        status: (STATUSES.has(r.status) ? r.status : 'draft') as ExperimentSnapshot['status'],
        niche: r.niche,
        offer: r.offer,
        hypothesis: r.hypothesis,
        // Sayaçlar henüz yazılmıyor (gönderim hattı canlı değil). Sıfır
        // göstermek doğru: "bu deneyde henüz gönderim olmadı" gerçeği.
        variants: variants
          .filter((v) => v.experiment_id === r.id)
          .map<VariantStats>((v) => ({ key: v.key, changedVariable: v.changed_variable, counts: emptyCounts() })),
      }))
    },
    warnings,
    [],
  )

  const spend = await safe<SpendSummary>(
    'prospect_import_batches',
    async () => {
      const { data, error } = await supabaseAdmin
        .from('prospect_import_batches')
        .select('actual_cost_usd,status,created_at')
        .eq('provider', 'apify')
        .gte('created_at', `${monthKey}-01T00:00:00+03:00`)
      if (error) throw error
      const rows = (data ?? []) as { actual_cost_usd: number | null; status: string }[]
      const spentUsd = rows.reduce((s, r) => s + (r.actual_cost_usd ?? 0), 0)
      const burnedUsd = rows
        .filter((r) => r.status === 'failed' || r.status === 'cancelled')
        .reduce((s, r) => s + (r.actual_cost_usd ?? 0), 0)
      return { spentUsd, burnedUsd, runCount: rows.length, monthKey }
    },
    warnings,
    // Okunamayan harcama SIFIR DEĞİL — `null`.
    { spentUsd: null, burnedUsd: 0, runCount: 0, monthKey },
  )

  const cost: CostInput = { sourceCostUsd: spend.spentUsd ?? 0, burnedUsd: spend.burnedUsd }

  return {
    input: {
      experiments,
      spend,
      cost,
      sourceHealth: listProviderHealth(),
      outreachHealth: listOutreachHealth(),
      // Isınma DOĞRULANMADI: bu trende hiçbir mailbox ısıtılmadı ve
      // doğrulanmamış ısınma sıfır sayılır.
      pilotGate: describePilotGate({
        pilotEnabled: process.env.EMAIL_PILOT_ENABLED === 'true',
        warmup: { verified: false, weekNumber: null },
        stats: { sentToday: 0, delivered: 0, bounced: 0, complaints: 0, consecutiveFailures: 0 },
      }),
    },
    warnings,
  }
}
