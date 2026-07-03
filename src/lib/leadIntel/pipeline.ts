// Lead Intelligence v2 günlük pipeline'ı — daily-scan cron'unun İÇİNDE koşar
// (tek cron; Fluid Compute + maxDuration=300). Akış:
//   keşif havuzu → ucuz ön eleme (top 6) → kanıt toplama (top 4: PSI+HTML+Places)
//   → konsey → seçim (günün 2 fırsatı) → persist → retention temizliği.
//
// Checkpoint/idempotency: lead_intel_runs (run_date UNIQUE, stage ilerler).
// Aynı gün rerun'da bugünkü assessment'ı olan aday YENİDEN audit/konsey görmez
// (PSI/LLM çift faturalanmaz). stage='done' koşu komple atlanır.
//
// Mod farkı:
// - shadow: eski kapının kabul VE red ettiği TÜM havuz değerlendirilir; v2'nin
//   seçeceği 2'ye selected=true yazılır ama lead'lere/akışa SIFIR etki. Reddedilmiş
//   adaylar lead_id=null + candidate snapshot ile saklanır.
// - active: eski kapı kalite TABANI olarak kalır — seçim yalnız eski kapının kabul
//   ettiği (insert edilmiş) adaylar arasından yapılır; seçilenlere v2 kolonları yazılır.
//
// Bu modül ASLA throw etmez; her hata run.stage='error' + notes'a düşer.

import { supabaseAdmin } from '../supabase'
import { collectEvidence, countVerified, CandidateInput } from './evidenceCollector'
import { persistEvidence, signedUrlFor, cleanupOldScreenshots, PersistedEvidence } from './evidenceStore'
import { runCouncil, CouncilResult } from './council'
import { selectDailyOpportunities, SelectionCandidate, DomainHistory } from './selection'
import { getCatalog } from '../services/catalogOverrides'
import { findServiceBySlug, domainOfPackage } from '../services/catalog'
import { isMissingColumnError, stripKeys } from '../leads/columnPersist'
import type { LeadIntelMode } from './flag'

export interface PoolCandidate {
  placeId: string
  businessName: string
  sector: string
  city: string
  district: string
  phone: string | null
  website: string | null
  rating: number | null
  reviewCount: number
  qualityScore: number // eski deterministik motorun skoru (ucuz ön eleme sırası)
  leadId: string | null // eski kapı insert ettiyse
  acceptedByLegacyGate: boolean
}

export interface PipelineSummary {
  ran: boolean
  mode: LeadIntelMode
  runDate: string
  stage: string
  audited: number
  assessed: number
  selected: string[] // businessName listesi
  costUsd: number
  notes: string[]
}

const PREFILTER_TOP = 6
const AUDIT_TOP = 4

// PostgREST eksik tabloda PGRST205, doğrudan PG 42P01 döner.
function isMissingRelation(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  return (error.message ?? '').includes('does not exist') || (error.message ?? '').includes('schema cache')
}

// ── lead_intel_runs checkpoint yardımcıları ─────────────────────────────────

async function getRun(runDate: string): Promise<{ id: string; stage: string; candidates: PoolCandidate[] } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('lead_intel_runs')
      .select('id, stage, candidates')
      .eq('run_date', runDate)
      .maybeSingle()
    if (error || !data) return null
    return { id: data.id, stage: data.stage, candidates: (data.candidates ?? []) as PoolCandidate[] }
  } catch {
    return null
  }
}

async function upsertRun(runDate: string, mode: LeadIntelMode, patch: Record<string, unknown>): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('lead_intel_runs')
      .upsert({ run_date: runDate, mode, ...patch }, { onConflict: 'run_date' })
      .select('id')
      .maybeSingle()
    if (error) {
      if (!isMissingRelation(error)) console.warn('[leadIntel] run upsert hatası:', error.message)
      return null
    }
    return data?.id ?? null
  } catch {
    return null
  }
}

