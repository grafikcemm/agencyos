import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiUser } from '@/lib/auth'
import { isAllowedOrder } from '@/lib/db/orderGuard'
import {
  missingProposalFields,
  proposalGateMessage,
  type DiscoveryFields,
} from '@/lib/leads/pipelineGate'

// Strict whitelist — prevents arbitrary table access via this proxy
const READ_ALLOWED = new Set(['leads', 'follow_ups', 'ai_cost_logs', 'settings', 'projects', 'playbooks', 'sessions', 'memories', 'strategy', 'hypotheses', 'decisions', 'autoresearch_runs', 'council_debates'])
const WRITE_ALLOWED = new Set(['leads', 'projects', 'follow_ups', 'sessions', 'memories', 'strategy', 'hypotheses', 'decisions', 'autoresearch_runs', 'playbooks', 'council_debates', 'settings'])

const TIMEOUT_MS = 5000

function tableGuard(table: string, write = false): NextResponse | null {
  const allowed = write ? WRITE_ALLOWED : READ_ALLOWED
  if (!allowed.has(table)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withTimeout(promise: PromiseLike<any>, ms: number = TIMEOUT_MS): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Supabase timeout')), ms)
    Promise.resolve(promise).then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const { table } = await params
    const guard = tableGuard(table)
    if (guard) return guard

    const { searchParams } = new URL(req.url)

    let query = supabaseAdmin.from(table).select('*')

    const status = searchParams.get('status')
    if (status) query = query.eq('status', status)

    const limit = searchParams.get('limit')
    if (limit) {
      const n = parseInt(limit, 10)
      if (Number.isInteger(n) && n > 0) query = query.limit(Math.min(n, 1000))
    }

    const order = searchParams.get('order')
    if (order) {
      if (!isAllowedOrder(table, order)) {
        return NextResponse.json({ error: `Invalid order column: ${order}` }, { status: 400 })
      }
      query = query.order(order, { ascending: searchParams.get('asc') === 'true' })
    }

    const { data, error } = await withTimeout(query)
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error: unknown) {
    const err = error as Error
    const status = err?.message === 'Supabase timeout' ? 504 : 500
    console.error(`API DB GET Error (${status}):`, err?.message)
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const body = await req.json()
    const { data, error } = await withTimeout(supabaseAdmin.from(table).insert(body).select())
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    const err = error as Error
    const status = err?.message === 'Supabase timeout' ? 504 : 500
    console.error(`API DB POST Error (${status}):`, err?.message)
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Pipeline gatekeeper: leads → 'proposal' geçişi için discovery alanları zorunlu.
    // Eksik alanlar updates'te yoksa mevcut kayıttan tamamlanır (merge).
    if (table === 'leads' && updates.status === 'proposal') {
      const { data: existing } = await withTimeout(
        supabaseAdmin.from('leads').select('pain_point, decision_maker, budget_band').eq('id', id).maybeSingle(),
      )
      const merged: DiscoveryFields = {
        pain_point: updates.pain_point ?? existing?.pain_point,
        decision_maker: updates.decision_maker ?? existing?.decision_maker,
        budget_band: updates.budget_band ?? existing?.budget_band,
      }
      const missing = missingProposalFields(merged)
      if (missing.length > 0) {
        return NextResponse.json(
          { error: proposalGateMessage(missing), gate: 'proposal', missing },
          { status: 422 },
        )
      }
    }

    const { data, error } = await withTimeout(supabaseAdmin.from(table).update(updates).eq('id', id).select())
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    const err = error as Error
    const status = err?.message === 'Supabase timeout' ? 504 : 500
    console.error(`API DB PATCH Error (${status}):`, err?.message)
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await withTimeout(supabaseAdmin.from(table).delete().eq('id', id))
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const err = error as Error
    const status = err?.message === 'Supabase timeout' ? 504 : 500
    console.error(`API DB DELETE Error (${status}):`, err?.message)
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status })
  }
}
