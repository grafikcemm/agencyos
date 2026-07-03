// POST /api/leads/[id]/feedback — Uygun / Uygun değil + neden.
// lead_match_feedback append-only; sektör öğrenmesine feedback_accept_rate ile girer (view v2).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiUser } from '@/lib/auth'
import { enforceSameOrigin, sanitizeWriteBody } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'

const BodySchema = z
  .object({
    verdict: z.enum(['uygun', 'uygun_degil']),
    reason_code: z
      .enum(['yanlis_sektor', 'zayif_kanit', 'hizmet_uyumsuz', 'fiyat_uyumsuz', 'zaten_cozulmus', 'dusuk_potansiyel', 'diger'])
      .optional(),
    note: z.string().max(500).optional(),
    assessment_id: z.string().uuid().optional(),
    match_id: z.string().uuid().optional(),
  })
  .strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser()
    if ('response' in auth) return auth.response
    const originBlock = enforceSameOrigin(req)
    if (originBlock) return originBlock

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })

    const raw = sanitizeWriteBody(await req.json())
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz gövde', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const { error } = await supabaseAdmin.from('lead_match_feedback').insert({
      lead_id: id,
      assessment_id: parsed.data.assessment_id ?? null,
      match_id: parsed.data.match_id ?? null,
      verdict: parsed.data.verdict,
      reason_code: parsed.data.reason_code ?? null,
      note: parsed.data.note ?? null,
    })
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json(
          { success: false, error: 'lead_match_feedback tablosu yok — önce migration 033 uygulanmalı.' },
          { status: 409 }
        )
      }
      throw error
    }
    return NextResponse.json({ success: true, data: { recorded: true } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