// Bugünkü mevcut assessment (rerun'da çift PSI/LLM önleme).
async function findTodaysAssessment(runDate: string, candidate: PoolCandidate): Promise<string | null> {
  try {
    let query = supabaseAdmin.from('lead_assessments').select('id').eq('run_date', runDate).limit(1)
    if (candidate.leadId) {
      query = query.eq('lead_id', candidate.leadId)
    } else {
      query = query.contains('candidate', { placeId: candidate.placeId })
    }
    const { data, error } = await query
    if (error || !data || data.length === 0) return null
    return data[0].id
  } catch {
    return null
  }
}

// ── 7-gün Tasarım/AI denge geçmişi ──────────────────────────────────────────

export async function loadDomainHistory(runDate: string): Promise<DomainHistory> {
  const history: DomainHistory = { designCount: 0, aiCount: 0 }
  try {
    const since = new Date(`${runDate}T00:00:00+03:00`)
    since.setDate(since.getDate() - 7)
    const sinceStr = since.toISOString().slice(0, 10)

    const { data, error } = await supabaseAdmin
      .from('lead_assessments')
      .select('chair_verdict')
      .eq('selected', true)
      .gte('run_date', sinceStr)
      .lt('run_date', runDate)
    if (error || !data) return history

    for (const row of data as Array<{ chair_verdict: { primary_service_slug?: string } | null }>) {
      const slug = row.chair_verdict?.primary_service_slug
      if (!slug) continue
      const pkg = findServiceBySlug(slug)
      if (!pkg) continue
      const domain = domainOfPackage(pkg)
      if (domain === 'tasarim') history.designCount += 1
      else if (domain === 'ai_otomasyon') history.aiCount += 1
      else {
        history.designCount += 0.5
        history.aiCount += 0.5
      }
    }
  } catch {
    // veri yoksa nötr geçmiş
  }
  return history
}

// ── Aday değerlendirme (kanıt → konsey) ─────────────────────────────────────

interface AssessedCandidate {
  candidate: PoolCandidate
  evidence: PersistedEvidence[]
  council: CouncilResult
  verifiedCount: number
  hasContactChannel: boolean
  assessmentId: string | null
  // Kanıt toplama notları (PSI 429/timeout vb.) — assessment'a persist edilir.
  collectionNotes: string[]
}

async function assessCandidate(
  candidate: PoolCandidate,
  opts: { runDate: string; mode: LeadIntelMode; catalog: Awaited<ReturnType<typeof getCatalog>>; notes: string[] }
): Promise<AssessedCandidate | null> {
  try {
    const input: CandidateInput = {
      businessName: candidate.businessName,
      sector: candidate.sector,
      website: candidate.website,
      phone: candidate.phone,
      rating: candidate.rating,
      reviewCount: candidate.reviewCount,
      googlePlaceId: candidate.placeId,
    }
    const { items, notes: collectionNotes } = await collectEvidence(input)
    // PSI/kaynak hataları run notlarına da akar (sessiz kayıp yok).
    for (const n of collectionNotes) opts.notes.push(n)
    const persisted = await persistEvidence(items, {
      leadId: candidate.leadId,
      candidateKey: candidate.placeId,
      runDate: opts.runDate,
    })
    if (persisted.length === 0) {
      opts.notes.push(`${candidate.businessName}: kanıt persist edilemedi (migration 033?) → atlandı`)
      return null
    }

    const shotRow = persisted.find((e) => e.kind === 'screenshot' && e.storage_path)
    const screenshotSignedUrl = shotRow?.storage_path ? await signedUrlFor(shotRow.storage_path) : null

    const council = await runCouncil({
      businessName: candidate.businessName,
      sector: candidate.sector,
      evidence: persisted,
      screenshotSignedUrl,
      catalog: opts.catalog,
      // Place adaylarında lead UUID yoktur; UUID kolona place_id yazılmaz.
      relatedLeadId: candidate.leadId,
    })

    // İletişim kanalı: telefon || sitede bulunan e-posta || WhatsApp sinyali.
    const htmlPayload = (persisted.find((e) => e.kind === 'html_signal')?.payload ?? {}) as Record<string, unknown>
    const foundEmails = Array.isArray(htmlPayload.found_emails) ? (htmlPayload.found_emails as string[]) : []
    const hasContactChannel = Boolean(candidate.phone) || foundEmails.length > 0 || htmlPayload.has_whatsapp === true

    return {
      candidate,
      evidence: persisted,
      council,
      verifiedCount: countVerified(persisted),
      hasContactChannel,
      assessmentId: null,
      collectionNotes,
    }
  } catch (error) {
    opts.notes.push(`${candidate.businessName}: değerlendirme hatası (${error instanceof Error ? error.message : 'bilinmeyen'})`)
    return null
  }
}

