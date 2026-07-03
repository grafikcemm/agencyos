// Katalog merge katmanı: kod default'ları (catalog.ts) + DB override'ları (service_catalog).
// Migration 032 uygulanmamışsa (42P01/PGRST) saf kod default'larına düşer — asla crash yok.
// Panel yalnız fiyat + aktiflik değiştirebilir; yapı her zaman koddan gelir.

import { supabaseAdmin } from '../supabase'
import { ResolvedServicePackage, ServiceCatalogOverride } from '../types'
import { SERVICE_PACKAGES, domainOfPackage, findFamilyById } from './catalog'

interface OverrideRow {
  slug: string
  setup_price_override_tl: number | null
  monthly_price_override_tl: number | null
  active: boolean
}

// Saf merge — testlenebilir, DB'siz.
export function mergeCatalog(overrides: ServiceCatalogOverride[]): ResolvedServicePackage[] {
  const bySlug = new Map(overrides.map((o) => [o.slug, o]))
  return SERVICE_PACKAGES.map((pkg) => {
    const ov = bySlug.get(pkg.slug)
    return {
      ...pkg,
      domain: domainOfPackage(pkg),
      familyName: findFamilyById(pkg.familyId)?.name ?? pkg.familyId,
      setupPriceTl: ov?.setup_price_override_tl ?? pkg.defaultSetupPriceTl,
      monthlyPriceTl: ov?.monthly_price_override_tl ?? pkg.defaultMonthlyPriceTl,
      active: ov?.active ?? true,
    }
  })
}

// Tablo henüz yoksa PostgREST 42P01 (veya PGRST hata kodları) döner — soft-skip.
function isMissingTableError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const msg = error.message ?? ''
  return msg.includes('service_catalog') && (msg.includes('does not exist') || msg.includes('schema cache'))
}

export async function getCatalog(): Promise<ResolvedServicePackage[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('service_catalog')
      .select('slug, setup_price_override_tl, monthly_price_override_tl, active')

    if (error) {
      if (!isMissingTableError(error)) {
        console.warn('[catalog] service_catalog okunamadı, kod default kullanılıyor:', error.message)
      }
      return mergeCatalog([])
    }
    return mergeCatalog((data ?? []) as OverrideRow[])
  } catch {
    return mergeCatalog([])
  }
}
