// GET /api/gmail/status — Gmail bağlantı durumu (Settings UI + health kartı).
// SADECE boolean/adres/scope; hiçbir secret/token dönmez.
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { getGmailStatus } from '@/lib/gmail/status'

export async function GET(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response
  try {
    const status = await getGmailStatus()
    return NextResponse.json({ success: true, status })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'gmail durumu okunamadı' },
      { status: 500 },
    )
  }
}
