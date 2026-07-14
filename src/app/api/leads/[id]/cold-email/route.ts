// POST /api/leads/[id]/cold-email — operatörün lead için soğuk e-posta taslağı
// üretmesi. Kullanıcı-tetikli tek taslak olduğundan SENKRON çalışır: lead'in acı
// noktalarıyla LLM'den gövde üretilir, imza bloğu settings'ten deterministik
// eklenir, outreach_messages'a draft yazılır ve UI'a anında döndürülür.
// GET — lead'in en son e-posta taslağını döndürür (drawer açılışında).
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { generateColdEmailDraft } from '@/lib/outreach/coldEmailService'

// LLM çağrısı birkaç saniye sürebilir — serverless timeout'u yükselt.
export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    // FINALIZATION Faz 5: üretim TEK serviste (coldEmailService) — Telegram
    // "cold email hazırla" komutu da AYNI fonksiyonu çağırır (parity).
    const result = await generateColdEmailDraft(id)
    if (!result.ok) {
      const status = result.notFound ? 404 : result.modelFailed ? 502 : 500
      return NextResponse.json({ success: false, error: result.error ?? 'Sunucu hatası' }, { status })
    }
    return NextResponse.json({
      success: true,
      draft: result.draft,
      quality: result.quality,
      claims: result.claims,
      claimPersisted: result.claimPersisted,
      ...(result.voiceDegraded ? { voiceDegraded: true } : {}),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const { data: draft, error } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, subject, body, created_at')
      .eq('lead_id', id)
      .eq('channel', 'email')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ success: true, draft: draft ?? null })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
