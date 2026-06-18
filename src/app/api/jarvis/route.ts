import { callWithOperation, JarvisTool, ToolCall } from '@/lib/openrouter'
import { supabaseAdmin } from '@/lib/supabase'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { requireApiAccess } from '@/lib/auth'
import { getKnowledgeDoc, getKnowledgeDocs } from '@/lib/knowledge'
import { z } from 'zod'

// --- Tool argument validation (LLM tool-call güvenliği) ---
// Tool şemasındaki enum'lar model'e verilen TALİMAT'tır; runtime zorlama DEĞİL.
// Model yanlış/enjekte argüman üretirse service-role mutasyonlarına ham gider.
// Aşağıdaki şemalar destructive/para/status değiştiren tool'ları runtime'da doğrular.
const LEAD_STAGES = ['new', 'contacted', 'responded', 'meeting', 'proposal', 'converted', 'lost'] as const

const TOOL_ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  update_lead_stage: z.object({
    lead_id: z.string().min(1),
    stage: z.enum(LEAD_STAGES),
  }),
  create_project: z.object({
    lead_id: z.string().min(1),
    title: z.string().min(1).max(200),
    revenue_tl: z.number().min(0).max(10_000_000).optional(),
  }),
}

// --- Knowledge injection ---

async function buildSystemPrompt(contextData: string): Promise<string> {
  const docs = await getKnowledgeDocs([
    '00_GRAFIKCEM_CONTEXT.md',
    'PRICING_RULES.md',
    'BUSINESS_MODEL.md',
  ])
  const profile = docs['00_GRAFIKCEM_CONTEXT.md'] ?? ''
  const pricing = docs['PRICING_RULES.md'] ?? ''
  const business = docs['BUSINESS_MODEL.md'] ?? ''

  return `Sen JARVIS'sin — Ali Cem Bozma'nın kişisel iş geliştirme asistanısın.
Türkçe konuş. Yanıtların kısa (max 3 cümle) ve doğrudan olsun.
Hiçbir şeyi otomatik gönderme — mail, teklif veya DM için her zaman açık onay iste.

--- KİŞİSEL BAĞLAM ---
${profile}

--- FİYATLANDIRMA KURALLARI ---
${pricing}

--- İŞ MODELİ ---
${business}

--- GÜNCEL VERİ ---
${contextData}

--- ARAÇ SEÇİM KURALLARI (ZORUNLU) ---
Kullanıcının niyetine göre MUTLAKA doğru aracı çağır. Tahmin etme, aracı çalıştır:
- "bugün kimi arayayım", "aranacak lead", "call list" → daily_call_list
- "en kaliteli", "en iyi lead", "nokta atışı", "A tier", "en hızlı paraya dönecek" → get_quality_leads
- "hangi sektör", "ne tarayayım", "sektör fırsatı" → get_sector_opportunities
- "pitch yaz", "arama açılışı", "ilk 30 saniye" (işletme ismi ile) → generate_call_pitch_by_name
- "neden para verir", "neden satın alır", "neden dönüşür" (işletme ismi ile) → explain_conversion_by_name
- "analiz et", "isimden lead bul" (işletme ismi ile) → find_lead_by_name
- "kalitesizleri ele", "düşük kalite", "elenecekler" → disqualify_low_quality
- "tara", "bul", "[ilçe]'de [sektör] tara" → scan_leads
- "fırsat durumu", "ürün pipeline", "opportunity status" → get_opportunity_status
- "yeni sinyal", "trend var mı", "sinyal raporu" → get_trend_signals
- "türkiye fırsatı", "türkiye açığı", "yerel fırsat" → get_turkey_gaps
- "dönüşüm durumu", "huni", "funnel", "kaç lead kazandık", "dönüşüm oranı" → get_funnel_metrics

ÖNEMLİ KURAL — FIRSAT SORULARINDA:
Her yeni fikir veya trend sunarken yanıtının sonunda mutlaka şu notu ekle:
"🚫 Şimdilik park et / aktif sprint'e alma — mevcut aktif ürüne odaklan."
Yeni sinyal ancak mevcut aktif ürünlerden birine bağlanıyorsa aksiyona dönüşebilir.

Araç sonucu döndüğünde kısa, satış odaklı özetle. Veri uydurma — her zaman aracı çağır.`
}

// --- Tool definitions ---

