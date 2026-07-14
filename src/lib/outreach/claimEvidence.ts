// ─────────────────────────────────────────────────────────────────────────────
// Canonical outbound artifact + iddia→kanıt servisi (FINALIZATION Faz 1) —
// SERVER-ONLY.
//
// Tek doğruluk kaynağı: outreach_message_versions (immutable versiyon; alıcı,
// içerik, content digest, Voice DNA snapshot digest'i, gate sonucu, kaynak) +
// outreach_claim_evidence (iddia→kanıt bağı VERSİYONA bağlı; claim_key stabil).
//
// Güvenlik yönü FAIL-CLOSED:
// - Şema canlı değilse (mig 062 onay bekliyor) sürüm/iz YAZILAMAZ ve iddia
//   eşlemesi YÜKLENEMEZ → gate tespit ettiği her iddiayı bloklar. Legacy yol
//   asla "kanıtlıymış gibi" davranmaz.
// - Evidence uyumu deterministiktir: iddia KATEGORİSİ × kanıt TÜRÜ matrisi +
//   sayısal iddialarda sayı-içerme kontrolü. Alakasız kanıta bağlanmış iddia
//   CLAIM_EVIDENCE_MISMATCH ile düşer.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import {
  detectClaimsDetailed,
  fold,
  type ClaimCategory,
  type ClaimEvidenceEntry,
  type DetectedClaim,
} from '@/lib/outreach/qualityLint'

export const SCHEMA_MISSING_CODES = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

// ── Deterministik kimlikler ──────────────────────────────────────────────────

/** Stabil iddia anahtarı: fold edilmiş, boşluk-normalize metnin sha256 kısaltması.
 *  Edit sonrası aynı iddia cümlesi aynı anahtara çözülür → güvenli remap. */
export function claimKey(claimText: string): string {
  const norm = fold(claimText).replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(norm).digest('hex').slice(0, 32)
}

/** İçerik dijesti — kanal + normalize alıcı + konu + gövde. Versiyon kimliğidir;
 *  onay dijestleri bu içeriğe bağlanır, içerik değişince eski bağlar geçersizdir. */
export function computeContentDigest(opts: {
  channel: string
  recipientEmail: string | null
  subject: string | null
  body: string
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        c: opts.channel,
        r: (opts.recipientEmail ?? '').trim().toLowerCase(),
        s: opts.subject ?? '',
        b: opts.body,
      }),
    )
    .digest('hex')
}

/** Voice DNA snapshot dijesti — üretim anında hangi kural setinin geçerli
 *  olduğunun izi (onaylı pozitif/negatif kurallar + yasaklı ifadeler). */
export function voiceRulesDigest(rules: { positive: string[]; negative: string[] } | null | undefined, banned: string[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ p: rules?.positive ?? [], n: rules?.negative ?? [], b: banned }))
    .digest('hex')
    .slice(0, 32)
}

// ── Deterministik kanıt-uyum matrisi ─────────────────────────────────────────

export interface EvidenceMeta {
  id: string
  kind: string | null
  source: string | null
  summary: string | null
  payload: unknown
  verified: boolean | null
}

/** Lead istihbarat motorunun ürettiği GÖZLEMSEL kanıt türleri. */
const OBSERVATIONAL_KINDS = new Set([
  'places_data',
  'review_signal',
  'html_signal',
  'cta_analysis',
  'form_analysis',
  'tech_stack',
  'pagespeed',
  'screenshot',
  'manual',
])

/** Sonuç/performans vaadini destekleyebilecek kanıt türleri — yalnız gerçek
 *  vaka/sonuç kaydı (operatör girer, verified=true şartı aşağıda). */
const RESULT_KINDS = new Set(['case_study', 'client_result', 'portfolio_result'])

/** Davranışsal iddia (müşteri kaybı, cevap alamama) için kabul edilen türler. */
const BEHAVIORAL_KINDS = new Set(['review_signal', 'places_data', 'manual'])

export interface CompatVerdict {
  ok: boolean
  reason: string | null
}