// ── Persist: lead_assessments + lead_service_matches + (active) v2 lead kolonları ──

async function persistAssessment(
  a: AssessedCandidate,
  opts: { runDate: string; mode: LeadIntelMode; selected: boolean }
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('lead_assessments')
      .insert({
        lead_id: a.candidate.leadId,
        candidate: a.candidate.leadId ? null : { ...a.candidate },
        run_date: opts.runDate,
        mode: a.council.mode,
        shadow: opts.mode === 'shadow',
        selected: opts.selected,
        design_score: a.council.designScore,
        ai_score: a.council.aiScore,
        evidence_count: a.evidence.length,
        verified_evidence_count: a.verifiedCount,
        council: {
          design_critic: a.council.designCritic,
          automation: a.council.automation,
          skeptic: a.council.skeptic,
          notes: a.council.notes,
          collection_notes: a.collectionNotes,
        },
        chair_verdict: a.council.chair,
        // GERÇEK assessment maliyeti (retry çağrıları dahil) — council muhasebesinden.
        cost_usd: a.council.costUsd,
      })
      .select('id')
      .single()
    if (error) {
      if (!isMissingRelation(error)) console.warn('[leadIntel] assessment insert hatası:', error.message)
      return null
    }

    const assessmentId = data.id as string
    if (a.council.matches.length > 0) {
      await supabaseAdmin.from('lead_service_matches').insert(
        a.council.matches.map((m) => ({
          assessment_id: assessmentId,
          lead_id: a.candidate.leadId,
          service_slug: m.service_slug,
          rank: m.rank,
          score: m.score,
          evidence_refs: m.evidence_refs,
          reasons: m.reasons,
        }))
      )
    }
    return assessmentId
  } catch {
    return null
  }
}

async function writeV2LeadColumns(a: AssessedCandidate, assessmentId: string | null): Promise<void> {
  if (!a.candidate.leadId) return
  const payload: Record<string, unknown> = {
    design_score: a.council.designScore,
    ai_score: a.council.aiScore,
    primary_service_slug: a.council.chair.decision === 'opportunity' ? a.council.chair.primary_service_slug : null,
    last_assessment_id: assessmentId,
    last_assessed_at: new Date().toISOString(),
  }
  try {
    const { error } = await supabaseAdmin.from('leads').update(payload).eq('id', a.candidate.leadId)
    // Migration 034 yoksa PGRST204 → v2 anahtarsız retry (kalan alan olmadığından no-op yeterli).
    if (error && isMissingColumnError(error)) {
      const strippedPayload = stripKeys(payload)
      if (Object.keys(strippedPayload).length > 0) {
        await supabaseAdmin.from('leads').update(strippedPayload).eq('id', a.candidate.leadId)
      }
    }
  } catch {
    // soft-fail
  }
}

// ── Tek lead manuel audit (POST /api/leads/[id]/audit) ─────────────────────
// Cron akışından bağımsız: mevcut bir lead satırını kanıt+konseyden geçirir,
// assessment persist eder ve v2 kolonlarını yazar. Günlük tavana uyar (council içinde).

