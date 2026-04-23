import { NextResponse } from 'next/server'
import { generateResponse, GEMINI_STANDARD } from '@/lib/gemini'
import { supabaseAdmin } from '@/lib/supabase'

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
        supabaseAdmin.from('leads').select('status, priority, potential_score'),
        supabaseAdmin.from('projects').select('status, monthly_fee, setup_fee')
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

    const systemPrompt = `Sen JARVIS'sin, GrafikCem ajans asistanısın. Türkçe konuş. Yanıtların kısa (max 3 cümle), profesyonel ve terminal tonunda olsun. 
Veri Özeti:
- Toplam Lead: ${context.total} (Yeni: ${context.new}, Kazanıldı: ${context.won})
- Yüksek Öncelikli: ${context.high_priority}
- Aktif Proje: ${context.active_projects}
- Aylık Gelir: ₺${context.monthly_revenue}

Kullanıcıya yardımcı ol ve gerekirse tarama (scan) komutu önermeyi unutma.

GRAFİK TASARIM HİZMETLERİ:
Logo & Marka Kimliği (3.000-12.000₺)
Sosyal Medya Yönetimi (8.000₺/ay)
Web Sitesi Tasarımı (15.000₺ + 2.000₺/ay)
AI Görsel Üretimi (5.000₺/ay)
Kurumsal Kimlik Paketi (12.000₺)
Ambalaj & Etiket (5.000₺)
Sosyal Medya Şablonları (3.500₺)

EN DEĞERLI LEAD PROFİLİ:
- Güzellik salonu / kuaför / kafe / butik
- Web sitesi YOK veya çok eski
- Instagram aktif değil (son 3+ ayda paylaşım yok)
- Telefon numarası VAR
- Şehir merkezi veya işlek ilçede

Bu lead'i bulunca JARVIS şöyle analiz etsin:
"Bu işletmenin web sitesi yok, telefonu var. Sosyal medya şablonu + logo paketi için ideal müşteri profili. Tahmini proje değeri: 8.000-15.000₺"
`

    const aiReply = await generateResponse(message, systemPrompt, GEMINI_STANDARD)

    return NextResponse.json({ reply: aiReply })

  } catch (error) {
    console.error('JARVIS API Error:', error)
    return NextResponse.json({ reply: '// SİSTEM HATASI: AI modülüne ulaşılamıyor.' }, { status: 500 })
  }
}