/** İddia kategorisi × kanıt türü/değeri deterministik uyum kontrolü.
 *  - quantified: RESULT_KINDS + verified=true + iddiadaki sayı kanıtta geçmeli
 *    (gözlemsel sayılar — puan/yorum sayısı — kanıt özeti sayıyı içeriyorsa
 *    gözlemsel türle de doğrulanabilir).
 *  - outcome: RESULT_KINDS + verified=true (sayı varsa içerme şartı).
 *  - behavioral: BEHAVIORAL_KINDS (yorum/har sinyali) veya RESULT_KINDS.
 *  - observation: her gözlemsel tür.
 */
export function checkClaimEvidenceCompat(claim: DetectedClaim, evidence: EvidenceMeta): CompatVerdict {
  const kind = (evidence.kind ?? '').toLowerCase()
  const haystack = fold(`${evidence.summary ?? ''} ${JSON.stringify(evidence.payload ?? '')}`)
  const numbers = claim.snippet.match(/\d+/g) ?? []
  const numbersContained = numbers.every((n) => haystack.includes(n))

  switch (claim.category) {
    case 'observation':
      if (OBSERVATIONAL_KINDS.has(kind) || RESULT_KINDS.has(kind)) return { ok: true, reason: null }
      return { ok: false, reason: `gözlem iddiası '${kind || 'türsüz'}' kanıtla doğrulanamaz` }
    case 'behavioral':
      if (BEHAVIORAL_KINDS.has(kind) || RESULT_KINDS.has(kind)) return { ok: true, reason: null }
      return { ok: false, reason: `davranış iddiası için '${kind || 'türsüz'}' kanıt uygun değil (yorum/işletme sinyali gerekir)` }
    case 'quantified':
      if (OBSERVATIONAL_KINDS.has(kind) && numbers.length > 0 && numbersContained) {
        // Gözlemsel sayı (ör. "4.2 puan, 37 yorum") kanıt içinde birebir geçiyorsa uygundur.
        return { ok: true, reason: null }
      }
      if (RESULT_KINDS.has(kind) && evidence.verified === true) {
        if (numbers.length > 0 && !numbersContained) {
          return { ok: false, reason: `iddiadaki sayı (${numbers.join(',')}) kanıt kaydında geçmiyor` }
        }
        return { ok: true, reason: null }
      }
      return {
        ok: false,
        reason: `ölçülebilir vaat yalnız doğrulanmış vaka kaydıyla (case_study/client_result, verified=true) veya sayının birebir geçtiği gözlemsel kanıtla desteklenebilir — '${kind || 'türsüz'}' yetersiz`,
      }
    case 'outcome':
      if (RESULT_KINDS.has(kind) && evidence.verified === true) {
        if (numbers.length > 0 && !numbersContained) {
          return { ok: false, reason: `iddiadaki sayı (${numbers.join(',')}) kanıt kaydında geçmiyor` }
        }
        return { ok: true, reason: null }
      }
      return {
        ok: false,
        reason: `sonuç vaadi yalnız doğrulanmış vaka kaydıyla desteklenebilir — '${kind || 'türsüz'}' yetersiz`,
      }
  }
}

// ── Remap: edit sonrası iddia→kanıt eşlemesinin güvenli taşınması ────────────

export interface PersistedClaim {
  claim_key: string
  claim_text: string
  claim_category: string | null
  evidence_id: string
  evidence_type?: string | null
  evidence_source?: string | null
}

export interface RemapResult {
  /** Gate'e verilecek eşleme — yalnız yeni metinde HÂLÂ geçen iddialar. */
  entries: ClaimEvidenceEntry[]
  /** Yeni metinde tespit edilip HİÇBİR kayıtlı iddiaya eşlenemeyen snippet'ler
   *  (gate bunları CLAIM_WITHOUT_EVIDENCE ile bloklar — fail-closed). */
  unmatched: string[]
  /** Remap'e katılan kayıtlı iddialar — yeni versiyona kopyalanacak satırlar. */
  matchedPrior: PersistedClaim[]
}

/** Deterministik remap: yeni gövdedeki iddia snippet'leri, kayıtlı iddia
 *  metinleriyle (fold'lu substring iki yönde) eşleşirse kanıt bağı taşınır.
 *  Eşleşmeyen iddia bağsız kalır → gate bloklar. Kanıt bağı ASLA metin
 *  değişikliğinde 'yakın diye' başka iddiaya aktarılmaz. */
