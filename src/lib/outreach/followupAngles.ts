// ─────────────────────────────────────────────────────────────────────────────
// Follow-up AÇI motoru (Faz 4.2 → FINALIZATION Faz 3) — mevcut metni tekrar
// kopyalamak YASAK; sahte gözlem cümlesi YASAK.
//
// Her adımın FARKLI ikna açısı vardır:
//   1 hatırlatma → 2 yeni kanıt → 3 mikro içgörü → 4 itiraz azaltma →
//   5 düşük-sürtünmeli CTA → 6 close-loop.
// Kurallar:
// - Reply veya opt-out geldiyse sequence DURUR (shouldStopSequence).
// - Suppression HER adımda fail-closed (kontrol edilemiyorsa gönderilmez).
// - FOLLOWUP_FSM_ENABLED=false iken hiçbir yol otomatik göndermez — bu modül
//   yalnız TASLAK üretir; gönderim HITL onay + mevcut send makinesinden geçer.
// - Üretilen gövde önceki gövdelerin cümlelerini KOPYALAMAZ (yapısal kontrol).
// - FINALIZATION Faz 3: kanıt yoksa "somut bir gözlem var" GİBİ SAHTE cümle
//   üretilmez; kanıtlı üretimde iddia→evidence_id bağı claims[] ile döner.
// - Her açının TAM BİR tanınan CTA'sı vardır (qualityLint CTA_PATTERNS ile
//   hizalı) — gate NO_CTA/MULTIPLE_CTA üretmez.
// ─────────────────────────────────────────────────────────────────────────────

export type FollowUpAngle =
  | 'reminder'
  | 'new_evidence'
  | 'micro_insight'
  | 'objection_reduction'
  | 'low_friction_cta'
  | 'close_loop'

export const STEP_ANGLES: Record<number, FollowUpAngle> = {
  1: 'reminder',
  2: 'new_evidence',
  3: 'micro_insight',
  4: 'objection_reduction',
  5: 'low_friction_cta',
  6: 'close_loop',
}

export interface FollowUpEvidence {
  id: string
  summary: string
}

export interface FollowUpInput {
  step: number
  businessName: string
  contactName?: string | null
  /** Bu adımda kullanılacak SPESİFİK kanıt (yeni-kanıt açısı için; id → claims bağı). */
  evidence?: FollowUpEvidence | null
  sector?: string | null
  /** Önceki gönderilmiş gövdeler — kopya kontrolü için. */
  previousBodies?: string[]
}

export interface FollowUpDraft {
  angle: FollowUpAngle
  body: string
  /** İddia→kanıt bağları (canonical artifact'e yazılır; gate bunları doğrular). */
  claims: Array<{ text: string; evidenceId: string }>
  /** true → bu adım kanıt ister ama verilmedi; taslak İDDİASIZ üretildi. */
  evidenceMissing?: boolean
}

function greet(input: FollowUpInput): string {
  return input.contactName ? `Merhaba ${input.contactName},` : 'Merhaba,'
}

