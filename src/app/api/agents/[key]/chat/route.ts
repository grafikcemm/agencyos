// POST /api/agents/[key]/chat
// Single-agent chat. Persists the operator message, builds context from the last
// 10 messages, calls the agent's model, persists the reply, and returns it.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { getAgent, buildAgentSystemPrompt } from '@/lib/agents/registry'
import { callAgentModel } from '@/lib/openrouter'

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params

    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { message } = await req.json()
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ error: 'message gerekli' }, { status: 400 })
    }

    const agent = await getAgent(key)
    if (!agent) {
      return NextResponse.json({ error: 'Ajan bulunamadı: ' + key }, { status: 404 })
    }

    await supabaseAdmin
      .from('agent_messages')
      .insert({ agent_key: key, role: 'operator', content: message })

    const { data: prior } = await supabaseAdmin
      .from('agent_messages')
      .select('role, content')
      .eq('agent_key', key)
      .order('created_at', { ascending: false })
      .limit(10)

    const history = (prior ?? [])
      .reverse()
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n')

    const systemPrompt = buildAgentSystemPrompt(agent)
    const userPrompt = history ? `${history}\n\noperator: ${message}` : message

    const { content, tokensIn, tokensOut } = await callAgentModel({
      model: agent.model,
      agentKey: key,
      systemPrompt,
      userPrompt,
    })

    await supabaseAdmin
      .from('agent_messages')
      .insert({ agent_key: key, role: 'agent', content, metadata: { tokensIn, tokensOut } })

    return NextResponse.json({ reply: content, tokensIn, tokensOut })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('Agent chat error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