export function remapClaims(newBody: string, prior: PersistedClaim[]): RemapResult {
  const detected = detectClaimsDetailed(newBody)
  const byClaim = new Map<string, { claim: string; evidenceIds: Set<string> }>()
  const matchedKeys = new Set<string>()
  const unmatched: string[] = []

  for (const d of detected) {
    const fs = fold(d.snippet)
    const hits = prior.filter((p) => {
      const fc = fold(p.claim_text)
      return fc.includes(fs) || fs.includes(fc)
    })
    if (hits.length === 0) {
      unmatched.push(d.snippet)
      continue
    }
    for (const h of hits) {
      const cur = byClaim.get(h.claim_key) ?? { claim: h.claim_text, evidenceIds: new Set<string>() }
      cur.evidenceIds.add(h.evidence_id)
      byClaim.set(h.claim_key, cur)
      matchedKeys.add(`${h.claim_key}:${h.evidence_id}`)
    }
  }

  return {
    entries: [...byClaim.values()].map((c) => ({ claim: c.claim, evidenceIds: [...c.evidenceIds] })),
    unmatched,
    matchedPrior: prior.filter((p) => matchedKeys.has(`${p.claim_key}:${p.evidence_id}`)),
  }
}

// ── Yükleme: mesajın kayıtlı iddia→kanıt bağları (server-side authoritative) ─

export interface LoadedClaims {
  claims: PersistedClaim[]
  /** true → mig 062 canlı değil; çağıran iddiaları KANITSIZ saymalı (fail-closed). */
  schemaMissing: boolean
}

/** Mesajın EN SON versiyonuna bağlı iddia kayıtlarını okur; versiyon şeması
 *  yoksa mesaj-düzeyi legacy satırlara düşer; o da yoksa schemaMissing=true.
 *  Okuma HATASI fırlatılır (yutulmaz) — çağıran fail-closed davranır. */
