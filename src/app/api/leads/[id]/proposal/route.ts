// GET /api/leads/[id]/proposal — lead'in bütçe bandı + risk skoruna göre 3 kademeli
// teklif (anchoring) + itiraz-cevap kütüphanesi + ikna tetikleyicileri. Hepsi salt-okunur
// üretim; operatör tekliflendirmede kullanır. Gönderim yok.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { buildProposal } from '@/lib/proposalGenerator'
import { OBJECTION_LIBRARY } from '@/lib/objectionLibrary'
import { selectPersuasionTriggers } from '@/lib/persuasionTriggers'

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
