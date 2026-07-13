// POST /api/proposals/[id] — teklif durum/onay aksiyonları (Sprint-3 Faz 5).
// action:
//   transition {to}            → geçerli geçiş grafı içinde durum değişimi
//   request_approval           → current_version içeriğine digest'li pending onay
//   decide {version, decision} → approved/rejected — YALNIZ approval satırı +
//                                doğru versiyon + digest birebir ise geçer
// 'sent' geçişi YOKTUR (gönderim ayrı güvenlik incelemesi + açık kullanıcı onayı ister).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import {
  transitionProposal,
  requestProposalApproval,
  decideProposalApproval,
} from '@/lib/proposals/proposalService'

const Schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('transition'),
    to: z.enum(['review', 'draft', 'accepted', 'rejected', 'expired']),
  }),
  z.object({ action: z.literal('request_approval') }),
  z.object({
    action: z.literal('decide'),
    version: z.number().int().positive(),
    decision: z.enum(['approved', 'rejected']),
  }),
])

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })
    const body = await parseJsonBody(req, Schema)

    const result =
      body.action === 'transition'
        ? await transitionProposal({ proposalId: id, to: body.to })
        : body.action === 'request_approval'
          ? await requestProposalApproval({ proposalId: id })
          : await decideProposalApproval({ proposalId: id, version: body.version, decision: body.decision })

    if (!result.ok) return NextResponse.json({ success: false, ...result }, { status: 409 })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof BadRequestError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
