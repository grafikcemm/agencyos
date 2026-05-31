import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { callLight } from '@/lib/openrouter'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export async function POST() {
  try {
    // 1. Fetch converted and lost leads
    let leads: any[] = []
    try {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('business_name, sector, city, district, status, rating, review_count, ai_analysis, notes')
        .in('status', ['converted', 'lost'])

      if (!error && data) {
        leads = data
      }
    } catch (e: any) {
      console.error('API Learn: Error fetching leads:', e.message)
    }

    // 2. Fetch council debates
    let debates: any[] = []
    try {
      const { data, error } = await supabaseAdmin
        .from('council_debates')
        .select('topic, status, president_feedback')
        .order('created_at', { ascending: false })
        .limit(20)

      if (!error && data) {
        debates = data
      }
    } catch (e: any) {
      console.error('API Learn: Error fetching debates:', e.message)
    }

    // 3. Fetch current strategy
    let currentStrategy: any[] = []
    try {
      const { data, error } = await supabaseAdmin
        .from('strategy')
        .select('field, value')

      if (!error && data) {
        currentStrategy = data
      }
    } catch (e: any) {
      console.error('API Learn: Error fetching strategy:', e.message)
    }

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

    // 4. Construct user prompt for OpenRouter
    const userPrompt = `
Mevcut Canlı Verilerimiz:

1. CRM KOBİ Müşteri Geri Bildirimleri (Kazanılan/Kaybedilen):
${leads.length === 0 ? '- CRM\'de henüz kazanılan veya kaybedilen lead kaydı bulunmuyor.' : leads.map(l => `- [${l.status.toUpperCase()}] ${l.business_name} (${l.sector || 'Sektör Belirtilmemiş'}, ${l.city || 'Şehir Yok'}) | Puan: ${l.rating || 'Yok'} | Yorum: ${l.review_count || 0} | Ön Analiz: ${l.ai_analysis || 'Yok'}`).join('\n')}

2. Son Konsey Kararları ve Sentezleri:
${debates.length === 0 ? '- Son zamanlarda yapılmış konsey toplantısı bulunmuyor.' : debates.map(d => `- [${d.status.toUpperCase()}] Konu: ${d.topic} | Sentez: ${d.president_feedback || 'Görüş yok'}`).join('\n')}

3. Mevcut Strateji Kartları Durumu:
${currentStrategy.length === 0 ? '- Strateji tablosu şu an boş veya varsayılan değerlerde.' : currentStrategy.map(s => `- ${s.field}: ${JSON.stringify(s.value)}`).join('\n')}
`

    const systemPrompt = `Sen Grafikcem AI Ajansı'nın Baş Strateji Analistisin. Görevin, ajansımızın CRM verilerini (kazanılan/kaybedilen leadler), son yönetim kurulu tartışmalarını ve mevcut strateji durumunu inceleyip sentezleyerek yaşayan strateji belgemizi (strategy tablosu) güncellemektir.

Şu Türkiye KOBİ Stratejik Müfredatını ve hedeflerini temel alarak yaşayan stratejiyi kurgula:
${strategyMuse}

Aşağıdaki verileri analiz et ve ajansımızın 12 temel strateji alanını güncelle. Güncellemeleri yaparken doğrudan gerçek verilerden öğrendiğin şeylere dayanmalı ve her alan için bir kaynak/öğrenim dipnotu (_source_note) üretmelisin.

Giriş Verileri:
- CRM Kazanılan/Kaybedilen Leadler (converted/lost): Hangi sektörlerin ve şehirlerin daha başarılı olduğunu, hangi tekliflerin/mesajların işe yaradığını veya başarısız olduğunu analiz et.
- Konsey Kararları ve Sentezleri: Yönetim kurulu toplantılarında ne kararlar alındı, hangi riskler ve operasyon planları öne çıktı.
- Mevcut Strateji Kartları: Mevcut durumumuz nedir.

Çıktıyı kesinlikle geçerli bir JSON olarak döndür. JSON yapısı tam olarak şu şekilde olmalıdır:
{
  "north_star": { "text": "...", "_source_note": "..." },
  "current_focus": { "text": "...", "_source_note": "..." },
  "audience": { "text": "...", "_source_note": "..." },
  "voice_rules": { "text": "...", "_source_note": "..." },
  "do_list": { "text": "...", "_source_note": "..." },
  "dont_list": { "text": "...", "_source_note": "..." },
  "decisions": { "text": "...", "_source_note": "..." },
  "customer_insights": { "text": "...", "_source_note": "..." },
  "market_signals": { "text": "...", "_source_note": "..." },
  "hypotheses": { "text": "...", "_source_note": "..." },
  "wins": { "text": "...", "_source_note": "..." },
  "open_questions": { "text": "...", "_source_note": "..." }
}

Her alan için text kısmını kısa ve vurucu yaz, listeler için maddeleri \n• ile ayırarak tek bir string olarak yaz. _source_note kısmında ise bu bilginin hangi analizden veya veriden öğrenildiğini belirt (Örn: "Firma Başarısızlık Analizi #3", "Bursa Bölgesi Sinyali", "Konsey Onayı - 12 Mayıs"). Hiçbir açıklama veya markdown kod bloğu (Örn: \`\`\`json) ekleme, sadece JSON objesini döndür.`

    // 5. Call OpenRouter using google/gemini-2.5-flash-lite via callLight
    const aiResponse = await callLight(systemPrompt, userPrompt, 2000)

    let parsedJson: any = null
    try {
      let cleanResponse = aiResponse.trim()
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/```$/, '').trim()
      }
      parsedJson = JSON.parse(cleanResponse)
    } catch (e: any) {
      console.error('API Learn: JSON Parse Error. Raw response was:', aiResponse)
      throw new Error('AI geçerli bir strateji JSON formatı üretmedi.')
    }

    // Validate strategy fields
    const validFields = [
      'north_star', 'current_focus', 'audience', 'voice_rules',
      'do_list', 'dont_list', 'decisions', 'customer_insights',
      'market_signals', 'hypotheses', 'wins', 'open_questions'
    ]

    const upsertRows = Object.entries(parsedJson)
      .filter(([field]) => validFields.includes(field))
      .map(([field, val]: [string, any]) => {
        // Ensure format is { text, _source_note }
        const text = typeof val === 'string' ? val : (val?.text || '')
        const _source_note = val?._source_note || 'Canlı Öğrenme Analizi'
        return {
          field,
          value: { text, _source_note },
          updated_at: new Date().toISOString()
        }
      })

    if (upsertRows.length === 0) {
      throw new Error('Güncellenecek geçerli strateji alanı bulunamadı.')
    }

    // 6. Batch upsert the values back to the strategy table
    const { error: upsertError } = await supabaseAdmin
      .from('strategy')
      .upsert(upsertRows, { onConflict: 'field' })

    if (upsertError) {
      throw upsertError
    }

    return NextResponse.json({
      success: true,
      updated_fields: upsertRows.map(r => r.field)
    })
  } catch (error: any) {
    console.error('API Memory Learn POST Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}