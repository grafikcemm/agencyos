// ─────────────────────────────────────────────────────────────────────────────
// Enrichment RUNNER (FINAL PILOT BLOCKERS Faz 4) — orkestratörün GERÇEK deps'i.
//
// selectCandidates/saveContact/saveEvidence/recordRunSummary GERÇEK DB;
// collectEvidence GERÇEK (site/places/psi). Kişi kaynağı: web (site HTML'inden
// e-posta) → gerekirse Apollo. Fake-provider varyantı (E2E) YALNIZ kişi/kanıt
// KAYNAKLARINI fake'ler; DB persist yolu gerçek kalır (seed→enrich→ready kanıtı).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { supabaseAdmin } from '@/lib/supabase'
import { createContact } from '@/lib/contacts/contactService'
import { resolveCanonicalRecipients } from '@/lib/contacts/contactService'
import { collectEvidence } from '@/lib/leadIntel/evidenceCollector'
import { persistEvidence } from '@/lib/leadIntel/evidenceStore'
import type { EvidenceItem } from '@/lib/types'
import { searchPeople } from '@/lib/personLeads/apollo'
import { guardedFetch } from '@/lib/leadIntel/urlGuard'
import type {
  EnrichmentDeps,
  CandidateLead,
  FoundContact,
  FoundEvidence,
  EnrichmentSummary,
} from './enrichmentOrchestrator'
import { SOURCE_CONFIDENCE } from './enrichmentOrchestrator'

const ENRICHMENT_RUN_SETTING = 'enrichment_last_run'

interface LeadRow {
  id: string
  business_name: string | null
  website: string | null
  city: string | null
  sector: string | null
  email: string | null
  score: number | null
  potential_score: number | null
}

/** Aktif, işlenebilir lead'lerden recipient/evidence eksik olanları önceliklendir. */
async function selectCandidates(maxLeads: number): Promise<CandidateLead[]> {
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, website, city, sector, email, score, potential_score')
    .in('status', ['new', 'contacted'])
    .eq('do_not_contact', false)
    .order('score', { ascending: false })
    .limit(maxLeads * 4) // adaydan fazlasını çek; eksik-olanları filtreleyip cap uygula
  if (error) throw new Error(`aday leadler okunamadı: ${error.message}`)
  const rows = (leads ?? []) as LeadRow[]
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const [recipients, evidenceCounts] = await Promise.all([
    resolveCanonicalRecipients(ids),
    countEvidenceByLead(ids),
  ])

  const candidates: CandidateLead[] = rows.map((r) => {
    const hasRecipient = (recipients.get(r.id)?.email ?? null) !== null
    const hasEvidence = (evidenceCounts.get(r.id) ?? 0) > 0
    const baseScore = r.score ?? r.potential_score ?? 0
    // Eksiklik önceliği: recipient yok (+2) > evidence yok (+1); skoru da katar.
    const priority = baseScore + (hasRecipient ? 0 : 200) + (hasEvidence ? 0 : 100)
    return {
      leadId: r.id,
      businessName: r.business_name ?? 'İsimsiz',
      website: r.website,
      city: r.city,
      sector: r.sector,
      hasRecipient,
      hasEvidence,
      priority,
    }
  })

  return candidates
    .filter((c) => !c.hasRecipient || !c.hasEvidence)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxLeads)
}

async function countEvidenceByLead(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const { data, error } = await supabaseAdmin
    .from('lead_evidence')
    .select('lead_id')
    .in('lead_id', ids)
  if (error) throw new Error(`kanıt sayımı okunamadı: ${error.message}`)
  for (const row of (data ?? []) as Array<{ lead_id: string }>) {
    out.set(row.lead_id, (out.get(row.lead_id) ?? 0) + 1)
  }
  return out
}

/** Web (site HTML) e-posta çıkarımı — mailto + düz metin. UYDURMA YOK: yalnız
 *  gerçekten sayfada bulunan adres. Başlık-enjeksiyonu (whitespace) reddedilir. */
