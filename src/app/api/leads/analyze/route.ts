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
    const { lead_id } = await req.json()

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })
    }

    const systemPrompt = `JSON DÖN. {"analysis":"1 cümle analiz","pitch":"2 cümle satış mesajı"}. Ad:${lead.business_name}, Sektör:${lead.sector}, Web:${lead.has_website?'Var':'Yok'}, Skor:${lead.potential_score}`

    const aiAnalysisRaw = await callHeavy(systemPrompt, "Analiz et")

    
    // Basit JSON parse denemesi
    let finalAnalysis = aiAnalysisRaw
    try {
      const parsed = JSON.parse(aiAnalysisRaw.replace(/```json/g, '').replace(/```/g, ''))
      if (parsed.analysis && parsed.pitch) {
        finalAnalysis = `=== ANALİZ ===\n${parsed.analysis}\n\n=== PITCH ===\n${parsed.pitch}`
      }
    } catch(e) {
      // JSON parse başarısız olursa ham metni kullan
    }

    const { error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ ai_analysis: finalAnalysis, updated_at: new Date().toISOString() })
      .eq('id', lead_id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, analysis: finalAnalysis })

  } catch (error) {
    console.error('Analyze Error:', error)
    return NextResponse.json({ success: false, error: 'Analiz hatası.' }, { status: 500 })
  }
}