export async function loadClaimEntriesForMessage(outreachMessageId: string): Promise<LoadedClaims> {
  // 1) Versiyonlu yol (canonical).
  const { data: ver, error: verErr } = await supabaseAdmin
    .from('outreach_message_versions')
    .select('id')
    .eq('outreach_message_id', outreachMessageId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (verErr && !SCHEMA_MISSING_CODES.has(verErr.code ?? '')) {
    throw new Error(`mesaj versiyonu okunamadı: ${verErr.message}`)
  }

  if (!verErr && ver) {
    const { data, error } = await supabaseAdmin
      .from('outreach_claim_evidence')
      .select('claim_key, claim_text, claim_category, evidence_id, evidence_type, evidence_source')
      .eq('message_version_id', ver.id)
    if (error) throw new Error(`iddia kayıtları okunamadı: ${error.message}`)
    return { claims: (data ?? []) as PersistedClaim[], schemaMissing: false }
  }

  // 2) Legacy mesaj-düzeyi satırlar (062 v1 dönemi izleri) — varsa kullanılır.
  const { data: legacy, error: legacyErr } = await supabaseAdmin
    .from('outreach_claim_evidence')
    .select('claim_key, claim_text, claim_category, evidence_id')
    .eq('outreach_message_id', outreachMessageId)
  if (legacyErr) {
    if (SCHEMA_MISSING_CODES.has(legacyErr.code ?? '')) return { claims: [], schemaMissing: true }
    throw new Error(`iddia kayıtları okunamadı: ${legacyErr.message}`)
  }
  return {
    claims: ((legacy ?? []) as Array<Partial<PersistedClaim> & { claim_text: string; evidence_id: string }>).map((r) => ({
      claim_key: r.claim_key ?? claimKey(r.claim_text),
      claim_text: r.claim_text,
      claim_category: r.claim_category ?? null,
      evidence_id: r.evidence_id,
    })),
    schemaMissing: false,
  }
}

/** Lead'in kanıt META'sını okur (uyum kontrolü için) — hata FIRLATIR. */
export async function loadEvidenceMeta(leadId: string | null): Promise<EvidenceMeta[]> {
  if (!leadId) return []
  const { data, error } = await supabaseAdmin
    .from('lead_evidence')
    .select('id, kind, source, summary, payload, verified')
    .eq('lead_id', leadId)
    .limit(50)
  if (error) throw new Error(`lead kanıtları okunamadı: ${error.message}`)
  return (data ?? []) as EvidenceMeta[]
}

// ── Persist: yeni versiyon + iddia bağları ───────────────────────────────────

export interface PersistVersionInput {
  outreachMessageId: string
  channel: string
  recipient: { kind: 'primary_contact' | 'lead_email' | 'none'; contactId: string | null; email: string | null }
  subject: string | null
  body: string
  voiceDigest: string | null
  gate: { ok: boolean; digest: string; violations: Array<{ code: string; detail: string }> }
  source: string
  claims: Array<{ text: string; category: ClaimCategory | null; evidenceId: string; evidenceType: string | null; evidenceSource: string | null }>
  createdBy?: string
}

export interface PersistVersionResult {
  versionId: string | null
  version: number | null
  contentDigest: string
  /** true → 062 canlı değil; iz yazılamadı (çağıran response'ta gösterir). */
  schemaMissing: boolean
}

/** Yeni immutable versiyon + iddia bağlarını yazar. Versiyon numarası CAS
 *  benzeri: mevcut max+1; unique(outreach_message_id, version) yarışı 23505
 *  ile yakalanıp BİR kez yeniden denenir. Claim insert'i başarısız olursa
 *  versiyon satırı telafi amaçlı SİLİNİR (yarım artifact bırakılmaz). */
export async function persistMessageVersion(input: PersistVersionInput): Promise<PersistVersionResult> {
  const contentDigest = computeContentDigest({
    channel: input.channel,
    recipientEmail: input.recipient.email,
    subject: input.subject,
    body: input.body,
  })

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: last, error: lastErr } = await supabaseAdmin
      .from('outreach_message_versions')
      .select('version')
      .eq('outreach_message_id', input.outreachMessageId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastErr) {
      if (SCHEMA_MISSING_CODES.has(lastErr.code ?? '')) {
        return { versionId: null, version: null, contentDigest, schemaMissing: true }
      }
      throw new Error(`versiyon numarası okunamadı: ${lastErr.message}`)
    }
    const nextVersion = ((last?.version as number) ?? 0) + 1

    const { data: verRow, error: insErr } = await supabaseAdmin
      .from('outreach_message_versions')
      .insert({
        outreach_message_id: input.outreachMessageId,
        version: nextVersion,
        channel: input.channel,
        recipient_kind: input.recipient.kind,
        recipient_contact_id: input.recipient.contactId,
        recipient_email: input.recipient.email ? input.recipient.email.trim().toLowerCase() : null,
        subject: input.subject,
        body: input.body,
        content_digest: contentDigest,
        voice_rules_digest: input.voiceDigest,
        gate_ok: input.gate.ok,
        gate_digest: input.gate.digest,
        gate_violations: input.gate.violations,
        source: input.source,
        created_by: input.createdBy ?? 'system',
      })
      .select('id')
      .single()

    if (insErr) {
      if (insErr.code === '23505') continue // yarış: numara kapıldı → bir kez daha
      if (SCHEMA_MISSING_CODES.has(insErr.code ?? '')) {
        return { versionId: null, version: null, contentDigest, schemaMissing: true }
      }
      throw new Error(`mesaj versiyonu yazılamadı: ${insErr.message}`)
    }

    if (input.claims.length > 0) {
      const rows = input.claims.map((c) => ({
        message_version_id: verRow.id,
        outreach_message_id: input.outreachMessageId,
        claim_key: claimKey(c.text),
        claim_text: c.text,
        claim_category: c.category,
        evidence_id: c.evidenceId,
        evidence_type: c.evidenceType,
        evidence_source: c.evidenceSource,
      }))
      const { error: ceErr } = await supabaseAdmin.from('outreach_claim_evidence').insert(rows)
      if (ceErr) {
        // Yarım artifact bırakma: versiyonu telafiyle sil, hatayı yüzeye çıkar.
        await supabaseAdmin.from('outreach_message_versions').delete().eq('id', verRow.id)
        throw new Error(`iddia bağları yazılamadı: ${ceErr.message}`)
      }
    }

    return { versionId: verRow.id as string, version: nextVersion, contentDigest, schemaMissing: false }
  }
  throw new Error('mesaj versiyonu yazılamadı: versiyon yarışı iki denemede de kaybedildi')
}