export async function auditSingleLead(leadRow: {
  id: string
  business_name: string
  sector: string | null
  city: string | null
  district: string | null
  phone: string | null
  website: string | null
  rating: number | null
  review_count: number | null
  google_place_id: string | null
  quality_score: number | null
}): Promise<{ ok: boolean; assessmentId: string | null; summary: string; council?: CouncilResult }> {
  const notes: string[] = []
  const runDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
  const candidate: PoolCandidate = {
    placeId: leadRow.google_place_id ?? leadRow.id,
    businessName: leadRow.business_name,
    sector: leadRow.sector ?? 'bilinmeyen',
    city: leadRow.city ?? '',
    district: leadRow.district ?? '',
    phone: leadRow.phone,
    website: leadRow.website,
    rating: leadRow.rating,
    reviewCount: leadRow.review_count ?? 0,
    qualityScore: leadRow.quality_score ?? 0,
    leadId: leadRow.id,
    acceptedByLegacyGate: true,
  }
  const catalog = await getCatalog()
  const assessed = await assessCandidate(candidate, { runDate, mode: 'active', catalog, notes })
  if (!assessed) {
    return { ok: false, assessmentId: null, summary: notes.join('; ') || 'Değerlendirme başarısız' }
  }
  const assessmentId = await persistAssessment(assessed, { runDate, mode: 'active', selected: false })
  await writeV2LeadColumns(assessed, assessmentId)
  return {
    ok: true,
    assessmentId,
    summary: `mode=${assessed.council.mode}, design=${assessed.council.designScore}, ai=${assessed.council.aiScore}, karar=${assessed.council.chair.decision}`,
    council: assessed.council,
  }
}

// ── Ana koşucu ───────────────────────────────────────────────────────────────

