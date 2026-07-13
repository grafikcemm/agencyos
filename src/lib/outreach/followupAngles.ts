// ─────────────────────────────────────────────────────────────────────────────
// Follow-up AÇI motoru (Faz 4.2) — mevcut metni tekrar kopyalamak YASAK.
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

export interface FollowUpInput {
  step: number
  businessName: string
  contactName?: string | null
  /** Bu adımda kullanılacak SPESİFİK kanıt cümlesi (yeni kanıt açısı için zorunlu). */
  evidenceSnippet?: string | null
  sector?: string | null
  /** Önceki gönderilmiş gövdeler — kopya kontrolü için. */
  previousBodies?: string[]
}

export interface FollowUpDraft {
  angle: FollowUpAngle
  body: string
  /** true → bu adım kanıt ister ama verilmedi; taslak İDDİASIZ üretildi. */
  evidenceMissing?: boolean
}

function greet(input: FollowUpInput): string {
  return input.contactName ? `Merhaba ${input.contactName},` : 'Merhaba,'
}

const BUILDERS: Record<FollowUpAngle, (i: FollowUpInput) => string> = {
  reminder: (i) =>
    [
      greet(i),
      `${i.businessName} için geçen mesajım gözünüzden kaçmış olabilir — kısa tutuyorum.`,
      'Uygun bir an olduğunda tek cümlelik bir dönüş yeterli.',
    ].join('\n'),
  new_evidence: (i) =>
    [
      greet(i),
      i.evidenceSnippet
        ? `${i.businessName} tarafında yeni bir şey fark ettim: ${i.evidenceSnippet}`
        : `${i.businessName} tarafına tekrar baktım; paylaşmak istediğim somut bir gözlem var.`,
      'İsterseniz kısa bir görüşme ile üzerinden geçelim mi?',
    ].join('\n'),
  micro_insight: (i) =>
    [
      greet(i),
      `${i.sector ?? 'Sektörünüz'} tarafında sık gördüğüm küçük bir nokta: ilk temas kanalında hız, dönüşümün en belirleyici parçası oluyor.`,
      `${i.businessName} için bunu 2 cümlede nasıl uygularız, yazayım mı?`,
    ].join('\n'),
  objection_reduction: (i) =>
    [
      greet(i),
      'Genelde bu noktada “şu an önceliğimiz değil” cevabı gelir — gayet anlaşılır.',
      `${i.businessName} için önerim zaten büyük bir taahhüt değil; mevcut akışınızı bozmayan küçük bir başlangıç.`,
      'Yanlış zamansa tek kelime "sonra" yazmanız yeterli.',
    ].join('\n'),
  low_friction_cta: (i) =>
    [
      greet(i),
      `${i.businessName} için hazırladığım kısa notu tek mesajda özetleyebilirim.`,
      'Cevaben sadece "1" yazmanız yeterli — gerisini ben toparlayayım.',
    ].join('\n'),
  close_loop: (i) =>
    [
      greet(i),
      `Bu, ${i.businessName} için son mesajım — takibi burada kapatıyorum.`,
      'İleride ihtiyaç olursa bu e-posta üzerinden bana her zaman ulaşabilirsiniz. Sağlıklı günler dilerim.',
    ].join('\n'),
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
  const body = BUILDERS[angle](input)

  // Kopya kontrolü: önceki gövdelerin cümleleri yeni gövdede geçemez.
  const prev = new Set((input.previousBodies ?? []).flatMap(sentences))
  const overlap = sentences(body).filter((s) => prev.has(s))
  if (overlap.length > 0) {
    // Deterministik şablonlar açı-başına farklıdır; çakışma ancak aynı açı
    // tekrar üretildiyse olur → close_loop'a düş (asla birebir tekrar yok).
    return { angle: 'close_loop', body: BUILDERS.close_loop(input) }
  }

  return {
    angle,
    body,
    evidenceMissing: angle === 'new_evidence' && !input.evidenceSnippet ? true : undefined,
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
