import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiUser } from '@/lib/auth'
import { isAllowedOrder } from '@/lib/db/orderGuard'
import { enforceSameOrigin, sanitizeWriteBody, BadRequestError } from '@/lib/api/guards'
import {
  missingProposalFields,
  proposalGateMessage,
  type DiscoveryFields,
} from '@/lib/leads/pipelineGate'

// Strict whitelist — prevents arbitrary table access via this proxy
const READ_ALLOWED = new Set(['leads', 'person_leads', 'follow_ups', 'ai_cost_logs', 'settings', 'projects', 'playbooks', 'sessions', 'memories', 'strategy', 'hypotheses', 'decisions', 'autoresearch_runs', 'council_debates'])
const WRITE_ALLOWED = new Set(['leads', 'person_leads', 'projects', 'follow_ups', 'sessions', 'memories', 'strategy', 'hypotheses', 'decisions', 'autoresearch_runs', 'playbooks', 'council_debates', 'settings'])

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

// Ham Supabase/PG hata mesajını istemciye sızdırma (şema/iç detay açığa çıkarabilir).
// Detayı server'a logla, istemciye generic mesaj + uygun status dön.
function dbErrorResponse(method: string, error: unknown): NextResponse {
  const err = error as Error
  const timeout = err?.message === 'Supabase timeout'
  const status = timeout ? 504 : 500
  console.error(`API DB ${method} Error (${status}):`, err?.message)
  return NextResponse.json(
    { error: timeout ? 'İstek zaman aşımına uğradı.' : 'Sunucu hatası.' },
    { status },
  )
}

export async function GET(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const { table } = await params
    const guard = tableGuard(table)
    if (guard) return guard

    const { searchParams } = new URL(req.url)

    // person_leads: ham Apollo objesini (raw) cliente sızdırma — açık kolon projeksiyonu.
    const PERSON_LEADS_COLS =
      'id,source,purpose,preset_id,b2b_filter_label,apollo_person_id,full_name,title,seniority,linkedin_url,email,email_status,phone,company_name,company_domain,company_industry,company_size,city,country,difficulty_score,market_score,earning_score,person_score,person_tier,expected_monthly_value_tl,why_now,next_action,status,notes,created_at,updated_at'
    let query = supabaseAdmin.from(table).select(table === 'person_leads' ? PERSON_LEADS_COLS : '*')

    const status = searchParams.get('status')
    if (status) query = query.eq('status', status)

    // Server-side hariç tutma (örn. arşivlenmiş/dismissed leadler haritaya gelmesin).
    const neStatus = searchParams.get('neStatus')
    if (neStatus) query = query.neq('status', neStatus)

    // Pagination: param yoksa bile varsayılan 200 ile sınırla (unbounded fetch'i önle),
    // üst sınır 1000. İstemci daha fazlasını isterse limit param geçer.
    const DEFAULT_LIMIT = 200
    const MAX_LIMIT = 1000
    const limitParam = searchParams.get('limit')
    let limit = DEFAULT_LIMIT
    if (limitParam) {
      const n = parseInt(limitParam, 10)
      if (Number.isInteger(n) && n > 0) limit = Math.min(n, MAX_LIMIT)
    }
    query = query.limit(limit)

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
    return dbErrorResponse('GET', error)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const csrf = enforceSameOrigin(req)
    if (csrf) return csrf

    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const body = sanitizeWriteBody(await req.json())
    const { data, error } = await withTimeout(supabaseAdmin.from(table).insert(body).select())
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return dbErrorResponse('POST', error)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const csrf = enforceSameOrigin(req)
    if (csrf) return csrf

    const { table } = await params
    const guard = tableGuard(table, true)
    if (guard) return guard

    const { id, ...updates } = sanitizeWriteBody(await req.json())
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
    if (error instanceof BadRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return dbErrorResponse('PATCH', error)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ table: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response

    const csrf = enforceSameOrigin(req)
    if (csrf) return csrf

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
    return dbErrorResponse('DELETE', error)
  }
}
