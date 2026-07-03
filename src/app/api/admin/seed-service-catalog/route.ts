// Kanonik hizmet kataloğunu service_catalog tablosuna senkronlar (migration 032).
// SADECE yapı kolonları upsert edilir (slug/domain/family/name) — override kolonlarına
// (setup_price_override_tl, monthly_price_override_tl, active) ASLA dokunulmaz;
// panelde yapılan fiyat/aktiflik değişiklikleri seed'den etkilenmez.

import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { SERVICE_PACKAGES, domainOfPackage, findFamilyById } from '@/lib/services/catalog'

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    // Diğer yazma rotalarıyla aynı CSRF savunması (post-audit düzeltmesi).
    const originBlock = enforceSameOrigin(req)
    if (originBlock) return originBlock

    const rows = SERVICE_PACKAGES.map((pkg) => ({
      slug: pkg.slug,
      domain: domainOfPackage(pkg),
      family: findFamilyById(pkg.familyId)?.name ?? pkg.familyId,
      name: pkg.name,
      updated_at: new Date().toISOString(),
    }))

    // onConflict slug: yalnız yapı kolonları güncellenir; override kolonları payload'da
    // olmadığı için upsert onlara dokunmaz.
    const { error } = await supabaseAdmin
      .from('service_catalog')
      .upsert(rows, { onConflict: 'slug' })

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json(
          { success: false, error: 'service_catalog tablosu yok — önce migration 032 uygulanmalı.' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ success: true, data: { synced: rows.length } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
