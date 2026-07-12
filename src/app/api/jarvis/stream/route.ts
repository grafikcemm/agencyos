import { getRouteForOperation } from '@/lib/openrouter'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { getKnowledgeDoc } from '@/lib/knowledge'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const BASE_URL = 'https://openrouter.ai/api/v1'

async function getContextData(): Promise<string> {
  try {
    const [leadsRes, projectsRes] = await Promise.all([
      supabaseAdmin.from('leads').select('status, priority').limit(500),
      supabaseAdmin.from('projects').select('status, monthly_fee').limit(100)
    ])
    const leads = leadsRes.data ?? []
    const projects = projectsRes.data ?? []
    const monthlyRevenue = projects
      .filter((p: any) => p.status === 'active')
      .reduce((sum: number, p: any) => sum + (p.monthly_fee ?? 0), 0)
    return `Leadler: ${leads.length} toplam | Projeler: ${projects.filter((p: any) => p.status === 'active').length} aktif | Aylık: ₺${monthlyRevenue}`
  } catch {
    return 'Veri yüklenemedi.'
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError
    const { message } = await req.json()
    if (!message) return Response.json({ error: 'message gerekli' }, { status: 400 })
    if (!OPENROUTER_API_KEY) return Response.json({ error: 'API key eksik' }, { status: 500 })

    const contextData = await getContextData()
    const profile = await getKnowledgeDoc('00_GRAFIKCEM_CONTEXT.md')
    // Preset route: models[] self-heal — primary ölse bile OpenRouter fallback'e geçer.
    const route = getRouteForOperation('jarvis_chat')

    const systemPrompt = `Sen JARVIS'sin — Ali Cem Bozma'nın kişisel asistanısın. Türkçe, kısa yanıtlar ver.
Hiçbir şeyi otomatik gönderme — mail, teklif veya DM için her zaman onay iste.
${profile.slice(0, 500)}
${contextData}`

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://grafikcem.agency',
        'X-Title': 'Grafikcem Agency OS'
      },
      body: JSON.stringify({
        model: route.models[0],
        ...(route.models.length > 1 ? { models: route.models, provider: { allow_fallbacks: true } } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7,
        stream: true
      })
    })

    if (!response.ok) {
      const err = await response.json()
      return Response.json({ error: err.error?.message || 'API error' }, { status: 500 })
    }

    // Stream SSE back to client
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                continue
              }

              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`))
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: msg }, { status: 500 })
  }
}
