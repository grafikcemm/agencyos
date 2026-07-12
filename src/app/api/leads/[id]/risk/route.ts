// POST /api/leads/[id]/risk — operatör davranışsal risk bayraklarını günceller.
// base_score korunur, yalnız risk yeniden hesaplanır (tam tarama gerekmez):
// potential_score = base_score - risk_score, route yeniden türetilir.
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { rescoreWithRisk, type BehavioralFlags } from '@/lib/leadScoringV3'

const VALID_FLAGS: (keyof BehavioralFlags)[] = [
  'free_sample',
  'no_company_record',
  'payment_term_long',
  'scope_creep',
  'bargaining',
]

function sanitizeFlags(raw: unknown): BehavioralFlags {
  const flags: BehavioralFlags = {}
  if (raw && typeof raw === 'object') {
    for (const key of VALID_FLAGS) {
      if ((raw as Record<string, unknown>)[key] === true) flags[key] = true
    }
  }
  return flags
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const behavioralFlags = sanitizeFlags(body?.behavioral_flags)

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('base_score, potential_score, email, has_real_website')
      .eq('id', id)
      .maybeSingle<{
        base_score: number | null
        potential_score: number | null
        email: string | null
        has_real_website: boolean | null
      }>()
    if (leadErr) throw leadErr
    if (!lead) return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })

    // base_score yoksa (eski kayıt) mevcut potential_score'u taban kabul et.
    const baseScore = lead.base_score ?? lead.potential_score ?? 0

    const result = rescoreWithRisk(baseScore, {
      email: lead.email,
      hasRealWebsite: lead.has_real_website,
      behavioralFlags,
    })

    const { error: updateErr } = await supabaseAdmin
      .from('leads')
      .update({
        behavioral_flags: behavioralFlags,
        risk_score: result.risk_score,
        risk_reasons: result.risk_reasons,
        potential_score: result.potential_score,
        priority: result.priority,
        route: result.route,
      })
      .eq('id', id)
    if (updateErr) throw updateErr

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
