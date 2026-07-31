import 'server-only'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { classifyReply, type ReplyClass } from '@/lib/gmail/replyFsm'

// ─────────────────────────────────────────────────────────────────────────────
// GROWTH SNAPSHOT — PII TAŞIMAZ.
//
// GrafikcemOS bu köprüden yalnız DESEN okur: hangi sektörde, hangi sinyalle,
// hangi deneyde, ne sonuç, hangi maliyet bandında. İşletme adı, e-posta,
// telefon, web sitesi, şehir kırılımı ve ham not BU YOLDAN GEÇMEZ — çünkü
// karşı taraf onları hiçbir kararda kullanmıyor ve kullanılmayan veri, yalnız
// sızabilecek veridir.
//
// KİMLİK: `anonId` = sha256(lead id + sabit tuz) ilk 16 karakter. Amaç aynı
// lead'i iki çağrı arasında EŞLEŞTİREBİLMEK, kim olduğunu söylemek değil. Ham
// UUID gönderilseydi, karşı taraf onu AgencyOS'a sorup gerçek kaydı çekebilirdi.
//
// MALİYET BANDI: tam rakam yerine bant. Deney kararı için "0-5 USD" ile
// "5-20 USD" ayrımı yeterli; kuruşu paylaşmak, finansal ayrıntıyı gereksiz bir
// yüzeye taşımak olurdu.
// ─────────────────────────────────────────────────────────────────────────────

export type GrowthWarnings = string[]

/** Tuz sabit ve KOD'da: amaç gizlilik değil, ham kimliği dışarı vermemek. */
const ANON_SALT = 'cemos-growth-v1'

export function anonId(id: string): string {
  return createHash('sha256').update(`${ANON_SALT}:${id}`).digest('hex').slice(0, 16)
}

/** Maliyeti banda indirger. Bilinmiyorsa `unknown` — 0 DEĞİL. */
export function costBand(usd: number | null | undefined): 'unknown' | 'free' | '0-5' | '5-20' | '20+' {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return 'unknown'
  if (usd <= 0) return 'free'
  if (usd < 5) return '0-5'
  if (usd < 20) return '5-20'
  return '20+'
}

async function safe<T>(label: string, fn: () => Promise<T>, warnings: GrowthWarnings, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    warnings.push(`${label} okunamadı`)
    return fallback
  }
}

export interface SectorSignal {
  sector: string
  leadCount: number
  /** Dijital varlık sinyalleri — sayaç, kimlik değil. */
  missingWebsite: number
  hasWhatsapp: number
  instagramAsSite: number
  avgPotentialScore: number | null
}

/**
 * Sektör bazında sinyal sayaçları.
 *
 * İşletme adı, e-posta, telefon ve site ALINMAZ — `select` listesi açıkça
 * yazılıdır. `select('*')` kullanılsaydı, şemaya eklenen her yeni PII sütunu
 * sessizce köprüden akardı.
 */
export async function readSectorSignals(warnings: GrowthWarnings): Promise<SectorSignal[]> {
  return safe(
    'leads',
    async () => {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('sector,status,potential_score,has_real_website,has_whatsapp,instagram_as_site')
        .limit(2000)
      if (error) throw error
      const rows = (data ?? []) as {
        sector: string | null
        potential_score: number | null
        has_real_website: boolean | null
        has_whatsapp: boolean | null
        instagram_as_site: boolean | null
      }[]
      const bySector = new Map<string, { n: number; noSite: number; wa: number; ig: number; scoreSum: number; scoreN: number }>()
      for (const r of rows) {
        const key = (r.sector ?? 'bilinmiyor').trim() || 'bilinmiyor'
        const cur = bySector.get(key) ?? { n: 0, noSite: 0, wa: 0, ig: 0, scoreSum: 0, scoreN: 0 }
        cur.n++
        if (r.has_real_website === false) cur.noSite++
        if (r.has_whatsapp) cur.wa++
        if (r.instagram_as_site) cur.ig++
        if (typeof r.potential_score === 'number') {
          cur.scoreSum += r.potential_score
          cur.scoreN++
        }
        bySector.set(key, cur)
      }
      return [...bySector.entries()]
        .map(([sector, v]) => ({
          sector,
          leadCount: v.n,
          missingWebsite: v.noSite,
          hasWhatsapp: v.wa,
          instagramAsSite: v.ig,
          // Ölçüm yoksa ortalama `null` — sıfır, "puanı sıfır" anlamına gelirdi.
          avgPotentialScore: v.scoreN ? Number((v.scoreSum / v.scoreN).toFixed(1)) : null,
        }))
        .sort((a, b) => b.leadCount - a.leadCount)
        .slice(0, 30)
    },
    warnings,
    [],
  )
}

