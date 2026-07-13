// GET /api/telegram/health — deploy preflight (Faz 0.6).
// Amaç: register script'in "yeni webhook kodu gerçekten yayında mı?"
// sorusuna auth'suz, sızıntısız cevap. Env DEĞERİ/BOOLEAN'I DÖNMEZ —
// yalnız sürüm etiketi (yeni kod = fail-closed auth + durable claim).
import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, webhook: 'v2-fail-closed' })
}
