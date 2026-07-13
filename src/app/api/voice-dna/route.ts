// GET/POST /api/voice-dna — Voice DNA inceleme + onay akışı (Faz 4.1).
// candidate → (operatör onayı BURADA) → approved/active. Otomatik aktivasyon YOK.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess, requireApiUser } from '@/lib/auth'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import {
  getPhraseCandidates,
  getStyleCandidates,
  getVoiceProfile,
  approveBannedPhrase,
  approveStyleRule,
} from '@/lib/outreach/voiceDna'

export async function GET(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response
  const [phraseCandidates, styleCandidates, profile] = await Promise.all([
    getPhraseCandidates(),
    getStyleCandidates(),
    getVoiceProfile(),
  ])
  return NextResponse.json({ phraseCandidates, styleCandidates, profile })
}

const ApproveSchema = z
  .object({
    kind: z.enum(['phrase', 'style_positive', 'style_negative']),
    value: z.string().min(2).max(200),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response
    const originErr = enforceSameOrigin(req)
    if (originErr) return originErr

    const body = await parseJsonBody(req, ApproveSchema)
    if (body.kind === 'phrase') await approveBannedPhrase(body.value)
    else await approveStyleRule(body.value, body.kind === 'style_positive' ? 'positive' : 'negative')
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof BadRequestError) return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sunucu hatası' }, { status: 500 })
  }
}