export interface OutcomeRow {
  anonLeadId: string
  sector: string | null
  experimentKey: string | null
  variantKey: string | null
  sequenceStep: number | null
  provider: string | null
  providerState: string | null
  outcome: 'sent' | 'replied' | 'bounced' | 'opted_out' | 'unknown' | 'pending'
  /** Ham yanit metni DEGIL; deterministik FSM'in kapali-kume sonucu. */
  replyClass: ReplyClass | null
  humanReply: boolean | null
  positiveReply: boolean | null
  /** Neden ilerlemedi — kapalı küme, serbest metin DEĞİL. */
  rejectionReason: string | null
}

const OUTCOMES = new Set(['sent', 'replied', 'bounced', 'opted_out', 'unknown', 'pending'])

/** `outreach_messages.status` → kapalı küme sonuç. Bilinmeyen durum `pending`. */
export function mapOutcome(status: unknown, providerState: unknown): OutcomeRow['outcome'] {
  if (providerState === 'provider_unknown') return 'unknown'
  const s = typeof status === 'string' ? status.toLowerCase() : ''
  if (OUTCOMES.has(s)) return s as OutcomeRow['outcome']
  if (s === 'replied' || s === 'reply') return 'replied'
  if (s === 'bounce' || s === 'bounced') return 'bounced'
  if (s === 'sent' || s === 'delivered') return 'sent'
  if (s === 'unsubscribed' || s === 'opted_out') return 'opted_out'
  return 'pending'
}

export async function readOutcomes(warnings: GrowthWarnings): Promise<OutcomeRow[]> {
  return safe(
    'outreach_messages',
    async () => {
      const { data, error } = await supabaseAdmin
        .from('outreach_messages')
        .select('id,lead_id,status,sequence_step,experiment_id,variant_id,outreach_provider,provider_state')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      const rows = (data ?? []) as {
        id: string
        lead_id: string | null
        status: string | null
        sequence_step: number | null
        experiment_id: string | null
        variant_id: string | null
        outreach_provider: string | null
        provider_state: string | null
      }[]

      const outreachIds = rows.map((r) => r.id)
      const experimentIds = [...new Set(rows.map((r) => r.experiment_id).filter((v): v is string => Boolean(v)))]
      const variantIds = [...new Set(rows.map((r) => r.variant_id).filter((v): v is string => Boolean(v)))]

      // Ham inbound govde yalniz AgencyOS sunucu belleginde siniflandirilir.
      // Kopruye metin, konu veya adres degil; yalniz kapali-kume FSM sonucu cikar.
      // Sinyal kaynagi okunamazsa false uydurulmaz: alanlar `null` kalir.
      let replySignalsAvailable = true
      const classesByOutreach = new Map<string, ReplyClass[]>()
      if (outreachIds.length) {
        const { data: messages, error: messageError } = await supabaseAdmin
          .from('email_messages')
          .select('outreach_message_id,body')
          .eq('direction', 'inbound')
          .in('outreach_message_id', outreachIds)
          .limit(5000)
        if (messageError) {
          warnings.push('email reply sinyalleri okunamadi')
          replySignalsAvailable = false
        } else {
          for (const message of messages ?? []) {
            const outreachId = String(message.outreach_message_id ?? '')
            if (!outreachId) continue
            const list = classesByOutreach.get(outreachId) ?? []
            list.push(classifyReply(String(message.body ?? '')))
            classesByOutreach.set(outreachId, list)
          }
        }
      }

      const experimentKeys = new Map<string, string>()
      if (experimentIds.length) {
        const { data: experiments, error: experimentError } = await supabaseAdmin
          .from('growth_experiments')
          .select('id,key')
          .in('id', experimentIds)
        if (experimentError) warnings.push('growth experiment anahtarlari okunamadi')
        else for (const row of experiments ?? []) experimentKeys.set(String(row.id), String(row.key))
      }

      const variantKeys = new Map<string, string>()
      if (variantIds.length) {
        const { data: variants, error: variantError } = await supabaseAdmin
          .from('growth_experiment_variants')
          .select('id,key')
          .in('id', variantIds)
        if (variantError) warnings.push('growth varyant anahtarlari okunamadi')
        else for (const row of variants ?? []) variantKeys.set(String(row.id), String(row.key))
      }

      return rows.map<OutcomeRow>((r) => ({
        // Ham lead kimliği DEĞİL — anonim eşleştirme anahtarı.
        anonLeadId: anonId(r.lead_id ?? r.id),
        sector: null, // sektör kırılımı `sectorSignals` tarafında; burada kimlik bağı kurulmaz
        experimentKey: r.experiment_id ? (experimentKeys.get(r.experiment_id) ?? null) : null,
        variantKey: r.variant_id ? (variantKeys.get(r.variant_id) ?? null) : null,
        sequenceStep: r.sequence_step,
        provider: r.outreach_provider,
        providerState: r.provider_state,
        outcome: mapOutcome(r.status, r.provider_state),
        replyClass: replySignalsAvailable
          ? (classesByOutreach.get(r.id)?.find((c) => c === 'positive_interest')
            ?? classesByOutreach.get(r.id)?.find((c) => !['auto_reply', 'opt_out'].includes(c))
            ?? classesByOutreach.get(r.id)?.[0]
            ?? null)
          : null,
        humanReply: replySignalsAvailable
          ? (classesByOutreach.get(r.id) ?? []).some((c) => !['auto_reply', 'opt_out'].includes(c))
          : null,
        positiveReply: replySignalsAvailable
          ? (classesByOutreach.get(r.id) ?? []).some((c) => c === 'positive_interest')
          : null,
        rejectionReason: null,
      }))
    },
    warnings,
    [],
  )
}

