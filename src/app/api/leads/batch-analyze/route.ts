import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { callHeavy } from '@/lib/openrouter'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError
    const { lead_ids } = await req.json()

    if (!lead_ids || !Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json({ error: 'lead_ids is required' }, { status: 400 })
    }

    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, sector, city, has_website, potential_score')
      .in('id', lead_ids.slice(0, 10)) // Max 10

    if (error || !leads || leads.length === 0) {
      return NextResponse.json({ error: 'Leads bulunamadı' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadsText = leads.map((l: any) =>
      `{id: ${l.id}, ad: "${l.business_name}", sektör: "${l.sector}", web: ${l.has_website?'var':'yok'}, skor: ${l.potential_score}}`
    ).join(',\n')

    const systemPrompt = `JSON ARRAY DÖN. Format:
[
  {"id": 123, "analysis": "1 cümle analiz", "pitch": "2 cümle satış mesajı"}
]
Aşağıdaki işletmeleri analiz et:
${leadsText}`

    const aiAnalysisRaw = await callHeavy(systemPrompt, "Analiz et")

    
    let parsedData = []
    try {
      const jsonStr = aiAnalysisRaw.replace(/```json/g, '').replace(/```/g, '')
      parsedData = JSON.parse(jsonStr)
    } catch(e) {
      console.error('Batch JSON Parse Hatası:', e)
      return NextResponse.json({ success: false, error: 'AI format hatası' }, { status: 500 })
    }

    if (!Array.isArray(parsedData)) {
       return NextResponse.json({ success: false, error: 'AI format hatası (Array değil)' }, { status: 500 })
    }

    let updatedCount = 0
    // Update tek tek veya bulk. Bulk zor olabilir Supabase js'de upsert ile. 
    // Basitçe for loop ile update edelim, en fazla 10 adet.
    for (const item of parsedData) {
      if (item.id && item.analysis && item.pitch) {
        const finalAnalysis = `=== ANALİZ ===\n${item.analysis}\n\n=== PITCH ===\n${item.pitch}`
        
        await supabaseAdmin
          .from('leads')
          .update({ ai_analysis: finalAnalysis, updated_at: new Date().toISOString() })
          .eq('id', item.id)
          
        updatedCount++
      }
    }

    return NextResponse.json({ success: true, count: updatedCount })

  } catch (error) {
    console.error('Batch Analyze Error:', error)
    return NextResponse.json({ success: false, error: 'Toplu analiz hatası.' }, { status: 500 })
  }
}
