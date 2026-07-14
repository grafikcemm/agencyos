import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import {
  reconcileTechnicalGmailCanaryReply,
  runTechnicalGmailCanary,
} from '@/lib/gmail/technicalCanary'

/**
 * Operatörün kendi test adresine sabit, ticari olmayan bir Gmail canary yollar.
 * Alıcı request'ten alınmaz; yalnız deployment secret'ındaki allowlist adresidir.
 */
export async function POST(req: Request) {
  const auth = await requireApiUser(req)
  if ('response' in auth) return auth.response
  const originError = enforceSameOrigin(req)
  if (originError) return originError

  const recipient = process.env.GMAIL_CANARY_RECIPIENT ?? ''
  if (!recipient) {
    return NextResponse.json({ success: false, error: 'Teknik canary alıcısı yapılandırılmadı' }, { status: 503 })
  }

  try {
    const reply = await reconcileTechnicalGmailCanaryReply(recipient)
    if (reply.replied) {
      return NextResponse.json({
        success: true,
        result: { ok: true, sent: false, deduplicated: true, transport: 'gmail', replied: true },
      })
    }
    const result = await runTechnicalGmailCanary(recipient)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const detail = (error instanceof Error ? error.message : 'gmail canary başarısız')
      .replace(/[^\s"<>@]+@[^\s"<>@]+/g, '<redacted-email>')
      .slice(0, 240)
    return NextResponse.json({ success: false, error: detail }, { status: 502 })
  }
}