export async function runLeadIntelPipeline(opts: {
  pool: PoolCandidate[]
  runDate: string
  mode: LeadIntelMode
}): Promise<PipelineSummary> {
  const notes: string[] = []
  const summary: PipelineSummary = {
    ran: false,
    mode: opts.mode,
    runDate: opts.runDate,
    stage: 'skipped',
    audited: 0,
    assessed: 0,
    selected: [],
    costUsd: 0,
    notes,
  }
  if (opts.mode === 'off') return summary

  // PAGESPEED_API_KEY production/shadow için ZORUNLU: masaüstü audit + screenshot
  // olmadan görsel kanıt zinciri kurulamaz. Sessiz düşük-kaliteli koşu yerine
  // gözlemlenebilir hata (run.stage='error' + not) üretilir; legacy cron akışı etkilenmez.
  if (!process.env.PAGESPEED_API_KEY) {
    const msg = 'PAGESPEED_API_KEY yok — shadow/active mod için zorunlu. v2 koşusu atlandı.'
    notes.push(msg)
    summary.stage = 'error'
    await upsertRun(opts.runDate, opts.mode, { stage: 'error', error: msg, finished_at: new Date().toISOString() })
    return summary
  }

  try {
    // Checkpoint: bugünkü koşu bitmişse atla; yarımsa kayıtlı havuzla devam et.
    const existing = await getRun(opts.runDate)
    if (existing?.stage === 'done') {
      summary.stage = 'done'
      notes.push('Bugünkü koşu zaten tamamlanmış (idempotent atlama).')
      return summary
    }
    const pool = existing && existing.candidates.length > 0 ? existing.candidates : opts.pool
    if (pool.length === 0) {
      notes.push('Aday havuzu boş — koşu atlandı.')
      return summary
    }

    const runId = await upsertRun(opts.runDate, opts.mode, {
      stage: 'discovered',
      candidates: pool,
      started_at: new Date().toISOString(),
    })
    if (!runId) {
      notes.push('lead_intel_runs yazılamadı (migration 033?) — v2 koşusu atlandı.')
      return summary
    }
    summary.ran = true

    // Ucuz ön eleme: eski deterministik skora göre top 6 → audit top 4.
    const prefiltered = [...pool].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, PREFILTER_TOP)
    const toAudit = prefiltered.slice(0, AUDIT_TOP)
    const catalog = await getCatalog()

    // Audit + konsey (rerun'da bugünkü assessment'ı olan aday atlanır — çift fatura yok).
    const assessed: AssessedCandidate[] = []
    for (const candidate of toAudit) {
      const already = await findTodaysAssessment(opts.runDate, candidate)
      if (already) {
        notes.push(`${candidate.businessName}: bugünkü assessment mevcut → yeniden audit edilmedi.`)
        continue
      }
      const result = await assessCandidate(candidate, { runDate: opts.runDate, mode: opts.mode, catalog, notes })
      if (result) assessed.push(result)
    }
    summary.audited = toAudit.length
    summary.assessed = assessed.length
    await upsertRun(opts.runDate, opts.mode, { stage: 'assessed' })

    // Seçim: active modda eski kapı kalite TABANI — yalnız kabul edilmişler yarışır.
    const history = await loadDomainHistory(opts.runDate)
    const selectable = opts.mode === 'active' ? assessed.filter((a) => a.candidate.acceptedByLegacyGate) : assessed

    const selectionInput: SelectionCandidate[] = selectable.map((a) => {
      const primaryMatch = a.council.matches.find((m) => m.service_slug === a.council.chair.primary_service_slug)
      const pkg = a.council.chair.decision === 'opportunity' ? findServiceBySlug(a.council.chair.primary_service_slug) : null
      return {
        key: a.candidate.placeId,
        businessName: a.candidate.businessName,
        designScore: a.council.designScore,
        aiScore: a.council.aiScore,
        verifiedEvidenceCount: a.verifiedCount,
        hasContactChannel: a.hasContactChannel,
        primaryDomain: pkg ? domainOfPackage(pkg) : 'tasarim',
        primaryMatchScore: primaryMatch?.score ?? 0,
        chairDecision: a.council.chair.decision,
      }
    })
    const selection = selectDailyOpportunities(selectionInput, history)
    const selectedKeys = new Set(selection.selected.map((s) => s.key))
    summary.selected = selection.selected.map((s) => s.businessName)
    for (const r of selection.rejected) notes.push(`${r.candidate.businessName}: ${r.reason}`)

    // Persist: tüm değerlendirilenler yazılır, seçilenler selected=true.
    // Run maliyeti = Σ assessment maliyetleri (tutarlılık: run toplamı ↔ assessment toplamı).
    let runCostUsd = 0
    for (const a of assessed) {
      const isSelected = selectedKeys.has(a.candidate.placeId)
      const assessmentId = await persistAssessment(a, { runDate: opts.runDate, mode: opts.mode, selected: isSelected })
      runCostUsd += a.council.costUsd
      // Active modda seçilen (insert edilmiş) lead'lere v2 kolonları yazılır.
      if (opts.mode === 'active' && isSelected) {
        await writeV2LeadColumns(a, assessmentId)
      }
    }

    // Retention: 90 günden eski screenshot'lar (converted muaf) — best effort.
    const cleaned = await cleanupOldScreenshots()
    if (cleaned > 0) notes.push(`Retention: ${cleaned} eski screenshot temizlendi.`)

    summary.costUsd = Math.round(runCostUsd * 1_000_000) / 1_000_000
    await upsertRun(opts.runDate, opts.mode, {
      stage: 'done',
      selected_count: selection.selected.length,
      cost_usd: summary.costUsd,
      finished_at: new Date().toISOString(),
    })
    summary.stage = 'done'
    return summary
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'bilinmeyen'
    notes.push(`Pipeline hatası: ${msg}`)
    summary.stage = 'error'
    await upsertRun(opts.runDate, opts.mode, { stage: 'error', error: msg, finished_at: new Date().toISOString() })
    return summary
  }
}
