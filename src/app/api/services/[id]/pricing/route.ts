// PATCH /api/services/[id]/pricing — [id] = kanonik slug.
// Panelin dokunabildiği TEK yüzey: fiyat override + aktiflik. Yapı alanları
// (name/domain/family/salesCopy...) bu route'tan yapısal olarak erişilemez —
// zod şeması yalnız 3 alanı kabul eder, service_catalog upsert'i yalnız onları yazar.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApiAccess } from '@/lib/auth'
import { enforceSameOrigin, sanitizeWriteBody } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { findServiceBySlug, domainOfPackage, findFamilyById } from '@/lib/services/catalog'

const PricingPatchSchema = z
  .object({
    setup_price_tl: z.number().int().min(0).max(1_000_000).optional(),
    monthly_price_tl: z.number().int().min(0).max(1_000_000).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => v.setup_price_tl !== undefined || v.monthly_price_tl !== undefined || v.active !== undefined,
    { message: 'En az bir alan gerekli: setup_price_tl, monthly_price_tl, active' }
  )

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    const originBlock = enforceSameOrigin(req)
    if (originBlock) return originBlock

    const { id: slug } = await params
    const pkg = findServiceBySlug(slug)
    if (!pkg) {
      return NextResponse.json({ success: false, error: 'Bilinmeyen hizmet slug\'ı' }, { status: 404 })
    }

    const raw = sanitizeWriteBody(await req.json())
    const parsed = PricingPatchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz gövde', issues: parsed.error.issues },
        { status: 400 }
      )
    }

    const row: Record<string, unknown> = {
      slug: pkg.slug,
      // Upsert insert dalı için yapı kolonları koddan doldurulur (seed ile aynı değerler);
      // conflict dalında da yazılırlar ama kaynak yine kod olduğundan zararsız.
      domain: domainOfPackage(pkg),
      family: findFamilyById(pkg.familyId)?.name ?? pkg.familyId,
      name: pkg.name,
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.setup_price_tl !== undefined) row.setup_price_override_tl = parsed.data.setup_price_tl
    if (parsed.data.monthly_price_tl !== undefined) row.monthly_price_override_tl = parsed.data.monthly_price_tl
    if (parsed.data.active !== undefined) row.active = parsed.data.active

    const { error } = await supabaseAdmin.from('service_catalog').upsert(row, { onConflict: 'slug' })
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return NextResponse.json(
          { success: false, error: 'service_catalog tablosu yok — önce migration 032 uygulanmalı.' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ success: true, data: { slug: pkg.slug } })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
