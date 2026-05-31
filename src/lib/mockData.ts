// Mock data — DB boşken/empty state'te kullanılacak örnek lead'ler.
// Phase 2-3'te empty fallback olarak çağrılır. Skor & öneriler lazy hesaplanır.
// No existing mockData* file (Glob boş). Date format: ISO 8601.

import { Lead } from './types'
import { calculateLeadScore } from './leadScoring'
import { recommendOffersForLead, estimateLeadValue } from './offerMatching'
import { computeNextAction } from './nextActionEngine'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

const baseLeads: Partial<Lead>[] = [
  {
    id: 'mock-1',
    business_name: 'Dentora Estetik Klinik',
    sector: 'diş kliniği',
    city: 'İstanbul',
    district: 'Şişli',
    status: 'new',
    phone: '+90 212 555 0101',
    website: 'https://dentora.example.com',
    rating: 4.6,
    review_count: 312,
    has_website: true,
    has_whatsapp: true,
    has_form: true,
    has_online_booking: true,
    has_ads_signal: true,
    branch_count: 3,
    estimated_ticket_size: 'premium',
    pain_points: ['Hasta adaylarına geç dönüş', 'Eski hasta listesi pasif'],
    created_at: daysAgo(2),
    stage_entered_at: daysAgo(2),
  },
  {
    id: 'mock-2',
    business_name: 'Sigorta24 Acente',
    sector: 'sigorta',
    city: 'Ankara',
    district: 'Çankaya',
    status: 'contacted',
    phone: '+90 312 555 0202',
    has_whatsapp: true,
    has_form: true,
    rating: 4.4,
    review_count: 89,
    branch_count: 2,
    has_website: true,
    estimated_ticket_size: 'high',
    pain_points: ['Yenileme takipleri unutuluyor'],
    created_at: daysAgo(8),
    stage_entered_at: daysAgo(6),
    last_contact_at: daysAgo(5),
  },
  {
    id: 'mock-3',
    business_name: 'Glow Beauty Salon',
    sector: 'güzellik salonu',
    city: 'İzmir',
    district: 'Karşıyaka',
    status: 'new',
    phone: '+90 232 555 0303',
    rating: 4.7,
    review_count: 142,
    has_whatsapp: true,
    has_website: false,
    has_online_booking: false,
    branch_count: 1,
    created_at: daysAgo(4),
    stage_entered_at: daysAgo(4),
  },
  {
    id: 'mock-4',
    business_name: 'Aksu Emlak & Proje',
    sector: 'gayrimenkul',
    city: 'İstanbul',
    district: 'Beşiktaş',
    status: 'proposal',
    phone: '+90 212 555 0404',
    has_website: true,
    has_whatsapp: true,
    has_form: true,
    has_ads_signal: true,
    branch_count: 4,
    rating: 4.5,
    review_count: 198,
    estimated_ticket_size: 'premium',
    created_at: daysAgo(20),
    stage_entered_at: daysAgo(7),
    last_contact_at: daysAgo(7),
  },
  {
    id: 'mock-5',
    business_name: 'TrendKozmetik Online',
    sector: 'e-ticaret',
    city: 'İstanbul',
    status: 'responded',
    has_website: true,
    has_ecommerce: true,
    has_ads_signal: true,
    has_whatsapp: true,
    branch_count: 1,
    rating: 4.3,
    review_count: 540,
    created_at: daysAgo(6),
    stage_entered_at: daysAgo(1),
    last_contact_at: daysAgo(1),
  },
  {
    id: 'mock-6',
    business_name: 'Yıldız Otomotiv Servis',
    sector: 'oto servis',
    city: 'Bursa',
    status: 'new',
    phone: '+90 224 555 0606',
    has_website: true,
    has_form: false,
    has_whatsapp: false,
    rating: 4.1,
    review_count: 56,
    branch_count: 2,
    created_at: daysAgo(1),
    stage_entered_at: daysAgo(1),
  },
]

function enrich(lead: Partial<Lead>): Lead {
  const { scores, reasons, priority } = calculateLeadScore(lead)
  const recommended = recommendOffersForLead(lead, 3)
  const value = estimateLeadValue(lead)
  const action = computeNextAction(lead)

  return {
    ...lead,
    id: lead.id || `mock-${Math.random().toString(36).slice(2, 8)}`,
    business_name: lead.business_name || 'Unknown',
    sector: lead.sector || 'other',
    city: lead.city || '',
    status: lead.status || 'new',
    potential_score: scores.total,
    priority,
    created_at: lead.created_at || new Date().toISOString(),
    scores,
    score_reasons: reasons,
    recommended_offers: recommended,
    estimated_setup_value: value.setup,
    estimated_monthly_value: value.monthly,
    next_action: action.label,
    sales_angle: recommended[0]?.salesAngle,
    first_message: recommended[0]?.firstMessage,
  }
}

export const MOCK_LEADS: Lead[] = baseLeads.map(enrich)

export function getMockLeads(): Lead[] {
  return MOCK_LEADS
}