export interface BatchSummary {
  provider: string
  monthKey: string
  runCount: number
  acceptedCount: number
  duplicateCount: number
  invalidCount: number
  costBand: ReturnType<typeof costBand>
}

export async function readBatchSummary(monthKey: string, warnings: GrowthWarnings): Promise<BatchSummary[]> {
  return safe(
    'prospect_import_batches',
    async () => {
      const { data, error } = await supabaseAdmin
        .from('prospect_import_batches')
        .select('provider,accepted_count,duplicate_count,invalid_count,actual_cost_usd,created_at')
        .gte('created_at', `${monthKey}-01T00:00:00+03:00`)
      if (error) throw error
      const rows = (data ?? []) as {
        provider: string
        accepted_count: number | null
        duplicate_count: number | null
        invalid_count: number | null
        actual_cost_usd: number | null
      }[]
      const byProvider = new Map<string, { n: number; a: number; d: number; i: number; cost: number; anyCost: boolean }>()
      for (const r of rows) {
        const cur = byProvider.get(r.provider) ?? { n: 0, a: 0, d: 0, i: 0, cost: 0, anyCost: false }
        cur.n++
        cur.a += r.accepted_count ?? 0
        cur.d += r.duplicate_count ?? 0
        cur.i += r.invalid_count ?? 0
        if (typeof r.actual_cost_usd === 'number') {
          cur.cost += r.actual_cost_usd
          cur.anyCost = true
        }
        byProvider.set(r.provider, cur)
      }
      return [...byProvider.entries()].map(([provider, v]) => ({
        provider,
        monthKey,
        runCount: v.n,
        acceptedCount: v.a,
        duplicateCount: v.d,
        invalidCount: v.i,
        // Hiç maliyet kaydı yoksa bant `unknown` — `free` DEĞİL.
        costBand: costBand(v.anyCost ? v.cost : null),
      }))
    },
    warnings,
    [],
  )
}

/** Köprüden çıkan gövdede ASLA bulunmaması gereken alan adları. */
export const FORBIDDEN_SNAPSHOT_KEYS = Object.freeze([
  'email', 'phone', 'business_name', 'businessName', 'website', 'address',
  'contact_name', 'contactName', 'notes', 'raw', 'lead_id', 'leadId', 'body', 'subject',
])

/** Yeni bir alan sonradan payload'a PII anahtari sizdirirsa yanit verilmez. */
export function findForbiddenSnapshotKeys(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => findForbiddenSnapshotKeys(item, `${path}[${i}]`))
  if (!value || typeof value !== 'object') return []
  const found: string[] = []
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const next = `${path}.${key}`
    if ((FORBIDDEN_SNAPSHOT_KEYS as readonly string[]).includes(key)) found.push(next)
    found.push(...findForbiddenSnapshotKeys(nested, next))
  }
  return found
}
