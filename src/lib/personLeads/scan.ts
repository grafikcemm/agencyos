// Kişi-lead taraması — preset'leri gez, Apollo'da ara, skorla, dedup, person_leads'e upsert.
// daily-scan'den BAĞIMSIZ (kendi temposu). Ücretsiz-kredi guard: rate-limit düşükse durur.

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { searchPeople } from './apollo'
import { scorePersonLead } from './scoring'
import { ALL_PRESETS, type ApolloPreset } from './presets'
import type { PersonLeadRow } from './types'

// Apollo rate-limit bu eşiğin altına inerse kalan preset'leri atla (kredi koruması).
const RATE_GUARD_MIN = 5
// C/D tier kişiler yazılmaz — "boş/zayıf lead yok".
const ACCEPT_TIERS = new Set(['A', 'B'])

export interface PresetScanResult {
  preset_id: string
  purpose: string
  fetched: number
  inserted: number
  duplicates: number
  rejected: number
  error?: string
}

export interface PersonScanOutcome {
  success: boolean
  totalInserted: number
  rateLimited: boolean
  results: PresetScanResult[]
}

interface RunOptions {
  /** Hangi preset'ler (varsayılan: hepsi). */
  presets?: ApolloPreset[]
  source?: 'cron' | 'manual'
}

export async function runPersonScan(opts: RunOptions = {}): Promise<PersonScanOutcome> {
  const presets = opts.presets ?? ALL_PRESETS
  const source = opts.source ?? 'cron'
  const results: PresetScanResult[] = []
  let totalInserted = 0
  let rateLimited = false

  for (const preset of presets) {
    if (rateLimited) break

    const r: PresetScanResult = {
      preset_id: preset.id,
      purpose: preset.purpose,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
    }

    // Hedefin ~2 katı kadar çek (tier kapısından sonra hedefe ulaşmak için), 25 ile sınırla.
    const perPage = Math.min(Math.max(preset.dailyTarget * 2, 5), 25)
    const search = await searchPeople(preset.filters, { perPage })

    if (search.error) {
      r.error = search.error
      results.push(r)
      // Anahtar yoksa tüm taramayı erken bitir (her preset aynı hataya düşecek).
      if (search.error.includes('APOLLO_API_KEY')) break
      continue
    }

    if (search.rateLimitRemaining != null && search.rateLimitRemaining < RATE_GUARD_MIN) {
      rateLimited = true
    }

    r.fetched = search.people.length

    // Dedup: bu preset'in tüm apollo_person_id'lerini TEK sorguda çek (N+1 önle).
    const candidateIds = search.people.map((p) => p.apollo_person_id)
    const { data: existingRows } = await supabaseAdmin
      .from('person_leads')
      .select('apollo_person_id')
      .in('apollo_person_id', candidateIds.length ? candidateIds : ['__none__'])
    const existingSet = new Set((existingRows ?? []).map((row: { apollo_person_id: string }) => row.apollo_person_id))

    for (const person of search.people) {
      if (r.inserted >= preset.dailyTarget) break

      const score = scorePersonLead(person, preset)
      if (!ACCEPT_TIERS.has(score.person_tier)) {
        r.rejected++
        continue
      }

      if (existingSet.has(person.apollo_person_id)) {
        r.duplicates++
        continue
      }

      const row: PersonLeadRow = {
        ...person,
        source: 'apollo',
        purpose: preset.purpose,
        preset_id: preset.id,
        b2b_filter_label: preset.label,
        difficulty_score: score.difficulty_score,
        market_score: score.market_score,
        earning_score: score.earning_score,
        person_score: score.person_score,
        person_tier: score.person_tier,
        expected_monthly_value_tl: score.expected_monthly_value_tl,
        why_now: score.why_now,
        next_action: score.next_action,
        status: 'new',
      }

      // Idempotent insert: eşzamanlı scan/cron aynı adayı araya sokmuş olabilir.
      // onConflict ignoreDuplicates → unique çakışması hata değil; eklenmeyen satır
      // duplicate olarak sayılır (rejected değil).
      const { data: upserted, error: insertErr } = await supabaseAdmin
        .from('person_leads')
        .upsert(row, { onConflict: 'apollo_person_id', ignoreDuplicates: true })
        .select('id')
      if (insertErr) {
        r.rejected++
        console.error(`person_leads insert error (${preset.id}):`, insertErr.message)
        continue
      }
      if (!upserted || upserted.length === 0) {
        r.duplicates++
        continue
      }
      existingSet.add(person.apollo_person_id)
      r.inserted++
      totalInserted++
    }

    // Tarama geçmişi (tablo yoksa sessizce atla — migration 028 uygulanana kadar bloklamasın).
    try {
      const { error: runErr } = await supabaseAdmin.from('person_scan_runs').insert({
        preset_id: preset.id,
        purpose: preset.purpose,
        fetched_count: r.fetched,
        inserted_count: r.inserted,
        duplicate_count: r.duplicates,
        rejected_count: r.rejected,
        source,
      })
      if (runErr) console.warn('person_scan_runs yazılamadı:', runErr.message)
    } catch (e) {
      console.warn('person_scan_runs yazılamadı:', e instanceof Error ? e.message : e)
    }

    results.push(r)
  }

  return { success: true, totalInserted, rateLimited, results }
}
