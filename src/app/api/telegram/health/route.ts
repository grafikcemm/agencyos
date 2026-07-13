// GET /api/telegram/health — deploy preflight (Faz 0.6 + 5).
// Amaç: register script'in "yeni webhook kodu gerçekten yayında mı?"
// sorusuna auth'suz, sızıntısız cevap. Env DEĞERİ/BOOLEAN'I DÖNMEZ.
// DİKKAT (Faz 5): bu statik marker yalnız KOD SÜRÜMÜ işaretidir — çalışır
// durumda olma (readiness) KANITI DEĞİLDİR. Gerçek hazırlık bileşen bazlı
// olarak korumalı /api/telegram/diagnostics `readiness` alanında ölçülür
// (env, LIFE 006 şema/RPC, App 058 RPC, webhook URL eşleşmesi AYRI AYRI).
import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    webhook: 'v2-fail-closed',
    note: 'kod-sürümü işareti — hazırlık kanıtı DEĞİL; readiness için korumalı /api/telegram/diagnostics',
  })
}
