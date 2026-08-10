// ─────────────────────────────────────────────────────────────────────────────
// ÜLKE UYUM KAPISI — gönderim yolunun içinde, FAIL-CLOSED.
//
// `auditCompliance` adres/footer/suppression bakar. Bu modül ÜLKE REJİMİNE
// bakar: alıcının ülkesi, tüzel kişiliği, mesleği, uyum kanıtı ve e-posta
// doğrulaması. İkisi birlikte gönderim kapısını oluşturur.
//
// FAIL-CLOSED YÖNÜ: lead okunamazsa, ülke sütunu yoksa (migration 072
// uygulanmamışsa) veya alan boşsa sonuç `blocked`'tır. "Kolon yok → serbest"
// davranışı ASLA olmaz — bu, migration uygulanmadan tüm dünyaya gönderim
// açmak demek olurdu.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'
import {
  evaluateSendPolicy,
  type EmailConfidence,
  type EntityType,
  type PolicyDecision,
  type PolicyRequirement,
} from './countryPolicy'

/** Karar için okunacak alanlar — `select('*')` yapılmaz. */
const POLICY_SELECT =
  'id,country_code,entity_type,profession,compliance_evidence,do_not_contact,market_scope'

const ENTITY_TYPES: readonly EntityType[] = ['legal_entity', 'sole_trader', 'individual', 'unknown']

function coerceEntityType(value: unknown): EntityType {
  const v = String(value ?? '').trim()
  return (ENTITY_TYPES as readonly string[]).includes(v) ? (v as EntityType) : 'unknown'
}

function coerceEvidence(value: unknown): Partial<Record<PolicyRequirement, boolean>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Partial<Record<PolicyRequirement, boolean>> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Yalnız açıkça `true` olan anahtar kanıtlanmış sayılır.
    if (v === true) out[k as PolicyRequirement] = true
  }
  return out
}

/**
 * Kapının hangi aşamada çalıştığı.
 *
 *   `approval` — onay kartı doğmadan önce. Yalnız TASLAK BİLE ÜRETİLEMEYECEK
 *                durumlar bloklar: suppression, bloklu ülke, statü istisnası.
 *                Kanıt eksikliği burada bloklamaz; onay süreci kanıt toplamanın
 *                parçasıdır ve onay tek başına gönderim yetkisi vermez.
 *   `send`      — gerçek yürütme. `sendAllowed` olmadan geçilemez.
 */
export type PolicyGateStage = 'approval' | 'send'

export interface LeadPolicyGateInput {
  leadId: string | null
  stage: PolicyGateStage
  /** Suppression sonucu — `auditCompliance` zaten hesapladıysa tekrar sorulmaz. */
  suppressed: boolean
  emailConfidence: EmailConfidence | null
  /** Gönderim altyapısı hazır mı (deliverability readiness). */
  mailboxReady?: boolean
}

export interface LeadPolicyGateResult {
  decision: PolicyDecision
  /** `auditCompliance.failures` ile aynı biçimde birleştirilebilir kod listesi. */
  failures: string[]
}

const BLOCKED_FAILURE = 'ulke_politikasi_bloke'
const RESEARCH_FAILURE = 'ulke_politikasi_kanit_eksik'

/** Lead okunamadığında kullanılacak kanonik "hiçbir şey bilmiyoruz" olgusu. */
function unknownFacts(suppressed: boolean) {
  return {
    countryCode: null,
    entityType: 'unknown' as EntityType,
    profession: null,
    provenRequirements: {},
    suppressed,
    emailConfidence: null,
    mailboxReady: false,
  }
}

export async function evaluateLeadSendPolicy(input: LeadPolicyGateInput): Promise<LeadPolicyGateResult> {
  if (!input.leadId) {
    return toResult(evaluateSendPolicy(unknownFacts(input.suppressed)), input.stage)
  }

  let row: Record<string, unknown> | null = null
  try {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(POLICY_SELECT)
      .eq('id', input.leadId)
      .maybeSingle()
    // Migration 072 uygulanmamışsa PostgREST kolon hatası verir. Bu bir
    // "serbest bırak" sinyali DEĞİLDİR — bilinmeyen olgularla fail-closed devam.
    if (error) row = null
    else row = (data ?? null) as Record<string, unknown> | null
  } catch {
    row = null
  }

  if (!row) {
    return toResult(evaluateSendPolicy(unknownFacts(input.suppressed)), input.stage)
  }

  const decision = evaluateSendPolicy({
    countryCode: row.country_code == null ? null : String(row.country_code),
    entityType: coerceEntityType(row.entity_type),
    profession: row.profession == null ? null : String(row.profession),
    provenRequirements: coerceEvidence(row.compliance_evidence),
    suppressed: input.suppressed || row.do_not_contact === true,
    emailConfidence: input.emailConfidence,
    mailboxReady: input.mailboxReady ?? false,
  })
  return toResult(decision, input.stage)
}

function toResult(decision: PolicyDecision, stage: PolicyGateStage): LeadPolicyGateResult {
  const failures: string[] = []
  if (!decision.draftAllowed) failures.push(BLOCKED_FAILURE)
  else if (stage === 'send' && !decision.sendAllowed) failures.push(RESEARCH_FAILURE)
  return { decision, failures }
}

export { BLOCKED_FAILURE, RESEARCH_FAILURE }
