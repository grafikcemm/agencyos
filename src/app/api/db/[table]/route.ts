import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Strict whitelist — prevents arbitrary table access via this proxy
const READ_ALLOWED = new Set(['leads', 'follow_ups', 'ai_cost_logs', 'settings', 'projects', 'playbooks'])
const WRITE_ALLOWED = new Set(['leads', 'projects', 'follow_ups'])

function tableGuard(table: string, write = false): NextResponse | null {
  const allowed = write ? WRITE_ALLOWED : READ_ALLOWED
  if (!allowed.has(table)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

export async function GET(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await params
    const guard = tableGuard(table)
    if (guard) return guard

    const { searchParams } = new URL(req.url)

    let query = supabaseAdmin.from(table).select('*')

    const status = searchParams.get('status')
    if (status) query = query.eq('status', status)

    const limit = searchParams.get('limit')
    if (limit) query = query.limit(parseInt(limit))

    const order = searchParams.get('order')
    if (order) query = query.order(order, { ascending: searchParams.get('asc') === 'true' })

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error: any) {
    console.error('API DB GET Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const body = await req.json()
    const { data, error } = await supabaseAdmin.from(table).insert(body).select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { data, error } = await supabaseAdmin.from(table).update(updates).eq('id', id).select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const deleteAll = searchParams.get('all') === 'true'

    if (!id && !deleteAll) {
      return NextResponse.json({ error: 'id or ?all=true required' }, { status: 400 })
    }

    let query = supabaseAdmin.from(table).delete()
    if (id) {
      query = (query as any).eq('id', id)
    } else {
      // Delete all rows — filter on created_at epoch to satisfy Supabase's required-filter rule
      query = (query as any).gte('created_at', '2000-01-01T00:00:00.000Z')
    }

    const { error } = await query
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
