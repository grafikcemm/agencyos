import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') // sessions, memories, strategy, hypotheses, decisions, counts

    if (type === 'counts') {
      const [sessions, memories, hypotheses, decisions, strategy] = await Promise.all([
        Promise.resolve(supabaseAdmin.from('sessions').select('*', { count: 'exact', head: true })).catch(() => ({ count: 0 })),
        Promise.resolve(supabaseAdmin.from('memories').select('*', { count: 'exact', head: true })).catch(() => ({ count: 0 })),
        Promise.resolve(supabaseAdmin.from('hypotheses').select('*', { count: 'exact', head: true })).catch(() => ({ count: 0 })),
        Promise.resolve(supabaseAdmin.from('decisions').select('*', { count: 'exact', head: true })).catch(() => ({ count: 0 })),
        Promise.resolve(supabaseAdmin.from('strategy').select('*', { count: 'exact', head: true })).catch(() => ({ count: 0 })),
      ])
      return Response.json({
        sessions: (sessions as any).count ?? 0,
        memories: (memories as any).count ?? 0,
        hypotheses: (hypotheses as any).count ?? 0,
        decisions: (decisions as any).count ?? 0,
        strategy: (strategy as any).count ?? 0,
      })
    }

    if (type === 'strategy') {
      const { data, error } = await supabaseAdmin.from('strategy').select('*').order('field')
      if (error) throw error
      return Response.json(data || [])
    }

    if (type === 'sessions') {
      const { data, error } = await supabaseAdmin.from('sessions').select('*').order('created_at', { ascending: false }).limit(20)
      if (error) throw error
      return Response.json(data || [])
    }

    if (type === 'hypotheses') {
      const { data, error } = await supabaseAdmin.from('hypotheses').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return Response.json(data || [])
    }

    if (type === 'decisions') {
      const { data, error } = await supabaseAdmin.from('decisions').select('*').order('made_at', { ascending: false })
      if (error) throw error
      return Response.json(data || [])
    }

    return Response.json({ error: 'type parametresi gerekli' }, { status: 400 })
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { type, ...payload } = body

    if (type === 'strategy') {
      const { field, value } = payload
      const { data, error } = await supabaseAdmin
        .from('strategy')
        .upsert({ field, value, updated_at: new Date().toISOString() }, { onConflict: 'field' })
        .select()
      if (error) throw error
      return Response.json(data)
    }

    if (type === 'session') {
      const { data, error } = await supabaseAdmin.from('sessions').insert({
        summary: payload.summary,
        key_facts: payload.key_facts || [],
      }).select().single()
      if (error) throw error
      return Response.json(data)
    }

    if (type === 'hypothesis') {
      const { data, error } = await supabaseAdmin.from('hypotheses').insert({
        claim: payload.claim,
        status: 'open',
        evidence: [],
      }).select().single()
      if (error) throw error
      return Response.json(data)
    }

    if (type === 'decision') {
      const { data, error } = await supabaseAdmin.from('decisions').insert({
        decision: payload.decision,
        why: payload.why || null,
      }).select().single()
      if (error) throw error
      return Response.json(data)
    }

    if (type === 'hypothesis_update') {
      const { id, status } = payload
      const { data, error } = await supabaseAdmin.from('hypotheses').update({ status }).eq('id', id).select()
      if (error) throw error
      return Response.json(data)
    }

    return Response.json({ error: 'type parametresi gerekli' }, { status: 400 })
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Server error' }, { status: 500 })
  }
}
