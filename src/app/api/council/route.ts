import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callLight } from '@/lib/openrouter'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('council_debates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist yet, return empty list with fallback flag
        return NextResponse.json({ debates: [], fallback: true })
      }
      throw error
    }

    // Map DB column names to what the frontend client expects
    const mapped = (data || []).map((d: any) => ({
      ...d,
      strategy_feedback: d.strategy_feedback || d.strategy_opinion || '',
      risk_feedback: d.risk_feedback || d.risk_opinion || '',
      operations_feedback: d.operations_feedback || d.operations_opinion || '',
      growth_feedback: d.growth_feedback || d.growth_opinion || '',
      president_feedback: d.president_feedback || d.president_synthesis || '',
    }))

    return NextResponse.json({ debates: mapped, fallback: false })
  } catch (error: any) {
    console.error('API Council GET Error:', error.message)
    return NextResponse.json({ error: error.message, debates: [], fallback: true })
  }
}

export async function POST(req: Request) {
  try {
    const { topic, context = '', leadId } = await req.json()

    if (!topic) {
      return NextResponse.json({ error: 'Konu başlığı zorunludur' }, { status: 400 })
    }

    let enrichedContext = context
    let leadDetails: any = null

    // Load KOBI strategic curriculum
    let strategyMuse = ''
    try {
      const musePath = join(process.cwd(), 'knowledge', 'TURKEY_STRATEGY_MUSE.md')
      if (existsSync(musePath)) {
        strategyMuse = readFileSync(musePath, 'utf-8')
      }
    } catch (e) {
      console.error('Failed to load TURKEY_STRATEGY_MUSE:', e)
    }

    // If leadId is provided, fetch lead details from DB to enrich the context
    if (leadId) {
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single()

      if (!leadError && lead) {
        leadDetails = lead
        enrichedContext += `\n\nHedef KOBİ Detayları:\n`
        enrichedContext += `- Firma Adı: ${lead.business_name}\n`
        if (lead.sector) enrichedContext += `- Sektör: ${lead.sector}\n`
        if (lead.city) enrichedContext += `- Lokasyon: ${lead.city} / ${lead.district || ''}\n`
        if (lead.phone) enrichedContext += `- Telefon: ${lead.phone}\n`
        if (lead.website) enrichedContext += `- Web Sitesi: ${lead.website} (${lead.has_website ? 'Mevcut' : 'Yok'})\n`
        if (lead.rating !== null) enrichedContext += `- Google Puanı: ${lead.rating} (${lead.review_count || 0} yorum)\n`
        if (lead.potential_score) enrichedContext += `- Potansiyel Puanı: ${lead.potential_score}/100\n`
        if (lead.ai_analysis) enrichedContext += `- Ön Analiz Notu: ${lead.ai_analysis}\n`
      }
    }

    const userPrompt = `Tartışılacak Konu / Durum:\n${topic}\n\nArka Plan Bağlamı:\n${enrichedContext}`

    // 1. Trigger the 4 parallel department agents with KOBI strategy muse injected
    const strategyPrompt = `Sen Grafikcem ajansının Strateji Direktörü'sün. Görevin, hedeflenen KOBİ lead'i veya sunulan ciro konusu için en yüksek getiriyi (ROI) sağlayacak fiyatlandırma, konumlandırma ve teklif stratejisini üretmektir. 
Şu Türkiye KOBİ Stratejik Müfredatını ve verilerini temel alarak karar ver:
${strategyMuse}

Görüş bildirirken, 6 ana ürünleştirilmiş gelir kategorisinden hangisinin (Randevu Asistanı, Yenileme Otomasyonu, Teklif Masası vb.) bu sektöre en yüksek değeri üreteceğini belirt. Çözüm odaklı, ROI ve değer vurgusu yapan, 2-3 kısa paragraftan oluşan Türkçe bir görüş bildir. Markdown formatı kullanabilirsin.`
    
    const riskPrompt = `Sen Grafikcem ajansının Risk & Uyum Direktörü'sün. Görevin, teklif edilen KOBİ entegrasyonu için gizlilik, veri güvenliği, yasal uyumluluk (e-Fatura, e-Defter uyumu vb.) ve SLA (hizmet kalitesi sözleşmesi) risklerini belirlemektir.
Şu Türkiye KOBİ Stratejik Müfredatını temel alarak riskleri ve operasyonel kırılganlıkları göz önünde bulundur:
${strategyMuse}

Gerçekçi, temkinli, SLA odaklı ve önce güvenlik/veri koruma prensibiyle, 2-3 kısa paragraftan oluşan Türkçe bir risk raporu oluştur. Markdown formatı kullanabilirsin.`
    
    const opsPrompt = `Sen Grafikcem ajansının Operasyon Şefi'sin. Görevin, projenin teslimat takvimini, entegrasyon gereksinimlerini ve operasyonel checklist adımlarını kurgulamaktır. 
Şu Türkiye KOBİ Stratejik Müfredatındaki ürün modellerini (Belge toplama, OCR okuma, randevu entegrasyonu, veri akışları vb.) temel alarak planlama yap:
${strategyMuse}

Son derece planlı, checklist'çi ve teslimat odaklı bir yaklaşımla, projenin adım adım hayata geçiş planını içeren 2-3 kısa paragraftan oluşan Türkçe bir operasyon görüşü oluştur. Markdown formatı kullanabilirsin.`
    
    const growthPrompt = `Sen Grafikcem ajansının Büyüme Direktörü'sün. Görevin, hedeflenen KOBİ veya konu için outbound pazarlama kanallarını, DM veya e-posta şablonlarını ve sıcak referans / müşteri kazanım taktiklerini üretmektir.
Şu Türkiye KOBİ Stratejik Müfredatını ve taktiklerini temel alarak plan oluştur:
${strategyMuse}

ÖNEMLİ: Sloganlarında ve şablonlarında 'AI otomasyon' gibi genel söylemler yerine outcome-based (Örn: 'Klinik Randevu Kurtarma', 'Sigorta Yenileme Motoru') dilleri kullan. Coğrafi önceliklendirme ve dalga sektörlerini gözet. İletişim odaklı, DM/E-posta örnekleri sunan, 2-3 kısa paragraftan oluşan Türkçe bir büyüme planı oluştur. Markdown formatı kullanabilirsin.`

    const [strategyFeedback, riskFeedback, opsFeedback, growthFeedback] = await Promise.all([
      callLight(strategyPrompt, userPrompt),
      callLight(riskPrompt, userPrompt),
      callLight(opsPrompt, userPrompt),
      callLight(growthPrompt, userPrompt),
    ])

    // 2. Synthesize with the Chairman / President agent to produce a structured JSON decision
    const presidentPrompt = `Sen Grafikcem ajansının Yönetim Kurulu Başkanı'sın. Görevin; Strateji, Risk, Operasyon ve Büyüme departmanlarının sunduğu görüşleri inceleyip sentezlemek, gerçekçilik kontrolü yapmak ve ajansın nihai menfaatini gözeterek karar odaklı bir konsensüs raporu oluşturmaktır.

Şu Türkiye KOBİ Stratejik Müfredatını ve hedeflerini temel al:
${strategyMuse}

Departman Görüşleri:
- Strateji Görüşü: ${strategyFeedback}
- Risk & Uyum Görüşü: ${riskFeedback}
- Operasyon Görüşü: ${opsFeedback}
- Büyüme Görüşü: ${growthFeedback}

Görevin, bu verileri sentezleyerek NİHAİ YAPILANDIRILMIŞ KARARIN JSON formatında bir çıktısını üretmektir.
Yanıtın SADECE ve SADECE aşağıdaki JSON formatında olmalıdır. Markdown veya süslü kod blokları (html, json) ekleme, sadece saf JSON string döndür. JSON geçerli ve tam olmalıdır.

JSON Şeması:
{
  "verdict": "continue" | "pause" | "reject" | "needs_more_data",
  "confidence": <0-100 arası sayısal değer>,
  "recommendedAction": "<Yapılması önerilen en kritik ilk eylem>",
  "risks": [
    "<Belirlenen 1. risk veya teknik engel>",
    "<Belirlenen 2. risk veya teknik engel>"
  ],
  "requiredData": [
    "<Karar için gereken veya eksik olan 1. veri>",
    "<Karar için gereken veya eksik olan 2. veri>"
  ],
  "nextSteps": [
    "<Atılması gereken 1. adım>",
    "<Atılması gereken 2. adım>"
  ],
  "chairmanOpinion": "<Kurulun fikirlerini harmanlayan, net karara bağlayan, Türkiye KOBİ pazarı makro/mikro verilerine uygun Türkçe nihai sentez raporu (2-3 kısa paragraf)>"
}`

    const presidentFeedback = await callLight(presidentPrompt, userPrompt)

    // Save payload mapped to database column alternatives
    const primaryPayload = {
      topic,
      lead_id: leadId || null,
      strategy_opinion: strategyFeedback,
      risk_opinion: riskFeedback,
      operations_opinion: opsFeedback,
      growth_opinion: growthFeedback,
      president_synthesis: presidentFeedback,
      status: 'pending',
      created_at: new Date().toISOString()
    }

    const fallbackPayload = {
      topic,
      lead_id: leadId || null,
      strategy_feedback: strategyFeedback,
      risk_feedback: riskFeedback,
      operations_feedback: opsFeedback,
      growth_feedback: growthFeedback,
      president_feedback: presidentFeedback,
      status: 'pending',
      created_at: new Date().toISOString()
    }

    let dbSaved = false
    let debateId = Math.random().toString(36).substring(2, 9)

    try {
      // Try primary insert (with migrations structure)
      const { data, error } = await supabaseAdmin
        .from('council_debates')
        .insert(primaryPayload)
        .select()
        .single()

      if (!error && data) {
        debateId = data.id
        dbSaved = true
      } else {
        // Try fallback insert (with backward compatibility structure)
        const { data: fbData, error: fbError } = await supabaseAdmin
          .from('council_debates')
          .insert(fallbackPayload)
          .select()
          .single()

        if (!fbError && fbData) {
          debateId = fbData.id
          dbSaved = true
        } else {
          console.error('API Council DB Insert Error:', error?.message || fbError?.message)
        }
      }
    } catch (e: any) {
      console.error('API Council DB Save Catch Error:', e.message)
    }

    return NextResponse.json({
      success: true,
      id: debateId,
      topic,
      lead_id: leadId || null,
      strategy_feedback: strategyFeedback,
      risk_feedback: riskFeedback,
      operations_feedback: opsFeedback,
      growth_feedback: growthFeedback,
      president_feedback: presidentFeedback,
      status: 'pending',
      created_at: new Date().toISOString(),
      fallback: !dbSaved
    })
  } catch (error: any) {
    console.error('API Council POST Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { id, status, outcome, leadId } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })
    }

    let dbUpdated = false
    let updatedRow: any = null

    // First try fetching existing row to merge outcome into JSON president field
    try {
      const { data: existing } = await supabaseAdmin
        .from('council_debates')
        .select('*')
        .eq('id', id)
        .single()

      if (existing) {
        const synthField = existing.president_synthesis ? 'president_synthesis' : 'president_feedback'
        const synthStr = existing[synthField] || ''
        
        let synthJson: any = {}
        try {
          synthJson = JSON.parse(synthStr)
        } catch {
          // If not json, convert text to schema
          synthJson = { chairmanOpinion: synthStr }
        }

        if (outcome !== undefined) {
          synthJson.outcome = outcome
        }

        const updates: any = {}
        if (status !== undefined) {
          updates.status = status
        }
        updates[synthField] = JSON.stringify(synthJson)

        const { data, error } = await supabaseAdmin
          .from('council_debates')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (!error && data) {
          dbUpdated = true
          updatedRow = {
            ...data,
            strategy_feedback: data.strategy_feedback || data.strategy_opinion || '',
            risk_feedback: data.risk_feedback || data.risk_opinion || '',
            operations_feedback: data.operations_feedback || data.operations_opinion || '',
            growth_feedback: data.growth_feedback || data.growth_opinion || '',
            president_feedback: data.president_feedback || data.president_synthesis || '',
          }
        }
      }
    } catch (e) {
      console.error('PATCH DB merge error:', e)
    }

    // Fallback updates in case advanced mapping was unfeasible
    if (!dbUpdated && status !== undefined) {
      try {
        const { error } = await supabaseAdmin
          .from('council_debates')
          .update({ status })
          .eq('id', id)
        if (!error) dbUpdated = true
      } catch (e) {
        console.error('Simple status PATCH error:', e)
      }
    }

    // If status is 'approved' and leadId is provided, upgrade the lead's status to 'contacted'
    if (status === 'approved' && leadId) {
      try {
        await supabaseAdmin
          .from('leads')
          .update({ status: 'contacted' })
          .eq('id', leadId)
      } catch (e) {
        console.error('Failed to update lead status from council:', e)
      }
    }

    return NextResponse.json({ success: true, updated: dbUpdated, data: updatedRow })
  } catch (error: any) {
    console.error('API Council PATCH Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