const JARVIS_TOOLS: JarvisTool[] = [
  {
    type: 'function',
    function: {
      name: 'scan_leads',
      description: 'Google Maps üzerinde belirli sektör, şehir ve ilçede lead taraması yapar',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Şehir (örn: İstanbul)' },
          district: { type: 'string', description: 'İlçe (örn: Beşiktaş)' },
          niche: { type: 'string', description: 'Sektör/niş (örn: güzellik salonu, kafe)' },
          limit: { type: 'number', description: 'Maksimum sonuç sayısı (varsayılan: 15)' }
        },
        required: ['city', 'niche']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_lead',
      description: 'Belirli bir lead\'i derinlemesine analiz eder',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' }
        },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_briefing',
      description: 'Asistan için WhatsApp\'a gönderilecek müşteri brief raporu oluşturur',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' }
        },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'draft_email',
      description: 'Belirli bir lead için soğuk email taslağı hazırlar (göndermez, sadece taslak)',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          tone: { type: 'string', enum: ['formal', 'casual'] }
        },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'draft_proposal',
      description: 'Müşteri için detaylı hizmet teklifi hazırlar — göndermez, onay gerektirir',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          services: { type: 'array', items: { type: 'string' } }
        },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_lead_stage',
      description: 'Lead durumunu günceller',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          stage: { type: 'string', enum: ['new', 'contacted', 'responded', 'meeting', 'proposal', 'converted', 'lost'] }
        },
        required: ['lead_id', 'stage']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_pitch',
      description: 'Seçili hizmet paketine göre lead için pitch metni üretir',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          service_id: { type: 'string', description: 'Playbook/servis ID (opsiyonel)' }
        },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description: 'Yeni proje oluşturur — müşteriye dönüşen lead için',
      parameters: {
        type: 'object',
        properties: {
          lead_id: { type: 'string' },
          title: { type: 'string' },
          revenue_tl: { type: 'number' }
        },
        required: ['lead_id', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wrap_session',
      description: 'Mevcut oturumu kaydeder — sessions tablosuna ve knowledge dosyasına yazar',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string' }
        },
        required: ['summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_quality_leads',
      description: 'En yüksek kaliteli (quality_score) ve dönüşüm olasılıklı lead\'leri getirir',
      parameters: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['A', 'B', 'C', 'D'], description: 'Lead tier filtresi (default: A)' },
          limit: { type: 'number' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_sector_opportunities',
      description: 'Bugün hangi sektörleri taramalıyız? En iyi fırsat sektörlerini döner',
      parameters: { type: 'object', properties: { limit: { type: 'number' } }, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_call_pitch',
      description: 'Belirli bir lead için 30 saniyelik telefon açılışı yazar',
      parameters: {
        type: 'object',
        properties: { lead_id: { type: 'string' } },
        required: ['lead_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'disqualify_low_quality',
      description: 'Düşük kaliteli (tier D veya disqualified) lead\'leri listele',
      parameters: { type: 'object', properties: { limit: { type: 'number' } }, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'daily_call_list',
      description: 'Bugün aranacak en iyi lead\'leri DB\'den getirir, skor ve neden-şimdi bilgisiyle sıralar',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Kaç lead (varsayılan: 10)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'build_carousel_brief',
      description: 'Instagram carousel içerik brief\'i oluşturur',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          slides: { type: 'number' }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'build_visual_prompt',
      description: 'AI görsel üretimi için detaylı prompt oluşturur',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          style: { type: 'string' }
        },
        required: ['description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_lead_by_name',
      description: 'İşletme ismiyle (fuzzy search) veritabanında lead araması yapar ve bilgileri döner',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Müşteri/İşletme adı' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_call_pitch_by_name',
      description: 'Müşteri ismiyle veritabanından bulup 30 saniyelik telefon açılış konuşması üretir',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Müşteri/İşletme adı' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'explain_conversion_by_name',
      description: 'Müşteri ismiyle veritabanından bulup neden satın almaya ikna olacağını açıklar',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Müşteri/İşletme adı' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_opportunity_status',
      description: 'Ürün pipeline durumunu getirir — aktif, sıradaki, kuluçka ve park edilmiş fırsatlar',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_trend_signals',
      description: 'Son 7 gündeki yüksek puanlı trend sinyallerini getirir',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Kaç sinyal (varsayılan: 10)' } },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_turkey_gaps',
      description: 'Türkiye fırsat açığı haritasını gösterir — global servislerin Türkiye\'de olmadığı alanlar',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_funnel_metrics',
      description: 'Dönüşüm hunisi raporu — durum/tier dağılımı, sektör bazlı iletişim ve dönüşüm oranları, tarama verimi',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  }
]

interface SearchMatchedLead {
  id: string
  business_name: string
  quality_score: number | null
  sector: string | null
  city: string | null
  district: string | null
  first_30_seconds_pitch: string | null
  why_this_will_convert: string | null
  conversion_angle: string | null
  quality_label: string | null
  phone: string | null
  website: string | null
  rating: number | null
  potential_score: number | null
  expected_monthly_value_tl: number | null
  expected_offer_value_tl: number | null
}

// Fuzzy name-based lead search helper for pre-routing and name tools
async function findLeadByNameHelper(name: string): Promise<{ lead: SearchMatchedLead; multipleMatches: string[] | null } | null> {
  if (!name) return null
  const cleanName = name.trim()

  // Try direct ilike
  let { data: leads } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, quality_score, sector, city, district, first_30_seconds_pitch, why_this_will_convert, conversion_angle, quality_label, phone, website, rating, potential_score, expected_monthly_value_tl, expected_offer_value_tl')
    .ilike('business_name', `%${cleanName}%`)

  // If no leads found, try splitting the query by spaces to make it fuzzy
  if ((!leads || leads.length === 0) && cleanName.length > 2) {
    const parts = cleanName.split(/\s+/).filter(p => p.length >= 3)
    if (parts.length > 0) {
      const orConditions = parts.map(p => `business_name.ilike.%${p}%`).join(',')
      const { data: fuzzyLeads } = await supabaseAdmin
        .from('leads')
        .select('id, business_name, quality_score, sector, city, district, first_30_seconds_pitch, why_this_will_convert, conversion_angle, quality_label, phone, website, rating, potential_score, expected_monthly_value_tl, expected_offer_value_tl')
        .or(orConditions)
      leads = fuzzyLeads
    }
  }

  if (!leads || leads.length === 0) return null

  // Sort by quality_score desc or potential_score desc, and pick the highest
  leads.sort((a: SearchMatchedLead, b: SearchMatchedLead) => {
    const aScore = a.quality_score ?? a.potential_score ?? 0
    const bScore = b.quality_score ?? b.potential_score ?? 0
    return bScore - aScore
  })

  return {
    lead: leads[0],
    multipleMatches: leads.length > 1 ? leads.slice(1).map((l: SearchMatchedLead) => l.business_name) : null
  }
}

// --- Tool executors ---

async function executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  // Runtime arg doğrulaması — sensitive tool'lar için enum/bound zorlaması.
  const argSchema = TOOL_ARG_SCHEMAS[toolName]
  if (argSchema) {
    const parsed = argSchema.safeParse(args)
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      return `Geçersiz araç argümanı (${toolName}): ${detail}`
    }
    args = parsed.data as Record<string, unknown>
  }

  switch (toolName) {
    case 'find_lead_by_name': {
      const name = args.name as string
      const match = await findLeadByNameHelper(name)
      if (!match) return `"${name}" isminde bir müşteri bulunamadı.`
      const { lead, multipleMatches } = match
      let reply = `🔍 Eşleşen Müşteri: ${lead.business_name} (ID: ${lead.id})\n`
      reply += `Sektör: ${lead.sector} | Şehir/İlçe: ${lead.city}${lead.district ? '/' + lead.district : ''}\n`
      reply += `Kalite Skoru: ${lead.quality_score ?? 0} (${lead.quality_label ?? 'Zayıf'})\n`
      reply += `Telefon: ${lead.phone ?? 'YOK'} | Web: ${lead.website ?? 'YOK'}\n`
      if (multipleMatches && multipleMatches.length > 0) {
        reply += `⚠️ Not: Birden fazla eşleşme bulundu, en yüksek kaliteli olan seçildi. Diğerleri: ${multipleMatches.slice(0, 3).join(', ')}\n`
      }
      return reply
    }

    case 'generate_call_pitch_by_name': {
      const name = args.name as string
      const match = await findLeadByNameHelper(name)
      if (!match) return `"${name}" isminde bir müşteri bulunamadı.`
      const { lead, multipleMatches } = match
      let reply = ''
      if (multipleMatches && multipleMatches.length > 0) {
        reply += `⚠️ Not: Birden fazla eşleşme bulundu. En yüksek kaliteli olan "${lead.business_name}" seçildi.\n\n`
      }
      if (lead.first_30_seconds_pitch) {
        reply += `📞 30 SANİYE AÇILIŞ — ${lead.business_name} (${lead.quality_label ?? 'A-Tier'}):\n\n"${lead.first_30_seconds_pitch}"\n\n🎯 İkna Açısı: ${lead.conversion_angle ?? 'Dijital Dönüşüm'}`
      } else {
        reply += `${lead.business_name} için telefon açılış konuşması henüz hesaplanmamış. Lütfen backfill çalıştırın.`
      }
      return reply
    }

    case 'explain_conversion_by_name': {
      const name = args.name as string
      const match = await findLeadByNameHelper(name)
      if (!match) return `"${name}" isminde bir müşteri bulunamadı.`
      const { lead, multipleMatches } = match
      let reply = ''
      if (multipleMatches && multipleMatches.length > 0) {
        reply += `⚠️ Not: Birden fazla eşleşme bulundu. En yüksek kaliteli olan "${lead.business_name}" seçildi.\n\n`
      }
      if (lead.why_this_will_convert) {
        reply += `🎯 SATIN ALMA & İKNA ANALİZİ — ${lead.business_name}:\n\n`
        reply += `Neden Satın Alır: ${lead.why_this_will_convert}\n\n`
        reply += `İkna Açısı: ${lead.conversion_angle ?? 'Belirtilmemiş'}\n`
        reply += `Telefon: ${lead.phone ?? 'YOK'} | Web: ${lead.website ?? 'YOK'}\n`
      } else {
        reply += `${lead.business_name} için satın alma analizi henüz hesaplanmamış. Lütfen backfill çalıştırın.`
      }
      return reply
    }
    case 'scan_leads': {
      const niche = args.niche as string
      const city = args.city as string
      const district = args.district as string | undefined
      const limit = (args.limit as number) ?? 15
      try {
        // Direct in-process call — no server-to-self HTTP fetch, so no
        // NEXT_PUBLIC_APP_URL/CRON_SECRET dependency to silently break.
        const { scanLeads } = await import('@/lib/leads/scan')
        const result = await scanLeads({ sector: niche, city, district: district ?? '', limit, source: 'jarvis' })
        if (!result.success) {
          return `Tarama başarısız: ${result.error ?? 'bilinmeyen hata'}${result.message ? ` (${result.message})` : ''}`
        }
        if (result.message) return result.message
        return `${result.insertedCount} yeni lead eklendi, ${result.updatedCount} mevcut lead güncellendi. (${niche}, ${city}${district ? ' / ' + district : ''})`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'bilinmeyen hata'
        console.error('JARVIS scan_leads error:', msg)
        return `Tarama servisi hata verdi: ${msg}`
      }
    }

    case 'get_quality_leads': {
      const tier = (args.tier as string) ?? 'A'
      const limit = (args.limit as number) ?? 8
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, business_name, sector, city, district, phone, quality_score, conversion_probability, lead_tier, quality_label, why_this_will_convert, first_30_seconds_pitch, expected_monthly_value_tl, status')
        .eq('lead_tier', tier)
        .is('disqualification_reason', null)
        .in('status', ['new', 'contacted'])
        .order('quality_score', { ascending: false })
        .limit(limit)
      if (!leads || leads.length === 0) return `${tier}-tier kaliteli lead bulunamadı. Backfill çalıştır veya tarama yap.`
      const lines = (leads as Record<string, unknown>[]).map((l, i) =>
        `${i + 1}. ${l.business_name} (${l.sector}, ${l.city}${l.district ? '/' + l.district : ''}) — Kalite: ${l.quality_score} | Dönüşüm: %${l.conversion_probability} | ${l.quality_label} | ₺${l.expected_monthly_value_tl}/ay`
      )
      return `${tier}-tier ${leads.length} lead:\n\n${lines.join('\n')}\n\nDetay için işletme ismiyle "pitch yaz" veya "analiz et" komutunu kullanın (örn: "Klinik+1 için pitch yaz").`
    }

    case 'get_sector_opportunities': {
      const limit = (args.limit as number) ?? 5
      const { getSectorOpportunities } = await import('@/lib/sectorOpportunityEngine')
      const sectors = getSectorOpportunities(limit)
      const lines = sectors.map((s, i) =>
        `${i + 1}. ${s.displayName} (skor: ${s.sector_opportunity_score}) — ${s.reason_to_target_now}\n   Tarama sorgusu: "${s.recommended_scan_queries[0]}" | En iyi teklif: ${s.best_offer}`
      )
      return `Bugün taranacak top ${sectors.length} sektör:\n\n${lines.join('\n\n')}`
    }

    case 'generate_call_pitch': {
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('business_name, sector, first_30_seconds_pitch, why_this_will_convert, conversion_angle, quality_label')
        .eq('id', args.lead_id as string)
        .single()
      if (!lead) return 'Lead bulunamadı.'
      const l = lead as Record<string, unknown>
      return l.first_30_seconds_pitch
        ? `📞 30 SANİYE AÇILIŞ — ${l.business_name} (${l.quality_label}):\n\n${l.first_30_seconds_pitch}\n\n🎯 Açı: ${l.conversion_angle}`
        : `${l.business_name} için pitch verisi henüz hesaplanmamış. Backfill çalıştır.`
    }

    case 'disqualify_low_quality': {
      const limit = (args.limit as number) ?? 10
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, business_name, sector, disqualification_reason, quality_score')
        .or('lead_tier.eq.D,disqualification_reason.not.is.null')
        .order('quality_score', { ascending: true })
        .limit(limit)
      if (!leads || leads.length === 0) return 'Elenecek düşük kaliteli lead yok.'
      const lines = (leads as Record<string, unknown>[]).map((l, i) =>
        `${i + 1}. ${l.business_name} — ${l.disqualification_reason ?? 'Düşük kalite'} (skor: ${l.quality_score})`
      )
      return `${leads.length} düşük kaliteli lead:\n\n${lines.join('\n')}`
    }

    case 'daily_call_list': {
      const limit = (args.limit as number) ?? 50
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, business_name, sector, city, district, phone, quality_score, potential_score, priority, why_now, recommended_offer_name, first_message, status, lead_tier, next_action_priority, has_website, has_whatsapp, has_online_booking, has_form, rating, review_count, expected_monthly_value_tl, why_this_will_convert')
        .in('status', ['new', 'contacted'])
        .is('disqualification_reason', null)
        .order('quality_score', { ascending: false })
        .limit(limit)

      if (!leads || leads.length === 0) return 'Bugün için uygun lead bulunamadı. Önce bir tarama yap.'

      // Filter: Group 1 -> A-tier + call_now
      const aTierCallNow = leads.filter(l => l.lead_tier === 'A' && l.next_action_priority === 'call_now')
      // Filter: Group 2 -> B-tier
      const bTierSendAudit = leads.filter(l => l.lead_tier === 'B')

      let reply = ''

      if (aTierCallNow.length > 0) {
        reply += `📞 BUGÜN ARA (A-Tier)\n`
        reply += aTierCallNow.map((l, i) => {
          const ratingStr = l.rating !== null && l.rating !== undefined ? `⭐ ${l.rating} (${l.review_count || 0} yorum)` : '⭐ Google yok'
          const valStr = l.expected_monthly_value_tl ? `₺${l.expected_monthly_value_tl}/ay LTV` : 'LTV belirsiz'
          return `${i + 1}. **${l.business_name}** (${l.sector}, ${l.city}/${l.district || ''})
   - **Skor/Değer:** ${l.quality_score} Puan | ${valStr} | ${ratingStr}
   - **Neden Dönüşür:** ${l.why_this_will_convert || l.why_now || 'A-Tier güçlü aday.'}`
        }).join('\n\n')
      } else {
        reply += `📞 BUGÜN ARA (A-Tier)\nBugün aranacak acil A-Tier lead bulunmuyor.`
      }

      reply += `\n\n----------------------------------------\n\n`

      if (bTierSendAudit.length > 0) {
        reply += `📋 MİNİ AUDİT GÖNDERİLECEKLER (B-Tier)\n`
        reply += bTierSendAudit.slice(0, 10).map((l, i) => {
          const ratingStr = l.rating !== null && l.rating !== undefined ? `⭐ ${l.rating} (${l.review_count || 0} yorum)` : '⭐ Google yok'
          const valStr = l.expected_monthly_value_tl ? `₺${l.expected_monthly_value_tl}/ay LTV` : 'LTV belirsiz'
          return `${i + 1}. **${l.business_name}** (${l.sector}, ${l.city}/${l.district || ''})
   - **Skor/Değer:** ${l.quality_score} Puan | ${valStr} | ${ratingStr}
   - **Neden Dönüşür:** ${l.why_this_will_convert || l.why_now || 'B-Tier takip adayı.'}`
        }).join('\n\n')
        if (bTierSendAudit.length > 10) {
          reply += `\n\n...ve ${bTierSendAudit.length - 10} adet daha B-Tier müşteri adayı.`
        }
      } else {
        reply += `📋 MİNİ AUDİT GÖNDERİLECEKLER (B-Tier)\nTakipte B-Tier lead bulunmuyor.`
      }

      reply += `\n\n💡 Detaylı analiz yapmak veya ilk pitch taslağını oluşturmak için işletme ismiyle doğrudan komut verebilirsin (örn: "Klinik+1 için pitch yaz" veya "Hafize Topal için analiz yap").`
      return reply
    }

    case 'analyze_lead': {
      const { data: lead } = await supabaseAdmin
        .from('leads').select('*').eq('id', args.lead_id as string).single()
      if (!lead) return 'Lead bulunamadı.'
      const { content } = await callWithOperation(
        'analyze_lead',
        'Bir lead\'i analiz et. Eksikliklerini, potansiyelini ve önerilen hizmeti belirt. Türkçe, kısa.',
        `İşletme: ${lead.business_name}\nSektör: ${lead.sector}\nŞehir: ${lead.city}\nWeb: ${lead.website ?? 'YOK'}\nTelefon: ${lead.phone ?? 'YOK'}\nPuan: ${lead.potential_score}`
      )
      return content
    }

    case 'generate_briefing': {
      const { data: lead } = await supabaseAdmin
        .from('leads').select('*').eq('id', args.lead_id as string).single()
      if (!lead) return 'Lead bulunamadı.'
      const pricing = await getKnowledgeDoc('PRICING_RULES.md')
      const { content } = await callWithOperation(
        'generate_briefing',
        `Asistan için WhatsApp brief raporu oluştur. Şu başlıkları içermeli:
1. Kim bu işletme? (2 cümle)
2. Ne eksikliği var? (bullet list)
3. Konuşma açısı
4. Sorulacak 3 soru
5. Önerilen paket ve tahmini değer
Fiyatlandırma: ${pricing.slice(0, 400)}
Türkçe yaz.`,
        `İşletme: ${lead.business_name}\nSektör: ${lead.sector}\nŞehir: ${lead.city}\nWeb: ${lead.website ?? 'YOK'}\nTelefon: ${lead.phone}\nPuan: ${lead.potential_score}`
      )
      return content
    }

    case 'draft_email': {
      const { data: lead } = await supabaseAdmin
        .from('leads').select('*').eq('id', args.lead_id as string).single()
      if (!lead) return 'Lead bulunamadı.'
      const tone = (args.tone as string) ?? 'casual'
      const { content } = await callWithOperation(
        'draft_email',
        `Soğuk email taslağı yaz. Ton: ${tone}. Max 5 paragraf. GrafikCem'den yazıldığı belli olsun. BU SADECE TASLAK — otomatik gönderilmez. Türkçe.`,
        `İşletme: ${lead.business_name}\nSektör: ${lead.sector}\nWeb: ${lead.website ? 'var' : 'yok'}`
      )
      return `📧 EMAIL TASLAĞI (onay gerekli):\n\n${content}\n\n⚠️ Göndermek için "onayla" veya "gönder" yazın.`
    }

    case 'draft_proposal': {
      const { data: lead } = await supabaseAdmin
        .from('leads').select('*').eq('id', args.lead_id as string).single()
      if (!lead) return 'Lead bulunamadı.'
      const pricing = await getKnowledgeDoc('PRICING_RULES.md')
      const services = (args.services as string[]) ?? []
      const { content } = await callWithOperation(
        'draft_proposal',
        `Müşteri teklifi hazırla. Fiyatlandırma: ${pricing.slice(0, 600)}. UYARI: Otomatik gönderilmez, onay gerekir. Türkçe.`,
        `İşletme: ${lead.business_name}\nHizmetler: ${services.join(', ') || 'belirlenmemiş'}\nSektör: ${lead.sector}`,
        2000
      )
      return `📋 TEKLİF TASLAĞI\n⚠️ Göndermek için "onayla" yazın\n\n${content}`
    }

    case 'update_lead_stage': {
      const stage = args.stage as string
      const { error } = await supabaseAdmin
        .from('leads').update({ status: stage }).eq('id', args.lead_id as string)
      if (error) return `Güncelleme başarısız: ${error.message}`

      // Outcome timestamp — kapalı döngü dönüşüm metriği (migration 012).
      // Kolon henüz yoksa ana güncellemeyi bozma.
      const STAGE_TIMESTAMPS: Record<string, string> = {
        contacted: 'contacted_at',
        responded: 'replied_at',
        meeting: 'meeting_at',
        proposal: 'proposal_at',
        converted: 'converted_at',
        lost: 'lost_at',
      }
      const tsColumn = STAGE_TIMESTAMPS[stage]
      if (tsColumn) {
        const { error: tsError } = await supabaseAdmin
          .from('leads').update({ [tsColumn]: new Date().toISOString() }).eq('id', args.lead_id as string)
        if (tsError) console.warn(`Outcome timestamp (${tsColumn}) yazılamadı:`, tsError.message)
      }
      return `Lead durumu "${stage}" yapıldı.`
    }

    case 'generate_pitch': {
      const { data: lead } = await supabaseAdmin
        .from('leads').select('*').eq('id', args.lead_id as string).single()
      if (!lead) return 'Lead bulunamadı.'

      let serviceInfo = ''
      if (args.service_id) {
        const { data: playbook } = await supabaseAdmin
          .from('playbooks').select('*').eq('id', args.service_id as string).single()
        if (playbook) {
          serviceInfo = `\nPaket: ${playbook.name}\nKurulum: ₺${playbook.setup_fee}\nAylık: ₺${playbook.monthly_fee}\nAçıklama: ${playbook.description}`
        }
      }

      const pricing = await getKnowledgeDoc('PRICING_RULES.md')
      const { content } = await callWithOperation(
        'generate_briefing',
        `Müşteriye özel pitch metni yaz. Kısa, ikna edici, Türkçe. Telefon veya WhatsApp üzerinden gönderilebilecek formatta.${serviceInfo}\nFiyatlandırma: ${pricing.slice(0, 400)}`,
        `İşletme: ${lead.business_name}\nSektör: ${lead.sector}\nŞehir: ${lead.city}\nWeb: ${lead.website ?? 'YOK'}`
      )
      return `💬 PİTCH TASLAĞI (onay gerekli):\n\n${content}\n\n⚠️ Göndermek için "onayla" yazın.`
    }

    case 'create_project': {
      const { data: lead } = await supabaseAdmin
        .from('leads').select('business_name').eq('id', args.lead_id as string).single()
      const businessName = lead?.business_name ?? (args.title as string)

      const { error } = await supabaseAdmin.from('projects').insert({
        lead_id: args.lead_id as string,
        business_name: businessName,
        status: 'active',
        setup_fee: 0,
        monthly_fee: (args.revenue_tl as number) ?? 0,
        currency: 'TRY',
        notes: `JARVIS tarafından oluşturuldu: ${args.title as string}`,
        start_date: new Date().toISOString().split('T')[0],
      })

      if (error) return `Proje oluşturulamadı: ${error.message}`

      // Also update lead status to converted
      await supabaseAdmin.from('leads').update({ status: 'converted' }).eq('id', args.lead_id as string)

      return `✅ Proje oluşturuldu: "${args.title}" (₺${(args.revenue_tl as number) ?? 0}/ay). Lead "kazanıldı" olarak güncellendi.`
    }

    case 'wrap_session': {
      try {
        const summary = args.summary as string
        const date = new Date().toISOString().split('T')[0]

        // Write to knowledge/sessions/ file
        const sessionsDir = join(process.cwd(), 'knowledge', 'sessions')
        mkdirSync(sessionsDir, { recursive: true })
        const filePath = join(sessionsDir, `${date}_session.md`)
        writeFileSync(filePath, `# Oturum: ${date}\n\n${summary}\n`)

        // Also write to sessions DB table
        try {
          await supabaseAdmin.from('sessions').insert({
            summary,
            key_facts: [],
          })
        } catch {
          // Table might not exist yet, that's ok
        }

        return `Oturum kaydedildi: knowledge/sessions/${date}_session.md`
      } catch {
        return 'Oturum kaydedilemedi.'
      }
    }

    case 'build_carousel_brief': {
      const slides = (args.slides as number) ?? 5
      const { content } = await callWithOperation(
        'build_carousel_brief',
        `Instagram carousel brief oluştur. ${slides} slide. Her slide: başlık + 2-3 bullet. Hook ile başla, CTA ile bitir. Türkçe.`,
        `Konu: ${args.topic as string}`
      )
      return content
    }

    case 'build_visual_prompt': {
      const { content } = await callWithOperation(
        'build_visual_prompt',
        'AI görsel üretimi için detaylı prompt oluştur. İngilizce. Stil, ışık, kompozisyon, renk belirt.',
        `Tanım: ${args.description as string}\nStil: ${(args.style as string) ?? 'minimalist'}`
      )
      return content
    }

    case 'get_opportunity_status': {
      const { data: products } = await supabaseAdmin
        .from('opportunity_products')
        .select('id, title, category, action_tier, priority_order, status, score_total, price_range')
        .eq('is_active', true)
        .order('priority_order', { ascending: true })

      if (!products || products.length === 0) return 'Henüz ürün pipeline\'ı kurulmamış. npm run opportunity:seed çalıştır.'

      const tiers: Record<string, typeof products> = { launch_now: [], next_bet: [], incubate: [], park: [] }
      for (const p of products) {
        if (tiers[p.action_tier]) tiers[p.action_tier].push(p)
      }

      let reply = '🎯 ÜRÜN PİPELINE DURUMU\n\n'
      const tierLabels: Record<string, string> = { launch_now: '🚀 AKTİF SPRİNT', next_bet: '⏭️ SIRADAKİ', incubate: '🥚 KULUÇKA', park: '🅿️ PARK' }

      for (const [tier, label] of Object.entries(tierLabels)) {
        const items = tiers[tier] ?? []
        reply += `${label} (${items.length})\n`
        if (items.length > 0) {
          for (const p of items) {
            reply += `  • ${p.title} — Skor: ${p.score_total} | Fiyat: ${p.price_range ?? '?'} | Durum: ${p.status}\n`
          }
        } else {
          reply += '  (boş)\n'
        }
        reply += '\n'
      }

      reply += '🚫 Şimdilik park et / aktif sprint\'e alma — mevcut aktif ürüne odaklan.'
      return reply
    }

    case 'get_trend_signals': {
      const limit = (args.limit as number) ?? 10
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data: signals } = await supabaseAdmin
        .from('opportunity_trend_signals')
        .select('id, source, title, summary, confidence_score, linked_product_id, status, collected_at')
        .gte('collected_at', sevenDaysAgo)
        .gte('confidence_score', 30)
        .order('confidence_score', { ascending: false })
        .limit(limit)

      if (!signals || signals.length === 0) return 'Son 7 günde kayda değer trend sinyali yok. Mevcut ürünlere odaklan.\n\n🚫 Şimdilik park et / aktif sprint\'e alma.'

      const { data: products } = await supabaseAdmin
        .from('opportunity_products')
        .select('id, title')
        .eq('is_active', true)

      const productMap = new Map((products ?? []).map(p => [p.id, p.title]))

      let reply = `📡 SON 7 GÜN TREND SİNYALLERİ (${signals.length} adet)\n\n`
      for (const [i, s] of signals.entries()) {
        const linkedName = s.linked_product_id ? productMap.get(s.linked_product_id) : null
        reply += `${i + 1}. [${s.source}] ${s.title}\n`
        reply += `   Güven: ${s.confidence_score}/100 | Durum: ${s.status}`
        if (linkedName) reply += ` | → ${linkedName}`
        reply += '\n'
      }

      reply += '\n🚫 Şimdilik park et / aktif sprint\'e alma — mevcut aktif ürüne odaklan.'
      return reply
    }

    case 'get_funnel_metrics': {
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('status, lead_tier, normalized_sector, sector')
        .limit(2000)
      if (!leads || leads.length === 0) return 'Henüz lead verisi yok — önce tarama yap.'

      const statusCounts: Record<string, number> = {}
      const tierCounts: Record<string, number> = {}
      const bySector: Record<string, { total: number; contacted: number; converted: number }> = {}
      for (const l of leads as Array<{ status: string; lead_tier: string | null; normalized_sector: string | null; sector: string | null }>) {
        statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1
        tierCounts[l.lead_tier ?? '—'] = (tierCounts[l.lead_tier ?? '—'] ?? 0) + 1
        const key = l.normalized_sector || l.sector || 'Diğer'
        bySector[key] ??= { total: 0, contacted: 0, converted: 0 }
        bySector[key].total++
        if (['contacted', 'responded', 'meeting', 'proposal', 'converted'].includes(l.status)) bySector[key].contacted++
        if (l.status === 'converted') bySector[key].converted++
      }

      let reply = `📊 DÖNÜŞÜM HUNİSİ (${leads.length} lead)\n\n`
      reply += `Durumlar: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(' | ')}\n`
      reply += `Tier: ${Object.entries(tierCounts).map(([k, v]) => `${k}: ${v}`).join(' | ')}\n\n`
      reply += 'Sektör bazında (toplam → iletişim → kazanılan):\n'
      reply += Object.entries(bySector)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 8)
        .map(([s, v]) => `• ${s}: ${v.total} → ${v.contacted} → ${v.converted}`)
        .join('\n')
      return reply
    }

    case 'get_turkey_gaps': {
      const { TURKEY_GAP_ANALYSIS } = await import('@/lib/opportunityIntelligenceEngine')

      let reply = '🇹🇷 TÜRKİYE FIRSAT AÇIĞI HARİTASI\n\n'
      for (const gap of TURKEY_GAP_ANALYSIS) {
        const potLabel = gap.potential === 'high' ? '🔥 Yüksek' : gap.potential === 'medium' ? '⚡ Orta' : '💤 Düşük'
        const diffLabel = gap.difficulty === 'high' ? '❌ Zor' : gap.difficulty === 'medium' ? '⚠️ Orta' : '✅ Kolay'
        reply += `• ${gap.area} (${gap.global_equivalent})\n`
        reply += `  Potansiyel: ${potLabel} | Zorluk: ${diffLabel}\n`
        reply += `  ${gap.why}\n\n`
      }

      reply += '🚫 Bu açıklar referans içindir. Aktif sprint dışında yeni ürün başlatma.'
      return reply
    }

    default:
      return `Bilinmeyen araç: ${toolName}`
  }
}

