// KALDIRILDI (Faz 0.6): CRON_SECRET'lı teşhis yüzeyi tekilleştirildi.
// Tek teşhis kaynağı: GET /api/telegram/diagnostics (operatör auth, secret dönmez).
import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Bu endpoint kaldırıldı — GET /api/telegram/diagnostics kullanın (operatör oturumu gerekir).' },
    { status: 410 },
  )
}
