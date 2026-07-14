// POST /api/gmail/oauth/revoke — aktif Gmail hesabının bağlantısını kaldırır
// (Google revoke + vault silme + hesap pasif, tek-tx idempotent RPC).
// YALNIZ açık kullanıcı aksiyonu (Settings butonu). Secret dönmez.
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { revokeGmailTokens } from '@/lib/gmail/tokenVault'

export async function POST(req: Request) {
  const auth = await requireApiUser(req)
  if ('response' in auth) return auth.response
  const originErr = enforceSameOrigin(req)
  if (originErr) return originErr
  const result = await revokeGmailTokens()
  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