// Her builder: TEK tanınan CTA (qualityLint CTA_PATTERNS) + iddia kalıbı yok
// (new_evidence hariç — orada iddia SPESİFİK kanıta bağlanır).
const BUILDERS: Record<FollowUpAngle, (i: FollowUpInput) => { body: string; claims: Array<{ text: string; evidenceId: string }> }> = {
  reminder: (i) => ({
    body: [
      greet(i),
      `${i.businessName} için geçen mesajım gözünüzden kaçmış olabilir — kısa tutuyorum.`,
      'Uygunsanız tek kelimeyle cevaplamanız yeterli.',
    ].join('\n'),
    claims: [],
  }),
  new_evidence: (i) => {
    if (i.evidence) {
      const claimSentence = `${i.businessName} tarafında yeni bir şey fark ettim: ${i.evidence.summary}`
      return {
        body: [greet(i), claimSentence, 'İsterseniz kısa bir görüşmede üzerinden geçelim mi?'].join('\n'),
        claims: [{ text: claimSentence, evidenceId: i.evidence.id }],
      }
    }
    // Kanıt YOK → sahte "somut gözlem var" cümlesi ÜRETİLMEZ; dürüst ek-not dili.
    return {
      body: [
        greet(i),
        `${i.businessName} için önceki notuma küçük bir ek yapmak istedim; konuyu sizin tarafınızdan da duymak isterim.`,
        'İsterseniz kısa bir görüşmede üzerinden geçelim mi?',
      ].join('\n'),
      claims: [],
    }
  },
  micro_insight: (i) => ({
    body: [
      greet(i),
      `${i.sector ?? 'Sektörünüz'} tarafında sık gördüğüm küçük bir nokta: ilk temas kanalında hız, kararın en belirleyici parçası oluyor.`,
      `${i.businessName} için bunu 2 cümlede nasıl uygularız, yazayım mı?`,
    ].join('\n'),
    claims: [],
  }),
  objection_reduction: (i) => ({
    body: [
      greet(i),
      'Genelde bu noktada “şu an önceliğimiz değil” cevabı gelir — gayet anlaşılır.',
      `${i.businessName} için önerim zaten büyük bir taahhüt değil; mevcut düzeninizi bozmayan küçük bir başlangıç.`,
      'Yanlış zamansa tek kelime "sonra" yazmanız yeterli.',
    ].join('\n'),
    claims: [],
  }),
  low_friction_cta: (i) => ({
    body: [
      greet(i),
      `${i.businessName} için hazırladığım kısa notu tek mesajda özetleyebilirim.`,
      'Cevaben sadece "1" yazmanız yeterli — gerisini ben toparlayayım.',
    ].join('\n'),
    claims: [],
  }),
  close_loop: (i) => ({
    body: [
      greet(i),
      `Bu, ${i.businessName} için son mesajım — takibi burada kapatıyorum.`,
      'İleride ihtiyaç olursa bu e-postaya kısaca cevaplamanız yeterli. Sağlıklı günler dilerim.',
    ].join('\n'),
    claims: [],
  }),
}

function sentences(s: string): string[] {
  return s
    .split(/[.!?\n]+/)
    .map((x) => x.trim().toLowerCase())
    // Selamlama satırı her adımda doğal olarak tekrar eder — kopya sayılmaz.
    .filter((x) => x.length > 20 && !x.startsWith('merhaba'))
}

/** SAF üretim: adım → açıya özgü gövde; önceki gövdelerden cümle KOPYALAMAZ. */
export function buildFollowUpDraft(input: FollowUpInput): FollowUpDraft {
  const angle = STEP_ANGLES[input.step] ?? 'close_loop'
  const built = BUILDERS[angle](input)

  // Kopya kontrolü: önceki gövdelerin cümleleri yeni gövdede geçemez.
  const prev = new Set((input.previousBodies ?? []).flatMap(sentences))
  const overlap = sentences(built.body).filter((s) => prev.has(s))
  if (overlap.length > 0) {
    // Deterministik şablonlar açı-başına farklıdır; çakışma ancak aynı açı
    // tekrar üretildiyse olur → close_loop'a düş (asla birebir tekrar yok).
    const fallback = BUILDERS.close_loop(input)
    return { angle: 'close_loop', body: fallback.body, claims: fallback.claims }
  }

  return {
    angle,
    body: built.body,
    claims: built.claims,
    evidenceMissing: angle === 'new_evidence' && !input.evidence ? true : undefined,
  }
}

export interface StopDecision {
  stop: boolean
  reason: 'inbound_reply' | 'opt_out' | null
  /** true → bu adım suppression nedeniyle GÖNDERİLEMEZ (sequence durmayabilir ama adım bloklu). */
  stepBlocked: boolean
  blockReason: string | null
}

/**
 * SAF karar: reply/opt-out → sequence DURUR; suppression → adım fail-closed bloklu.
 * suppressionCheckFailed=true (kontrol edilemedi) da BLOK sayılır (fail-closed).
 */
export function shouldStopSequence(input: {
  hasInboundReply: boolean
  optedOut: boolean
  suppressed: boolean
  suppressionCheckFailed?: boolean
}): StopDecision {
  if (input.optedOut) return { stop: true, reason: 'opt_out', stepBlocked: true, blockReason: 'opt_out' }
  if (input.hasInboundReply) return { stop: true, reason: 'inbound_reply', stepBlocked: true, blockReason: 'inbound_reply' }
  if (input.suppressed || input.suppressionCheckFailed) {
    return { stop: false, reason: null, stepBlocked: true, blockReason: input.suppressed ? 'suppression' : 'suppression_check_failed' }
  }
  return { stop: false, reason: null, stepBlocked: false, blockReason: null }
}
