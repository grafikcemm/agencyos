// POST /api/voice/samples — Voice DNA onboarding: eski profesyonel e-posta/teklif
// örneklerini alır, aday kural çıkarır (ONAYSIZ AKTİF ETMEZ). Same-origin + auth.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { ingestVoiceSamples } from '@/lib/outreach/voiceDna'

const Schema = z
  .object({ samples: z.array(z.string().max(20_000)).min(1).max(20) })
  .strict()

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const body = await parseJsonBody(req, Schema)
    const ingested = await ingestVoiceSamples(body.samples)
    return NextResponse.json({
      success: true,
      ingested,
      message:
        ingested === 0
          ? 'Geçerli örnek bulunamadı (çok kısa metinler atlandı).'
          : `${ingested} örnek işlendi → aday kurallar çıkarıldı. Aktif olması için Voice DNA panelinden ONAYLAYIN (otomatik aktif olmaz).`,
    })
  } catch (error: unknown) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'hata' }, { status: 500 })
  }
}
