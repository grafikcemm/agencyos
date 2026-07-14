// Proposal Builder — bir lead + seçilen hizmetlerden teklif taslağı üretir.
// Callers (future): LeadDrawer Teklif Oluştur butonu, LeadModal, ProposalView (Phase 2).
// No existing proposal* file (Glob boş). Saf hesaplama; date format: ISO 8601.

import { Lead, Proposal, ProposalStatus } from './types'
import { findOfferById } from './offers'
import { matchSectorProfile } from './sectorPriority'
import { detectClaims } from './outreach/qualityLint'

// FINALIZATION Faz 4: teklif metni CANONICAL outbound gate'ten mocksuz geçer.
// - salesPromise (kanıtsız yüzde/süre/sonuç vaatleri) OUTBOUND metne GİRMEZ —
//   ölçülebilir sonuç yalnız bağlı evidence ile yazılabilir; varsayılan dil
//   DOĞRULANABİLİR süreç/çıktı dilidir.
// - E-posta gövdesi ETK opt-out satırı taşır; her metinde TEK tanınan CTA vardır.
const PROPOSAL_OPT_OUT = 'Bu tür e-postaları almak istemiyorsanız "ret" yazarak yanıtlamanız yeterlidir.'

/** Kanıt bağı olmadan iddia taşıyan cümleler teklife GİRMEZ (fail-closed). */
function claimFree(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  if (!t) return null
  return detectClaims(t).length === 0 ? t : null
}

export type ProposalTone = 'samimi' | 'kurumsal'

export interface BuildProposalInput {
  lead: Partial<Lead> & { id: string; business_name: string }
  offerIds: string[]
  problemOverride?: string
  /** Mesaj tonu — 'samimi' (KOBİ/esnaf) veya 'kurumsal' (klinik/şirket). Varsayılan: samimi. */
  tone?: ProposalTone
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n)
}

function deriveProblem(lead: Partial<Lead>, fallback: string): string {
  if (lead.pain_points && lead.pain_points.length) {
    // Kanıtsız iddia kalıbı taşıyan pain-point cümleleri metne alınmaz.
    const safe = lead.pain_points.map((p) => claimFree(p)).filter((p): p is string => Boolean(p))
    if (safe.length) return safe.join('; ')
  }
  const profile = matchSectorProfile(lead.sector)
  return fallback || profile.primaryNeed
}

function buildSolutionText(offerNames: string[], lead: Partial<Lead>): string {
  const profile = matchSectorProfile(lead.sector)
  const intro = `${profile.displayName} için, mevcut akışınıza entegre 3 katmanlı bir çözüm öneriyoruz:`
  const list = offerNames.map((n, i) => `${i + 1}. ${n}`).join('\n')
  return `${intro}\n${list}`
}

function maxDeliveryDays(deliveryDays: number[]): number {
  return deliveryDays.length ? Math.max(...deliveryDays) : 14
}

interface DraftCore {
  clientName: string
  problem: string
  solution: string
  services: Proposal['services']
  setupPrice: number
  monthlyPrice: number
  timeline: string
  scope: string[]
  expectedOutcome: string
  nextStep: string
  tone: ProposalTone
  /** Lead'in doğrulanmış sıkıntısı — kişiselleştirilmiş açılış için. */
  whyNow: string | null
}

function buildWhatsappText(p: DraftCore): string {
  const lines: string[] = []
  if (p.tone === 'kurumsal') {
    lines.push(`Sayın ${p.clientName} yetkilisi,`)
  } else {
    lines.push(`Merhaba ${p.clientName},`)
  }
  lines.push('')
  // Kanıt-temelli kişiselleştirme: lead'in gerçek sıkıntısıyla aç.
  if (p.whyNow) {
    lines.push(p.whyNow)
    lines.push('')
  }
  lines.push('Konuştuğumuz noktalardan yola çıkarak şu çözümü öneriyoruz:')
  for (const s of p.services) lines.push(`• ${s.offerName}`)
  lines.push('')
  lines.push(`Kurulum: ${formatCurrency(p.setupPrice)}`)
  if (p.monthlyPrice > 0) lines.push(`Aylık: ${formatCurrency(p.monthlyPrice)}`)
  lines.push(`Kurulum süresi: ${p.timeline}`)
  lines.push('')
  lines.push(`Teslimat çerçevesi: ${p.expectedOutcome}`)
  lines.push('')
  lines.push(p.tone === 'kurumsal'
    ? 'Detayları görüşmek üzere uygun olduğunuz bir zamanı iletmenizi rica ederiz.'
    : 'Detayları görüşmek için uygun olduğunuz bir zamanı paylaşır mısınız?')
  return lines.join('\n')
}

