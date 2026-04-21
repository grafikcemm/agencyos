import { NextResponse } from 'next/server'
import { generateResponse, GEMINI_STANDARD } from '@/lib/gemini'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { lead_id } = await req.json()

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })
    }

    const systemPrompt = `JSON DÖN. {"analysis":"1 cümle analiz","pitch":"2 cümle satış mesajı"}. Ad:${lead.business_name}, Sektör:${lead.sector}, Web:${lead.has_website?'Var':'Yok'}, Skor:${lead.potential_score}`

    const aiAnalysisRaw = await generateResponse("Analiz et", systemPrompt, GEMINI_STANDARD)
    
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

    const { error: updateError } = await supabase
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
