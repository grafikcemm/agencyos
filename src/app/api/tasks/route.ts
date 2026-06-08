// GET /api/tasks
// Returns the agent task queue. Supports optional ?status= and ?limit= filters
// (default limit 100), ordered newest first.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 100

    let query = supabaseAdmin
      .from('agent_tasks')
      .select('id, directive_id, agent_key, title, status, tokens_in, tokens_out, error, created_at, started_at, finished_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ tasks: data ?? [] })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('Tasks queue error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