// --- Context data for system prompt ---

async function getContextData(): Promise<string> {
  try {
    const [leadsRes, projectsRes] = await Promise.all([
      supabaseAdmin.from('leads').select('status, priority').limit(500),
      supabaseAdmin.from('projects').select('status, monthly_fee').limit(100)
    ])
    const leads = leadsRes.data ?? []
    const projects = projectsRes.data ?? []
    const monthlyRevenue = projects
      .filter((p: { status: string; monthly_fee: number }) => p.status === 'active')
      .reduce((sum: number, p: { status: string; monthly_fee: number }) => sum + (p.monthly_fee ?? 0), 0)
    return `Leadler: ${leads.length} toplam | ${leads.filter((l: { status: string }) => l.status === 'new').length} yeni | ${leads.filter((l: { priority: string }) => l.priority === 'high').length} yüksek öncelikli
Projeler: ${projects.filter((p: { status: string }) => p.status === 'active').length} aktif | Aylık gelir: ₺${monthlyRevenue}`
  } catch {
    return 'Veri yüklenemedi.'
  }
}

// --- Route handler ---

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const { message } = await req.json()
    if (!message) return Response.json({ error: 'message gerekli' }, { status: 400 })

    const msgLower = message.toLowerCase().trim()

    // Deterministic Pre-Router for opportunity intelligence keywords
    const isOpportunityStatusMatch = 
      msgLower.includes('fırsat durumu') || 
      msgLower.includes('ürün pipeline') || 
      msgLower.includes('opportunity status') ||
      msgLower.includes('icraat') ||
      msgLower.includes('fırsat') ||
      msgLower.includes('ürün') ||
      msgLower.includes('prompt kitapçığı') ||
      msgLower.includes('agent paketi') ||
      msgLower.includes('bugün ne yapayım') ||
      msgLower.includes('bugün icraat tarafında ne yapayım')

    if (isOpportunityStatusMatch) {
      const result = await executeTool('get_opportunity_status', {})
      return Response.json({
        reply: result,
        actions: [{ type: 'get_opportunity_status', args: {} }],
        tool_calls: ['get_opportunity_status'],
        tool_count: 1
      })
    }

    const isTrendSignalsMatch =
      msgLower.includes('yeni sinyal') || 
      msgLower.includes('trend var mı') || 
      msgLower.includes('sinyal raporu') || 
      msgLower.includes('trend raporu') ||
      msgLower.includes('trend') ||
      msgLower.includes('beni dağıtacak fikir')

    if (isTrendSignalsMatch) {
      const result = await executeTool('get_trend_signals', { limit: 10 })
      return Response.json({
        reply: result,
        actions: [{ type: 'get_trend_signals', args: { limit: 10 } }],
        tool_calls: ['get_trend_signals'],
        tool_count: 1
      })
    }

    if (msgLower.includes('türkiye fırsatı') || msgLower.includes('türkiye açığı') || msgLower.includes('yerel fırsat')) {
      const result = await executeTool('get_turkey_gaps', {})
      return Response.json({
        reply: result,
        actions: [{ type: 'get_turkey_gaps', args: {} }],
        tool_calls: ['get_turkey_gaps'],
        tool_count: 1
      })
    }

    // Deterministic Pre-Router for "mini audit" keywords
    if (msgLower.includes('mini audit') || msgLower.includes('audit hazırlanacak')) {
      const { data: bLeads } = await supabaseAdmin
        .from('leads')
        .select('id, business_name, sector, city, district, quality_score, expected_monthly_value_tl')
        .eq('lead_tier', 'B')
        .is('disqualification_reason', null)
        .in('status', ['new', 'contacted'])
        .order('quality_score', { ascending: false })

      const { data: aLeads } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('lead_tier', 'A')
        .eq('next_action_priority', 'call_now')
        .is('disqualification_reason', null)
        .in('status', ['new', 'contacted'])

      const aCount = aLeads ? aLeads.length : 0

      if (bLeads && bLeads.length > 0) {
        const lines = bLeads.map((l, i) => {
          const valStr = l.expected_monthly_value_tl ? `₺${l.expected_monthly_value_tl}/ay LTV` : 'LTV belirsiz'
          return `${i + 1}. **${l.business_name}** (${l.sector || 'Sektör Belirsiz'}, ${l.city || ''}/${l.district || ''}) — Skor: ${l.quality_score} | ${valStr}`
        })
        const reply = `📋 Bugün mini audit gönderilecek ${bLeads.length} adet B-Tier müşteri adayı var:\n\n${lines.join('\n')}`
        return Response.json({
          reply,
          actions: [{ type: 'daily_call_list', args: {} }],
          tool_calls: ['daily_call_list'],
          tool_count: 1
        })
      } else {
        const reply = `Bugün mini audit hazırlanacak lead yok; bugün ${aCount} arama var.`
        return Response.json({
          reply,
          actions: [],
          tool_calls: [],
          tool_count: 0
        })
      }
    }

    // Deterministic Pre-Router: intercept name-based intents immediately
    // 1. Pitch matching (e.g., "Klinik+1 için pitch yaz", "pitch yaz Klinik+1")
    const pitchMatch = msgLower.match(/(.+?)\s+(?:için\s+)?pitch\s+yaz/i) || 
                       msgLower.match(/pitch\s+yaz\s+(?:için\s+)?(.+)/i) ||
                       msgLower.match(/(.+?)\s+için\s+açılış\s+yaz/i) ||
                       msgLower.match(/pitch\s+(.+)/i)
    if (pitchMatch) {
      const targetName = pitchMatch[1].replace(/için/gi, '').trim()
      if (targetName && targetName !== 'yaz') {
        const result = await executeTool('generate_call_pitch_by_name', { name: targetName })
        return Response.json({
          reply: result,
          actions: [{ type: 'generate_call_pitch_by_name', args: { name: targetName } }],
          tool_calls: ['generate_call_pitch_by_name'],
          tool_count: 1
        })
      }
    }

    // 2. Conversion explanation matching (e.g., "Moye neden para verir?", "Moye neden dönüşür?")
    const convMatch = msgLower.match(/(.+?)\s+neden\s+para\s+verir/i) ||
                      msgLower.match(/(.+?)\s+neden\s+dönüşür/i) ||
                      msgLower.match(/(.+?)\s+neden\s+satın\s+alır/i)
    if (convMatch) {
      const targetName = convMatch[1].trim()
      if (targetName) {
        const result = await executeTool('explain_conversion_by_name', { name: targetName })
        return Response.json({
          reply: result,
          actions: [{ type: 'explain_conversion_by_name', args: { name: targetName } }],
          tool_calls: ['explain_conversion_by_name'],
          tool_count: 1
        })
      }
    }

    // 3. Analysis matching (e.g., "Hafize Topal için analiz yap", "Hafize Topal analiz et")
    const analysisMatch = msgLower.match(/(.+?)\s+analiz\s+et/i) ||
                          msgLower.match(/(.+?)\s+için\s+analiz\s+yap/i) ||
                          msgLower.match(/(.+?)\s+analizini\s+yap/i)
    if (analysisMatch) {
      const targetName = analysisMatch[1].replace(/için/gi, '').trim()
      if (targetName) {
        const result = await executeTool('find_lead_by_name', { name: targetName })
        return Response.json({
          reply: result,
          actions: [{ type: 'find_lead_by_name', args: { name: targetName } }],
          tool_calls: ['find_lead_by_name'],
          tool_count: 1
        })
      }
    }

    const contextData = await getContextData()
    const systemPrompt = await buildSystemPrompt(contextData)

    const { content, toolCalls } = await callWithOperation(
      'jarvis_chat',
      systemPrompt,
      message,
      1500,
      JARVIS_TOOLS
    )

    if (toolCalls && toolCalls.length > 0) {
      const toolResults: string[] = []
      const actions: { type: string; args: Record<string, unknown> }[] = []
      const executedTools: string[] = []

      const rawResults: string[] = []
      for (const tc of toolCalls as ToolCall[]) {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        const result = await executeTool(tc.function.name, args)
        rawResults.push(result)
        toolResults.push(`[${tc.function.name}]: ${result}`)
        actions.push({ type: tc.function.name, args })
        executedTools.push(tc.function.name)
      }

      // Action-list tools: return the structured tool output directly.
      // A second LLM pass compresses these lists and drops business names —
      // the operator needs the full list, not a summary.
      const directRenderTools = new Set(['daily_call_list', 'get_quality_leads', 'scan_leads', 'disqualify_low_quality', 'get_funnel_metrics'])
      if (executedTools.some((name) => directRenderTools.has(name))) {
        return Response.json({
          reply: rawResults.join('\n\n'),
          actions,
          tool_calls: executedTools,
          tool_count: executedTools.length,
        })
      }

      const { content: finalReply } = await callWithOperation(
        'jarvis_chat',
        systemPrompt,
        `Kullanıcı: "${message}"\n\nAraç sonuçları:\n${toolResults.join('\n')}\n\nBu sonuçları kullanarak kısa, net bir yanıt ver.`,
        800
      )

      if (!finalReply) {
        console.error('JARVIS final reply empty after tool calls:', executedTools.join(','))
      }

      return Response.json({
        reply: finalReply || toolResults.join('\n'),
        actions,
        tool_calls: executedTools,
        tool_count: executedTools.length,
      })
    }

    if (!content) {
      console.error('JARVIS empty completion (no tool calls) for message:', String(message).slice(0, 120))
    }

    return Response.json({
      reply: content || 'Yanıt üretilemedi — lütfen komutu tekrar gönderin.',
      tool_calls: [],
      tool_count: 0,
      retryable: !content,
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('JARVIS v3 error:', msg)
    return Response.json({ reply: `// SİSTEM HATASI: ${msg}` }, { status: 500 })
  }
}