export function extractEmailsFromHtml(html: string, domainHint: string | null): FoundContact[] {
  const found = new Map<string, FoundContact>()
  const mailtoRe = /mailto:([^"'>\s?]+@[^"'>\s?]+)/gi
  const textRe = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi
  const fetchedAt = new Date().toISOString()
  const push = (raw: string) => {
    const email = raw.trim().toLowerCase()
    if (email.length < 5 || /\s/.test(email)) return
    // Gürültü: statik asset/örnek adresleri ele.
    if (/(example\.com|sentry|\.png|\.jpg|wixpress|gmail\.com$)/i.test(email) && domainHint && !email.endsWith(domainHint)) return
    if (found.has(email)) return
    found.set(email, {
      fullName: `${email.split('@')[0]} (${domainHint ?? 'site'})`,
      role: 'other',
      email,
      source: 'website',
      confidence: SOURCE_CONFIDENCE.website,
      fetchedAt,
    })
  }
  for (const m of html.matchAll(mailtoRe)) push(m[1])
  for (const m of html.matchAll(textRe)) push(m[0])
  return [...found.values()].slice(0, 3)
}

async function findContactsFromWeb(lead: CandidateLead): Promise<FoundContact[]> {
  if (!lead.website) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const result = await guardedFetch(lead.website, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgencyOS/1.0)' },
    })
    if (!result.response || !result.response.ok) return []
    const html = result.response.body.slice(0, 80_000)
    const domainHint = (() => {
      try { return new URL(lead.website!).hostname.replace(/^www\./, '') } catch { return null }
    })()
    return extractEmailsFromHtml(html, domainHint)
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Apollo email_status → güven; verified değilse düşük (HITL). */
function apolloConfidence(emailStatus: string | null): number {
  return emailStatus === 'verified' ? SOURCE_CONFIDENCE.apollo_verified : SOURCE_CONFIDENCE.apollo_unverified
}

async function findContactsFromApollo(lead: CandidateLead): Promise<FoundContact[]> {
  if (!lead.city) return []
  const result = await searchPeople(
    {
      person_titles: ['owner', 'founder', 'ceo', 'marketing manager', 'general manager'],
      person_locations: [lead.city, 'Turkey'],
    },
    { perPage: 5 },
  )
  const fetchedAt = new Date().toISOString()
  return result.people
    .filter((p) => p.email)
    .map<FoundContact>((p) => ({
      fullName: p.full_name,
      role: 'other',
      email: p.email as string,
      source: 'apollo',
      confidence: apolloConfidence(p.email_status),
      fetchedAt,
    }))
}

async function collectEvidenceFor(lead: CandidateLead): Promise<FoundEvidence[]> {
  const { items } = await collectEvidence({
    businessName: lead.businessName,
    sector: lead.sector ?? '',
    website: lead.website,
    phone: null,
    rating: null,
    reviewCount: 0,
    googlePlaceId: null,
  })
  const fetchedAt = new Date().toISOString()
  return items.map<FoundEvidence>((e) => ({
    kind: e.kind,
    source: e.source,
    url: e.url ?? null,
    summary: e.summary,
    verified: e.verified,
    confidence: e.confidence,
    fetchedAt,
  }))
}

async function saveContact(input: {
  leadId: string
  contact: FoundContact
  isPrimary: boolean
}): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const r = await createContact({
    leadId: input.leadId,
    fullName: input.contact.fullName,
    role: input.contact.role,
    email: input.contact.email,
    source: input.contact.source,
    isPrimary: input.isPrimary,
    notes: `enrichment: ${input.contact.source} (güven ${input.contact.confidence}, ${input.contact.fetchedAt})`,
  })
  return { ok: r.ok, duplicate: r.duplicate, error: r.error }
}

async function saveEvidence(leadId: string, items: FoundEvidence[]): Promise<{ saved: number; error?: string }> {
  const runDate = new Date().toISOString().slice(0, 10)
  // FoundEvidence → EvidenceItem: source/kind serbest string; DB katmanında
  // lead_evidence.source/kind sadece text (CHECK yok) — güvenli cast.
  const evidenceItems = items.map((e) => ({
    kind: e.kind,
    source: e.source,
    url: e.url,
    summary: e.summary,
    payload: { enrichment: true, fetchedAt: e.fetchedAt },
    confidence: e.confidence,
    verified: e.verified,
  })) as unknown as EvidenceItem[]
  const persisted = await persistEvidence(evidenceItems, { leadId, candidateKey: leadId, runDate })
  return { saved: persisted.length }
}

async function recordRunSummary(summary: EnrichmentSummary): Promise<void> {
  const payload = {
    at: new Date().toISOString(),
    scanned: summary.scanned,
    contactsAdded: summary.contactsAdded,
    evidenceAdded: summary.evidenceAdded,
    primaryAutoSet: summary.primaryAutoSet,
    hitlPending: summary.hitlPending,
    apolloCalls: summary.apolloCalls,
    duplicatesSkipped: summary.duplicatesSkipped,
    cappedOut: summary.cappedOut,
    errorCount: summary.errors.length,
    // Hata metinleri KISALTILIR (PII/secret sızmasın; yalnız sınıf/sayı).
    errorSample: summary.errors.slice(0, 5).map((e) => e.slice(0, 120)),
  }
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({ key: ENRICHMENT_RUN_SETTING, value: JSON.stringify(payload) }, { onConflict: 'key' })
  if (error) console.warn('[enrichment] koşu özeti yazılamadı:', error.message)
}

/** Gerçek deps: DB + web + Apollo + evidence. */
export function buildEnrichmentDeps(): EnrichmentDeps {
  return {
    selectCandidates,
    findContactsFromWeb,
    findContactsFromApollo,
    collectEvidenceFor,
    saveContact,
    saveEvidence,
    recordRunSummary,
  }
}

/**
 * Fake-PROVIDER deps (E2E): kişi/kanıt KAYNAKLARI fake (dış web/Apollo yok);
 * selectCandidates/saveContact/saveEvidence/recordRunSummary GERÇEK DB kalır →
 * seed→enrich→persist→ready akışı gerçek şemada kanıtlanır.
 */
export function buildFakeProviderDeps(fake: {
  contacts: Record<string, FoundContact[]>
  evidence: Record<string, FoundEvidence[]>
}): EnrichmentDeps {
  return {
    selectCandidates,
    findContactsFromWeb: async (lead) => fake.contacts[lead.leadId] ?? [],
    findContactsFromApollo: async () => [], // fake modda Apollo çağrısı yok
    collectEvidenceFor: async (lead) => fake.evidence[lead.leadId] ?? [],
    saveContact,
    saveEvidence,
    recordRunSummary,
  }
}

export async function readLastEnrichmentRun(): Promise<Record<string, unknown> | null> {
  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', ENRICHMENT_RUN_SETTING)
    .maybeSingle()
  if (!data?.value) return null
  try {
    return JSON.parse(data.value as string) as Record<string, unknown>
  } catch {
    return null
  }
}
