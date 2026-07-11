// ─────────────────────────────────────────────────────────────────────────────
// audit-compliance — DETERMİNİSTİK pre-send kapısı (12-gmail §E2, 21 T8).
// LLM YOK (Tier 0 sıkı kural, 16 §3). Kontroller:
//   1. Alıcı adresi geçerli e-posta mı?
//   2. Gövde boş değil + opt-out/footer mevcut mu (compliance_enabled ise)?
//   3. leads.do_not_contact işaretli mi (mig 047)?
//   4. suppression_list'te adres VEYA domain var mı (mig 047)?
// Suppression kontrolü FAIL-CLOSED: DB hatasında gönderim BLOKE edilir —
// kapı atlanamaz (T8 yapısal garanti).
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '../supabase'

export interface ComplianceResult {
  ok: boolean
  failures: string[]
}

// buildComplianceFooter (coldEmail.ts) çıktısının deterministik izi — footer
// metni değişirse bu marker ile birlikte güncellenmeli.
export const OPT_OUT_MARKER = 'yanıtlamanız yeterlidir'

const EMAIL_ADDR_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function extractDomain(address: string | null | undefined): string | null {
  if (!address) return null
  const at = address.lastIndexOf('@')
  if (at < 0) return null
  const domain = address.slice(at + 1).trim().toLowerCase()
  return domain.length > 0 ? domain : null
}

export interface StaticComplianceInput {
  toAddress: string | null | undefined
  body: string
  /** settings.compliance_enabled (default true) — kapalıysa footer zorunlu değil. */
  complianceEnabled: boolean
  doNotContact?: boolean | null
}

/** Saf statik kontroller — DB'siz, tam test edilebilir. */
export function checkComplianceStatic(input: StaticComplianceInput): ComplianceResult {
  const failures: string[] = []
  if (!input.toAddress || !EMAIL_ADDR_RE.test(input.toAddress)) {
    failures.push('gecersiz_alici_adresi')
  }
  if (!input.body || input.body.trim().length === 0) {
    failures.push('bos_govde')
  } else if (input.complianceEnabled && !input.body.includes(OPT_OUT_MARKER)) {
    failures.push('optout_footer_eksik')
  }
  if (input.doNotContact) {
    failures.push('lead_do_not_contact')
  }
  return { ok: failures.length === 0, failures }
}

export interface SuppressionVerdict {
  suppressed: boolean
  reason?: string
}

/** suppression_list kontrolü — email scope (tam adres) + domain scope.
 *  FAIL-CLOSED: sorgu hatasında suppressed:true döner (kapı atlanamaz, T8). */
export async function isSuppressed(address: string): Promise<SuppressionVerdict> {
  const addr = address.trim().toLowerCase()
  const domain = extractDomain(addr)
  try {
    const { data: emailRows, error: e1 } = await supabaseAdmin
      .from('suppression_list')
      .select('id, reason')
      .eq('scope', 'email')
      .ilike('address', addr)
      .limit(1)
    if (e1) throw new Error(e1.message)
    if ((emailRows ?? []).length > 0) {
      return { suppressed: true, reason: `suppression:email (${emailRows![0].reason})` }
    }

    if (domain) {
      const { data: domainRows, error: e2 } = await supabaseAdmin
        .from('suppression_list')
        .select('id, reason')
        .eq('scope', 'domain')
        .ilike('address', domain)
        .limit(1)
      if (e2) throw new Error(e2.message)
      if ((domainRows ?? []).length > 0) {
        return { suppressed: true, reason: `suppression:domain (${domainRows![0].reason})` }
      }
    }
    return { suppressed: false }
  } catch (err) {
    // FAIL-CLOSED: kontrol edilemeyen adrese gönderim YAPILMAZ.
    const msg = err instanceof Error ? err.message : 'bilinmeyen'
    console.error('[audit-compliance] suppression kontrolü başarısız (fail-closed):', msg)
    return { suppressed: true, reason: 'suppression_kontrol_hatasi_fail_closed' }
  }
}

async function loadComplianceEnabled(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'compliance_enabled')
      .maybeSingle()
    return String(data?.value ?? 'true').toLowerCase() !== 'false'
  } catch {
    return true // varsayılan: uyum kontrolü AÇIK
  }
}

export interface AuditComplianceInput {
  toAddress: string | null | undefined
  body: string
  doNotContact?: boolean | null
}

/** Tam pre-send kapısı: statik kontroller + suppression (DB). */
export async function auditCompliance(input: AuditComplianceInput): Promise<ComplianceResult> {
  const complianceEnabled = await loadComplianceEnabled()
  const staticResult = checkComplianceStatic({ ...input, complianceEnabled })
  const failures = [...staticResult.failures]

  if (input.toAddress && EMAIL_ADDR_RE.test(input.toAddress)) {
    const verdict = await isSuppressed(input.toAddress)
    if (verdict.suppressed) failures.push(verdict.reason ?? 'suppressed')
  }
  return { ok: failures.length === 0, failures }
}
