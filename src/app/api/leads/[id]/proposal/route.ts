// GET /api/leads/[id]/proposal — lead'in bütçe bandı + risk skoruna göre 3 kademeli
// teklif (anchoring) + itiraz-cevap kütüphanesi + ikna tetikleyicileri. Hepsi salt-okunur
// üretim; operatör tekliflendirmede kullanır. Gönderim yok.
// POST — KALICI teklif taslağı (Sprint-3 Faz 5.1): proposalService → mig 061
// canlıysa tek-transaction RPC; şema yoksa açık schemaMissing (409). Gönderim yolu YOK.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess, requireApiUser } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { buildProposal } from '@/lib/proposalGenerator'
import { OBJECTION_LIBRARY } from '@/lib/objectionLibrary'
import { selectPersuasionTriggers } from '@/lib/persuasionTriggers'
import { createProposalDraft } from '@/lib/proposals/proposalService'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select('budget_band, risk_score, proof_points')
      .eq('id', id)
      .maybeSingle<{ budget_band: string | null; risk_score: number | null; proof_points: string[] | null }>()
    if (error) throw error
    if (!lead) return NextResponse.json({ error: 'Lead bulunamadı' }, { status: 404 })

    const proposal = buildProposal({ budgetBand: lead.budget_band, riskScore: lead.risk_score })
    const persuasion = selectPersuasionTriggers({
      hasSectorProof: (lead.proof_points?.length ?? 0) > 0,
      limitedCapacity: true,
    })

    return NextResponse.json({
      success: true,
      proposal,
      objections: OBJECTION_LIBRARY,
      persuasion,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

const CreateSchema = z.object({ offerIds: z.array(z.string().min(1)).min(1).max(6) }).strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })
    const body = await parseJsonBody(req, CreateSchema)

    const result = await createProposalDraft({ leadId: id, offerIds: body.offerIds })
    if (!result.ok) {
      const status = result.schemaMissing ? 409 : result.quality ? 422 : 400
      return NextResponse.json({ success: false, ...result }, { status })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof BadRequestError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
