// POST /api/leads/[id]/audit — tek lead için manuel kanıt toplama + konsey.
// Günlük AI tavanına uyar (council içindeki bütçe kontrolü); SSRF guard'ı kanıt
// toplayıcıda. force=true bugünkü mevcut assessment'ı yok sayıp yeniden koşturur.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin, sanitizeWriteBody } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { auditSingleLead } from '@/lib/leadIntel/pipeline'

// PSI audit (10-60sn) + konsey LLM geçişi — platform default süresi yetmez,
// yarıda kesilirse assessment bookkeeping'i kaybolur.
export const maxDuration = 60

const BodySchema = z.object({ force: z.boolean().optional() }).strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originBlock = enforceSameOrigin(req)
    if (originBlock) return originBlock

    const { id } = await params
    if (!id) return NextResponse.json({ success: false, error: 'id zorunludur' }, { status: 400 })

    let force = false
    try {
      const raw = sanitizeWriteBody(await req.json())
      const parsed = BodySchema.safeParse(raw)
      if (parsed.success) force = parsed.data.force ?? false
    } catch {
      // gövdesiz POST kabul (force=false)
    }

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, sector, city, district, phone, website, rating, review_count, google_place_id, quality_score, last_assessed_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!lead) return NextResponse.json({ success: false, error: 'Lead bulunamadı' }, { status: 404 })

    // force değilse ve bugün zaten değerlendirilmişse tekrar PSI/LLM harcama.
    if (!force && lead.last_assessed_at) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
      const assessedDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(lead.last_assessed_at))
      if (today === assessedDay) {
        return NextResponse.json({
          success: true,
          data: { skipped: true, reason: 'Bugün zaten değerlendirildi. Yeniden koşturmak için {"force": true} gönder.' },
        })
      }
    }

    const result = await auditSingleLead(lead)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.summary }, { status: 502 })
    }
    return NextResponse.json({
      success: true,
      data: {
        assessment_id: result.assessmentId,
        summary: result.summary,
        design_score: result.council?.designScore,
        ai_score: result.council?.aiScore,
        chair: result.council?.chair,
        matches: result.council?.matches,
        notes: result.council?.notes,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
