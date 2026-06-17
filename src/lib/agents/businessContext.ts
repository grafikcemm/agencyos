import 'server-only'
import {
  qualifiedLeadsContext,
  researcherContext,
  funnelContext,
  sectorMixContext,
} from './runner'

// ─────────────────────────────────────────────────────────────────────────────
// Business context loader — gerçek AgencyOS verisini (leads/funnel/sektör/sinyal)
// hazır Türkçe metin dilimlerine çevirir. Telegram deliberasyon motoru bunları
// "GERÇEK İŞ VERİSİ" bloğu olarak ajanlara besler.
//
// runner.ts'deki mevcut builder'lar yeniden kullanılır (yeni SQL yok). Her dilim
// izole try/catch ile sarılır → tek sorgu hatası tüm bloğu düşürmez. ASLA fırlatmaz.
// ─────────────────────────────────────────────────────────────────────────────

export type BusinessSliceKey = 'leads' | 'funnel' | 'sectors' | 'signals'

export interface BusinessSlice {
  key: BusinessSliceKey
  label: string
  text: string
}

const SLICE_BUILDERS: Record<BusinessSliceKey, { label: string; build: () => Promise<string> }> = {
  leads:   { label: 'Nitelikli Leadler',  build: qualifiedLeadsContext },
  funnel:  { label: 'Lead Funnel & MRR',  build: funnelContext },
  sectors: { label: 'Sektör Dağılımı',    build: sectorMixContext },
  // researcherContext = fırsat sektörleri + son 7 gün trend sinyalleri.
  signals: { label: 'Fırsat & Sinyaller', build: researcherContext },
}

const DEFAULT_SLICES: BusinessSliceKey[] = ['leads', 'funnel', 'sectors', 'signals']

async function loadOne(key: BusinessSliceKey): Promise<BusinessSlice> {
  const def = SLICE_BUILDERS[key]
  try {
    const text = await def.build()
    return { key, label: def.label, text: text?.trim() || 'Veri yok.' }
  } catch (error) {
    console.error(`loadBusinessSlices(${key}) başarısız:`, error)
    return { key, label: def.label, text: 'Veri yüklenemedi.' }
  }
}

/**
 * İstenen iş verisi dilimlerini paralel yükler (varsayılan: hepsi).
 * Her dilim kendi içinde izole — biri hata verse de diğerleri döner.
 */
export async function loadBusinessSlices(
  keys: BusinessSliceKey[] = DEFAULT_SLICES,
): Promise<BusinessSlice[]> {
  return Promise.all(keys.map(loadOne))
}

/** Dilimleri tek bir okunabilir "GERÇEK İŞ VERİSİ" bloğuna çevirir. */
export function formatSlicesBlock(slices: BusinessSlice[]): string {
  return slices.map((s) => `### ${s.label}\n${s.text}`).join('\n\n')
}

/** En az bir dilimde gerçek veri var mı? (Hepsi placeholder ise false.) */
export function hasRealData(slices: BusinessSlice[]): boolean {
  const placeholders = ['Veri yok.', 'Veri yüklenemedi.']
  return slices.some((s) => s.text.length > 0 && !placeholders.includes(s.text))
}
