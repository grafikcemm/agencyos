// Kanıt persist katmanı — lead_evidence satırları + private Storage'a screenshot.
// Bucket 'lead-evidence' PRIVATE'tır (migration 032); tüm okuma signed URL ile.
// Tablo/bucket yoksa soft-skip: satır yazılmaz ama koşu düşmez (görsel-iddia kuralı
// screenshot kanıtı olmayınca kendiliğinden devreye girer).

import { supabaseAdmin } from '../supabase'
import type { EvidenceItem } from '../types'

const BUCKET = 'lead-evidence'
const SIGNED_URL_TTL_SEC = 3600 // 1 saat — UI önizleme + LLM görsel girdisi için yeterli

export interface PersistedEvidence extends Omit<EvidenceItem, 'screenshot'> {
  id: string
  storage_path: string | null
}

// PostgREST eksik tabloda PGRST205 ("Could not find the table ... in the schema cache"),
// doğrudan PG bağlantısı 42P01 döner — ikisi de "migration henüz yok" demektir.
function isMissingRelation(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = error.message ?? ''
  return msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('Bucket not found')
}

// Screenshot'ı private bucket'a yükler; başarısızsa null (satır screenshot'sız kalır).
export async function uploadScreenshot(
  leadKey: string,
  shot: { mime: string; base64: string },
  runDate: string
): Promise<string | null> {
  try {
    const ext = shot.mime.includes('webp') ? 'webp' : shot.mime.includes('png') ? 'png' : 'jpg'
    const path = `leads/${leadKey}/${runDate}-final.${ext}`
    const bytes = Buffer.from(shot.base64, 'base64')
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: shot.mime, upsert: true })
    if (error) {
      if (!isMissingRelation(error)) console.warn('[evidenceStore] screenshot upload hatası:', error.message)
      return null
    }
    return path
  } catch (error) {
    console.warn('[evidenceStore] screenshot upload istisna:', error instanceof Error ? error.message : error)
    return null
  }
}

export async function signedUrlFor(path: string, expiresSec = SIGNED_URL_TTL_SEC): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, expiresSec)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

// Kanıtları persist eder. lead_id NULL olabilir (shadow adayı) — o durumda screenshot
// yolu aday anahtarıyla (place_id) yazılır. Dönüş: id'li satırlar (Offer Matcher
// evidence_refs bunları kullanır). Tablo yoksa boş dizi.
export async function persistEvidence(
  items: EvidenceItem[],
  opts: { leadId: string | null; candidateKey: string; runDate: string }
): Promise<PersistedEvidence[]> {
  if (items.length === 0) return []

  const rows = await Promise.all(
    items.map(async (item) => {
      let storage_path: string | null = null
      if (item.kind === 'screenshot' && item.screenshot) {
        storage_path = await uploadScreenshot(opts.leadId ?? opts.candidateKey, item.screenshot, opts.runDate)
        if (!storage_path) return null // upload düştü → screenshot kanıtı YAZILMAZ (görsel-iddia kuralı)
      }
      return {
        lead_id: opts.leadId,
        kind: item.kind,
        source: item.source,
        url: item.url,
        storage_path,
        summary: item.summary,
        payload: item.payload,
        confidence: item.confidence,
        verified: item.verified,
      }
    })
  )
  const insertable = rows.filter((r): r is NonNullable<typeof rows[number]> => r !== null)
  if (insertable.length === 0) return []

  try {
    const { data, error } = await supabaseAdmin.from('lead_evidence').insert(insertable).select('id, kind, source, url, storage_path, summary, payload, confidence, verified')
    if (error) {
      if (!isMissingRelation(error)) console.warn('[evidenceStore] lead_evidence insert hatası:', error.message)
      return []
    }
    return (data ?? []) as PersistedEvidence[]
  } catch (error) {
    console.warn('[evidenceStore] persist istisna:', error instanceof Error ? error.message : error)
    return []
  }
}

// Retention: 90 günden eski screenshot objelerini siler, satırların storage_path'ini
// null'lar (metrik payload + assessment geçmişi kalır). 'converted' lead görselleri muaf.
export async function cleanupOldScreenshots(opts: { retentionDays?: number; now?: Date } = {}): Promise<number> {
  const days = opts.retentionDays ?? 90
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  try {
    const { data, error } = await supabaseAdmin
      .from('lead_evidence')
      .select('id, storage_path, lead_id, leads(status)')
      .eq('kind', 'screenshot')
      .not('storage_path', 'is', null)
      .lt('collected_at', cutoff)
      .limit(200)
    if (error || !data) return 0

    let cleaned = 0
    for (const row of data as Array<{ id: string; storage_path: string; leads: { status?: string } | { status?: string }[] | null }>) {
      const leadStatus = Array.isArray(row.leads) ? row.leads[0]?.status : row.leads?.status
      if (leadStatus === 'converted') continue // dönüşen müşterinin kanıt görseli muaf
      const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path])
      if (rmErr) continue
      await supabaseAdmin.from('lead_evidence').update({ storage_path: null }).eq('id', row.id)
      cleaned++
    }
    return cleaned
  } catch {
    return 0
  }
}
