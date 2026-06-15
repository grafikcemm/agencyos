import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { jobHttp } from './http'
import { passesFilter } from './filter'
import { ATS_PROVIDERS, JOB_SOURCES, TR_SCRAPE_TARGETS, fetchTrJobs } from './providers'
import type { RawJob } from './types'

// İş ilanı tarama orchestrator'ı. SADECE fetch + deterministik filtre + dedup +
// DB yazımı yapar (LLM YOK — Hobby cron süre limiti). Filtreyi geçen her yeni ilan
// için bir job_evaluator task'i kuyruğa atar; boru hattını agent-tick drene eder.

const CONCURRENCY = 4

export interface ScanStats {
  fetched: number
  filtered: number
  inserted: number
  duplicates: number
  enqueued: number
  errors: string[]
}

// Basit eşzamanlılık limiti (career-ops scan.mjs limit pattern'i).
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const current = idx++
      out[current] = await fn(items[current])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function fetchAtsSources(errors: string[]): Promise<RawJob[]> {
  const results = await mapLimit(JOB_SOURCES, CONCURRENCY, async (entry) => {
    const provider = ATS_PROVIDERS[entry.provider]
    if (!provider) {
      errors.push(`${entry.name}: bilinmeyen provider "${entry.provider}"`)
      return [] as RawJob[]
    }
    try {
      return await provider.fetch(entry, jobHttp)
    } catch (e) {
      errors.push(`${entry.name} (${entry.provider}): ${e instanceof Error ? e.message : 'hata'}`)
      return [] as RawJob[]
    }
  })
  return results.flat()
}

async function fetchTrSources(errors: string[]): Promise<RawJob[]> {
  const results = await mapLimit(TR_SCRAPE_TARGETS, CONCURRENCY, async (target) => {
    try {
      return await fetchTrJobs(target)
    } catch (e) {
      errors.push(`TR "${target.url}": ${e instanceof Error ? e.message : 'hata'}`)
      return [] as RawJob[]
    }
  })
  return results.flat()
}

export interface IngestResult {
  inserted: boolean
  duplicate: boolean
  enqueued: boolean
  listingId?: string
  error?: string
}

// Tek bir ham ilanı job_listings'e yazar + job_evaluator task'i kuyruğa atar.
// Atomik dedup (url UNIQUE + ignoreDuplicates) → eşzamanlı tarama/manuel ingest
// çakışmasında çift task oluşmaz. Hem runJobScan hem manuel ingest endpoint kullanır.
export async function ingestJob(job: RawJob): Promise<IngestResult> {
  const { data: insertedRows, error: insertErr } = await supabaseAdmin
    .from('job_listings')
    .upsert(
      {
        source: job.source,
        source_job_id: job.sourceJobId ?? null,
        url: job.url,
        title: job.title,
        company: job.company || null,
        location: job.location || null,
        description: job.description ?? null,
        employment_type: job.employmentType ?? null,
        remote: Boolean(job.remote),
        posted_at: job.postedAt ?? null,
        status: 'new',
      },
      { onConflict: 'url', ignoreDuplicates: true },
    )
    .select('id')
    .returns<{ id: string }[]>()

  if (insertErr) {
    return { inserted: false, duplicate: false, enqueued: false, error: `insert "${job.title}": ${insertErr.message}` }
  }
  if (!insertedRows || insertedRows.length === 0) {
    return { inserted: false, duplicate: true, enqueued: false }
  }
  const row = insertedRows[0]

  const { error: taskErr } = await supabaseAdmin.from('agent_tasks').insert({
    agent_key: 'job_evaluator',
    title: `Fit değerlendir — ${job.title}`.slice(0, 200),
    input: { listing_id: row.id },
    status: 'queued',
    directive_id: null,
  })
  return {
    inserted: true,
    duplicate: false,
    enqueued: !taskErr,
    listingId: row.id,
    error: taskErr ? `enqueue "${job.title}": ${taskErr.message}` : undefined,
  }
}

// URL'e göre batch içi tekilleştirme.
function dedupeByUrl(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>()
  const out: RawJob[] = []
  for (const job of jobs) {
    if (seen.has(job.url)) continue
    seen.add(job.url)
    out.push(job)
  }
  return out
}

export async function runJobScan(): Promise<ScanStats> {
  const errors: string[] = []

  const [ats, tr] = await Promise.all([fetchAtsSources(errors), fetchTrSources(errors)])
  const fetched = [...ats, ...tr]

  const passing = dedupeByUrl(fetched.filter((j) => passesFilter(j).ok))

  let inserted = 0
  let duplicates = 0
  let enqueued = 0

  for (const job of passing) {
    const r = await ingestJob(job)
    if (r.error) errors.push(r.error)
    if (r.duplicate) {
      duplicates++
      continue
    }
    if (r.inserted) {
      inserted++
      if (r.enqueued) enqueued++
    }
  }

  // job_scout koordinatör debrief task'i (kısa tarama özeti üretir).
  if (inserted > 0) {
    await supabaseAdmin.from('agent_tasks').insert({
      agent_key: 'job_scout',
      title: 'Tarama özeti',
      input: {
        fetched: fetched.length,
        filtered: passing.length,
        inserted,
        duplicates,
        errors: errors.length,
      },
      status: 'queued',
      directive_id: null,
    })
  }

  return { fetched: fetched.length, filtered: passing.length, inserted, duplicates, enqueued, errors }
}
