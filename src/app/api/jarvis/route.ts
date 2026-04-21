import { NextResponse } from 'next/server'
import { generateResponse, GEMINI_FAST } from '@/lib/gemini'
import { supabase } from '@/lib/supabase'

let cache: { data: any; timestamp: number } | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export async function POST(req: Request) {
  try {
    const { message } = await req.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const lowerMessage = message.toLowerCase()
    let action = null
    let responseText = ''

    if (lowerMessage.includes('tara') || lowerMessage.includes('bul')) {
      action = { type: 'scan', city: 'İstanbul', sector: 'Kuaför' }
      responseText = `Anlaşıldı. İstanbul Beşiktaş bölgesinde Kuaför araması başlatılıyor. Sonuçlar birazdan haritaya düşecektir.`
      return NextResponse.json({ reply: responseText, action })
    }

    if (lowerMessage.includes('pipeline') && lowerMessage.includes('ekle')) {
      action = { type: 'add_to_pipeline', lead_id: 'auto' }
      responseText = `Son bulunan işletmeler pipeline'a YENİ aşamasında eklendi.`
      return NextResponse.json({ reply: responseText, action })
    }

    const now = Date.now()
    let context = cache?.data

    if (!cache || now - cache.timestamp > CACHE_TTL) {
      const [leadsRes, projectsRes] = await Promise.all([
        supabase.from('leads').select('status, priority, potential_score'),
        supabase.from('projects').select('status, monthly_fee, setup_fee')
      ])

      const leads = leadsRes.data || []
      const projects = projectsRes.data || []

      context = {
        total: leads.length,
        new: leads.filter(l => l.status === 'new').length,
        contacted: leads.filter(l => l.status === 'contacted').length,
        won: leads.filter(l => l.status === 'converted').length,
        high_priority: leads.filter(l => l.priority === 'high').length,
        active_projects: projects.filter(p => p.status === 'active').length,
        monthly_revenue: projects
          .filter(p => p.status === 'active')
          .reduce((sum, p) => sum + (p.monthly_fee || 0), 0)
      }

      cache = { data: context, timestamp: now }
    }

    const systemPrompt = `JARVIS — GrafikCem ajans asistanı. Türkçe. Max 3 cümle. Terminal tonu. Veri: Lead:${context.total}(new:${context.new},won:${context.won},high:${context.high_priority}) Proje:${context.active_projects} Gelir:₺${context.monthly_revenue}`

    const aiReply = await generateResponse(message, systemPrompt, GEMINI_FAST)

    return NextResponse.json({ reply: aiReply })

  } catch (error) {
    console.error('JARVIS API Error:', error)
    return NextResponse.json({ reply: '// SİSTEM HATASI: AI modülüne ulaşılamıyor.' }, { status: 500 })
  }
}
