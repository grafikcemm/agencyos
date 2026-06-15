// Pipeline gatekeeper — saf doğrulama. Bir lead "proposal" (teklif) aşamasına
// geçmeden önce discovery alanları (pain_point + decision_maker + budget_band)
// dolu olmalı. Araştırma: nitelenmemiş lead teklif aşamasına girmemeli.

export const BUDGET_BANDS = ['<20k', '20-40k', '40-80k', '80k+'] as const
export type BudgetBand = (typeof BUDGET_BANDS)[number]

export interface DiscoveryFields {
  pain_point?: string | null
  decision_maker?: string | null
  budget_band?: string | null
}

export const PROPOSAL_REQUIRED_FIELDS: (keyof DiscoveryFields)[] = [
  'pain_point',
  'decision_maker',
  'budget_band',
]

const FIELD_LABELS: Record<keyof DiscoveryFields, string> = {
  pain_point: 'Acı noktası',
  decision_maker: 'Karar verici',
  budget_band: 'Bütçe bandı',
}

function isFilled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** Teklif aşaması için eksik discovery alanlarının anahtarlarını döner. */
export function missingProposalFields(lead: DiscoveryFields): (keyof DiscoveryFields)[] {
  return PROPOSAL_REQUIRED_FIELDS.filter((key) => !isFilled(lead[key]))
}

export function canEnterProposal(lead: DiscoveryFields): boolean {
  return missingProposalFields(lead).length === 0
}

/** Eksik alanlar için Türkçe, operatör dostu mesaj. */
export function proposalGateMessage(missing: (keyof DiscoveryFields)[]): string {
  const labels = missing.map((k) => FIELD_LABELS[k]).join(', ')
  return `Teklif aşamasına geçmek için önce şu discovery alanları doldurulmalı: ${labels}.`
}
