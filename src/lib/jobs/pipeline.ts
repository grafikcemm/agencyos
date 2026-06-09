import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { parseJsonObject, toStringArray } from './parse'

// Subagent boru hattının "yapıştırıcı"sı. runner.ts bir job_* task'ini LLM ile
// çalıştırdıktan sonra burayı çağırır: LLM çıktısını ayrıştırır, job_listings'i
// günceller ve bir sonraki uzmanı (evaluator → legitimacy → writer) kuyruğa atar.
//
// Adversarial tasarım: fit skoru (job_evaluator) ile scam kararı (job_legitimacy)
// AYRI agent'lardan gelir. Taslak (job_writer) yalnızca fit eşiği geçilirse VE
// legitimacy 'suspicious' DEĞİLSE üretilir.

const FIT_THRESHOLD = 60

export function isJobAgent(key: string): boolean {
  return key === 'job_evaluator' || key === 'job_legitimacy' || key === 'job_writer' || key === 'job_scout'
}

interface ListingRow {
  id: string
  title: string
  company: string | null
  location: string | null
  description: string | null
  url: string
  source: string
  remote: boolean
  fit_score: number | null
  legitimacy: string | null
}

async function loadListing(listingId: string): Promise<ListingRow | null> {
  const { data } = await supabaseAdmin
    .from('job_listings')
    .select('id, title, company, location, description, url, source, remote, fit_score, legitimacy')
    .eq('id', listingId)
    .maybeSingle<ListingRow>()
  return data ?? null
}

// runner.gatherContext'ten çağrılır: ilgili ilanı deterministik bağlam olarak verir.
export async function gatherJobContext(agentKey: string, input: Record<string, unknown>): Promise<string> {
  if (agentKey === 'job_scout') return '' // istatistikler userPrompt'ta zaten var
  const listingId = typeof input.listing_id === 'string' ? input.listing_id : ''
  if (!listingId) return ''
  const l = await loadListing(listingId)
  if (!l) return 'İlan bulunamadı.'
  const parts = [
    `Başlık: ${l.title}`,
    l.company ? `Şirket: ${l.company}` : '',
    l.location ? `Konum: ${l.location}` : '',
    `Remote: ${l.remote ? 'evet' : 'hayır'}`,
    `Kaynak: ${l.source}`,
    `URL: ${l.url}`,
    l.fit_score != null ? `Fit skoru: ${l.fit_score}/100` : '',
    l.description ? `\nAçıklama:\n${l.description.slice(0, 1500)}` : '',
  ]
  return `İLAN:\n${parts.filter(Boolean).join('\n')}`
}

function enqueue(agentKey: string, title: string, input: Record<string, unknown>) {
  return supabaseAdmin.from('agent_tasks').insert({
    agent_key: agentKey,
    title: title.slice(0, 200),
    input,
    status: 'queued',
    directive_id: null,
  })
}

// runner.runTask başarı sonrası çağırır. Task tipine göre DB günceller + zincirler.
export async function handleJobTaskResult(
  task: { agent_key: string; input: Record<string, unknown> },
  content: string,
  modelUsed: string,
): Promise<void> {
  const listingId = typeof task.input.listing_id === 'string' ? task.input.listing_id : ''

  if (task.agent_key === 'job_evaluator') {
    if (!listingId) return
    const parsed = parseJsonObject(content)
    if (!parsed) {
      // Ayrıştırılamayan değerlendirme: skor üretilemedi → havuzu kirletmesin,
      // 'evaluating'de takılı kalmasın. Terminal olarak dismiss.
      await supabaseAdmin
        .from('job_listings')
        .update({
          fit_score: 0,
          fit_reasons: ['değerlendirme ayrıştırılamadı'],
          status: 'dismissed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', listingId)
      return
    }
    const fitScore = typeof parsed.fit_score === 'number'
      ? Math.max(0, Math.min(100, Math.round(parsed.fit_score)))
      : 0
    const reasons = toStringArray(parsed.fit_reasons)
    await supabaseAdmin
      .from('job_listings')
      .update({ fit_score: fitScore, fit_reasons: reasons, status: 'evaluating', updated_at: new Date().toISOString() })
      .eq('id', listingId)
    // Her zaman scam denetimine geç (adversarial katman). Kuyruğa atma başarısız
    // olursa ilan 'evaluating'de takılı kalmasın diye 'scored'a düşür.
    const { error: chainErr } = await enqueue('job_legitimacy', `Scam denetimi — ${listingId}`, { listing_id: listingId })
    if (chainErr) {
      await supabaseAdmin
        .from('job_listings')
        .update({ status: 'scored', updated_at: new Date().toISOString() })
        .eq('id', listingId)
    }
    return
  }

  if (task.agent_key === 'job_legitimacy') {
    if (!listingId) return
    const parsed = parseJsonObject(content)
    const raw = parsed && typeof parsed.legitimacy === 'string' ? parsed.legitimacy : 'caution'
    const legitimacy = raw === 'high' || raw === 'caution' || raw === 'suspicious' ? raw : 'caution'
    const flags = parsed ? toStringArray(parsed.scam_flags) : ['denetim ayrıştırılamadı']
    await supabaseAdmin
      .from('job_listings')
      .update({ legitimacy, scam_flags: flags, status: 'scored', updated_at: new Date().toISOString() })
      .eq('id', listingId)

    const l = await loadListing(listingId)
    const fit = l?.fit_score ?? 0
    if (legitimacy !== 'suspicious' && fit >= FIT_THRESHOLD) {
      await enqueue('job_writer', `Başvuru taslağı — ${l?.title ?? listingId}`, { listing_id: listingId })
    }
    return
  }

  if (task.agent_key === 'job_writer') {
    if (!listingId) return
    const parsed = parseJsonObject(content)
    const body = parsed && typeof parsed.body === 'string' ? parsed.body : ''
    if (!body) return // gövde yoksa taslak yazma
    const langRaw = parsed && typeof parsed.lang === 'string' ? parsed.lang : 'tr'
    const lang = langRaw === 'en' ? 'en' : 'tr'
    const subject = parsed && typeof parsed.subject === 'string' ? parsed.subject : null
    await supabaseAdmin.from('job_application_drafts').insert({
      listing_id: listingId,
      lang,
      subject,
      body,
      model_used: modelUsed,
    })
    await supabaseAdmin
      .from('job_listings')
      .update({ status: 'drafted', updated_at: new Date().toISOString() })
      .eq('id', listingId)
    return
  }

  // job_scout: debrief task'i — çıktı agent_tasks.result'ta zaten saklanır, ek iş yok.
}