function buildEmailText(p: DraftCore): string {
  const lines: string[] = []
  lines.push(`Sayın ${p.clientName} yetkilisi,`)
  lines.push('')
  lines.push('Görüşmemizin ardından tespit ettiğimiz ihtiyacı ve önerdiğimiz çözümü aşağıda paylaşıyoruz.')
  lines.push('')
  lines.push('İhtiyaç / Problem')
  lines.push(p.problem)
  lines.push('')
  lines.push('Önerilen Çözüm')
  lines.push(p.solution)
  lines.push('')
  lines.push('Kapsam')
  for (const item of p.scope) lines.push(`• ${item}`)
  lines.push('')
  lines.push('Yatırım')
  lines.push(`• Kurulum (tek seferlik): ${formatCurrency(p.setupPrice)}`)
  if (p.monthlyPrice > 0) lines.push(`• Aylık: ${formatCurrency(p.monthlyPrice)}`)
  lines.push(`• Kurulum süresi: ${p.timeline}`)
  lines.push('')
  lines.push('Teslimat Çerçevesi')
  lines.push(p.expectedOutcome)
  lines.push('')
  lines.push('Sonraki Adım')
  lines.push(p.nextStep)
  lines.push('')
  lines.push('Saygılarımızla.')
  lines.push('')
  // ETK/İYS: e-posta kanalı opt-out zorunlu (gate MISSING_OPT_OUT).
  lines.push(PROPOSAL_OPT_OUT)
  return lines.join('\n')
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d.getTime())
  c.setDate(c.getDate() + days)
  return c
}

export function buildProposal(input: BuildProposalInput): Proposal {
  const { lead, offerIds, problemOverride, tone = 'samimi' } = input
  const offers = offerIds
    .map(id => findOfferById(id))
    .filter((o): o is NonNullable<ReturnType<typeof findOfferById>> => !!o)

  const services: Proposal['services'] = offers.map(o => ({
    offerId: o.id,
    offerName: o.name,
    setupPrice: o.setupPrice,
    monthlyPrice: o.monthlyPrice,
  }))

  const setupPrice = services.reduce((s, o) => s + o.setupPrice, 0)
  const monthlyPrice = services.reduce((s, o) => s + o.monthlyPrice, 0)
  const deliveryDays = maxDeliveryDays(offers.map(o => o.deliveryDays))

  const problem = problemOverride || deriveProblem(lead, '')
  const solution = buildSolutionText(offers.map(o => o.name), lead)

  const scope: string[] = []
  for (const o of offers) {
    for (const item of o.checklist.slice(0, 2)) scope.push(`${o.name}: ${item}`)
  }

  // FINALIZATION Faz 4: salesPromise OUTBOUND metne GİRMEZ (kanıtsız sonuç
  // vaadi). Beklenen sonuç = doğrulanabilir SÜREÇ/ÇIKTI dili: neyin teslim
  // edileceği + sürecin nasıl yürüyeceği.
  const expectedOutcome =
    `${offers.map((o) => o.name).join(', ')} teslim edilir; ` +
    'her aşama önceden yazılı olarak netleştirilir ve ilerleme size raporlanır.'
  const timeline = `${deliveryDays} iş günü`
  // TEK tanınan CTA (kickoff cümlesi bilgi, soru CTA'dır).
  const nextStep = 'Uygunsanız 15 dakikada birlikte üzerinden geçelim mi?'

  const now = new Date()
  const followUpAt = addDays(now, 2).toISOString()

  const draft: DraftCore = {
    clientName: lead.business_name,
    problem,
    solution,
    services,
    setupPrice,
    monthlyPrice,
    timeline,
    scope,
    expectedOutcome,
    nextStep,
    tone,
    whyNow: claimFree(lead.why_now),
  }

  const whatsappText = buildWhatsappText(draft)
  const emailText = buildEmailText(draft)

  const status: ProposalStatus = 'draft'

  return {
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    leadId: lead.id,
    clientName: lead.business_name,
    services,
    problem,
    solution,
    scope,
    setupPrice,
    monthlyPrice,
    timeline,
    expectedOutcome,
    nextStep,
    whatsappText,
    emailText,
    createdAt: now.toISOString(),
    followUpAt,
    status,
  }
}
