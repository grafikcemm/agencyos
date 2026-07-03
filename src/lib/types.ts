// AgencyOS — core domain types
// Bu dosya mevcut Lead şeklini (business_name, potential_score, vb.) kırmaz;
// yeni v2 alanlarını opsiyonel olarak ekler. Eski sayfalar çalışmaya devam eder.

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'responded'
  | 'meeting'
  | 'proposal'
  | 'converted'
  | 'lost'
  | 'waiting'

export type OfferCategory = 'revenue' | 'operations' | 'creative'

export type Difficulty = 'low' | 'medium' | 'high'

export type Priority = 'low' | 'normal' | 'high'

// Müşteri (ihtiyaç) kategorisi — "bu işletme NEDEN hedefimiz, hangi tasarım
// hizmetini satmalıyız" boyutu. lead_tier (A/B/C/D) kalite boyutuna DİKTİR.
// AI hizmeti yalnız 'otomasyon_fit' kategorisinde önerilir; varsayılan değil.
export type CustomerCategory =
  | 'web_yok'        // web sitesi yok / sadece Instagram → Web Tasarım
  | 'web_kotu'       // site var ama tasarım/kalite zayıf → Web Yenileme
  | 'donusum_dusuk'  // reklam var ama dönüşüm hunisi yok → Landing/UX (nadir)
  | 'marka_daginik'  // düşük puan + az yorum → Marka Kimliği
  | 'sosyal_zayif'   // site var ama sosyal medya zayıf → Sosyal Medya Tasarımı
  | 'otomasyon_fit'  // esnaf + WhatsApp/randevu yok → AI Satış Asistanı
  | 'genel_tasarim'  // fallback → Sosyal Medya / Görsel Tasarım (asla AI değil)

// Web sitesi kalite bandı — 'none' (site yok/ölü), 'poor' (var ama kötü), 'ok'.
export type WebsiteQualityBand = 'none' | 'poor' | 'ok'

export interface LeadScoreBreakdown {
  sectorFit: number
  budgetPotential: number
  painIntensity: number
  digitalMaturity: number
  offerFit: number
  urgency: number
  accessibility: number
  trustSignals: number
  total: number
}

export interface ScoreReason {
  label: string
  delta: number
  category: keyof Omit<LeadScoreBreakdown, 'total'>
}

export interface RecommendedOffer {
  offerId: string
  offerName: string
  reason: string
  setupPrice: number
  monthlyPrice: number
  annualValue: number
  difficulty: Difficulty
  salesAngle: string
  firstMessage: string
  antiPattern?: string
}

export interface FollowUpStep {
  day: number
  channel: 'whatsapp' | 'email' | 'phone' | 'instagram' | 'linkedin'
  message: string
}

export interface Lead {
  id: string
  business_name: string
  sector: string
  city: string
  district?: string | null
  status: LeadStatus | string
  potential_score: number
  phone?: string | null
  website?: string | null
  email?: string | null
  // NOT: whatsapp/instagram (string) leads tablosuna YAZILMAZ — cosmetic/legacy
  // görünüm alanları. Kanal sinyali için persisted has_whatsapp / instagram_as_site
  // (boolean) kullanılır. Migration 024 bunlar için kolon açmaz.
  whatsapp?: string | null
  instagram?: string | null
  priority?: Priority | string
  created_at: string
  updated_at?: string
  last_contact_at?: string | null
  next_follow_up_at?: string | null
  stage_entered_at?: string | null

  // Geo
  city_slug?: string | null
  google_place_id?: string | null

  // Google signals
  rating?: number | null
  review_count?: number

  // Digital presence signals (evidenceEngine)
  has_website?: boolean
  has_real_website?: boolean
  has_whatsapp?: boolean
  has_form?: boolean
  has_online_booking?: boolean
  has_ecommerce?: boolean
  has_ads_signal?: boolean
  instagram_as_site?: boolean
  has_job_signal?: boolean
  branch_count?: number

  // Müşteri (ihtiyaç) kategorisi — tasarım-odaklı sınıflandırma (migration 031).
  customer_category?: CustomerCategory | string | null
  website_quality_band?: WebsiteQualityBand | string | null
  category_reasons?: string[]
  has_social_link?: boolean

  // V3 scoring sub-scores
  evidence_score?: number
  fit_score?: number
  urgency_score?: number
  money_score?: number
  contactability_score?: number
  confidence?: number

  // RISK skoru + hot-lead yönlendirme (migration 019)
  base_score?: number
  risk_score?: number
  risk_reasons?: { reason: string; points: number }[]
  behavioral_flags?: Record<string, boolean> | null
  route?: 'manual_hyper_personalization' | 'personalized_sequence' | 'nurture' | 'skip' | null

  // Discovery alanları — 'proposal' aşaması gatekeeper'ı (migration 020)
  pain_point?: string | null
  decision_maker?: string | null
  budget_band?: string | null

  estimated_ticket_size?: 'low' | 'mid' | 'high' | 'premium'
  pain_points?: string[]

  // computed: alt-skorların (evidence_score, fit_score, …) toplu görünümü;
  // leads tablosunda kolon DEĞİL, runtime'da türetilir.
  scores?: LeadScoreBreakdown
  score_reasons?: ScoreReason[] | { reason: string; points: number }[]

  // Sales intelligence (evidenceEngine)
  why_now?: string | null
  pain_signals?: string[]
  proof_points?: string[]
  disqualification_reason?: string | null
  recommended_offer_id?: string | null
  recommended_offer_name?: string | null
  next_best_action?: string | null

  recommended_offers?: RecommendedOffer[]
  estimated_setup_value?: number
  estimated_monthly_value?: number

  next_action?: string
  sales_angle?: string
  first_message?: string
  follow_up_plan?: FollowUpStep[]

  // Quality engine (006)
  quality_score?: number
  conversion_probability?: number
  money_potential_score?: number
  pain_intensity_score?: number
  agency_fit_score?: number
  confidence_score?: number
  lead_tier?: 'A' | 'B' | 'C' | 'D' | string | null
  quality_label?: string | null
  qualification_reasons?: string[]
  conversion_angle?: string | null
  why_this_will_convert?: string | null
  expected_offer_value_tl?: number
  expected_monthly_value_tl?: number
  best_channel?: string | null
  first_30_seconds_pitch?: string | null
  objection_risks?: string[]
  next_action_priority?: string | null
  normalized_sector?: string | null
  district_slug?: string | null
  last_quality_scored_at?: string | null

  // Enrichment lifecycle
  enrichment_status?: string | null
  last_enriched_at?: string | null

  // NOT: leads.source kolonu yok — tarama kaynağı scan_runs.source'a yazılır.
  // Bu alan UI/tip kolaylığı içindir, leads satırına persist edilmez.
  source?: string
  ai_analysis?: string
  notes?: string
  latitude?: number | null
  longitude?: number | null
}

export interface Offer {
  id: string
  name: string
  category: OfferCategory
  description: string
  targetSectors: string[]
  excludedSectors?: string[]
  problemSolved: string
  setupPrice: number
  monthlyPrice: number
  deliveryDays: number
  difficulty: Difficulty
  salesPromise: string
  antiPatterns: string[]
  checklist: string[]
  upsells: string[]
}

// ── Lead Intelligence v2: kanonik hizmet kataloğu (read model) ──────────────
// Yapı kodda yaşar (src/lib/services/catalog.ts); DB yalnız fiyat/aktiflik override'ı tutar.

export type ServiceDomain = 'tasarim' | 'ai_otomasyon' | 'hibrit'

export type EvidenceKind =
  | 'pagespeed'
  | 'screenshot'
  | 'html_signal'
  | 'cta_analysis'
  | 'form_analysis'
  | 'tech_stack'
  | 'review_signal'
  | 'places_data'

export interface ServiceFamily {
  id: string
  domain: ServiceDomain
  name: string
}

export interface ServicePackage {
  slug: string // kanonik, kebab-case, PK
  familyId: string
  name: string
  description: string
  defaultSetupPriceTl: number
  defaultMonthlyPriceTl: number
  deliveryDays: number
  difficulty: Difficulty
  // Kanıtsız %/ROI vaadi YASAK — catalog.test.ts regex ile lint'ler.
  salesCopy: {
    promise: string
    antiPatterns: string[]
    checklist: string[]
  }
  // Offer Matcher: bu türlerden en az biri doğrulanmış kanıt olarak mevcutsa paket önerilebilir.
  requiredEvidenceKinds: EvidenceKind[]
  targetSectors: string[]
  upsellSlugs: string[]
  legacyOfferIds: string[] // offers.ts id'leri (compatibility adapter, salt-okunur)
  legacyPlaybookNames: string[] // playbooks tablosu / seed adları
}

// Toplanan tek kanıt parçası (lead_evidence satırının bellek karşılığı).
export interface EvidenceItem {
  kind: EvidenceKind
  source: 'psi_v5' | 'html_fetch' | 'google_places'
  url: string | null
  summary: string
  payload: Record<string, unknown>
  confidence: number // 0-1
  verified: boolean
  // Yalnız kind='screenshot': persist ÖNCESİ geçici base64 — satıra asla yazılmaz,
  // evidenceStore Storage'a yükleyip storage_path'e çevirir.
  screenshot?: { mime: string; base64: string }
}

// Konsey koşusu sonucu (lead_assessments satırının bellek karşılığı).
export interface LeadAssessmentSummary {
  id: string
  lead_id: string | null
  run_date: string
  mode: 'council' | 'deterministic'
  shadow: boolean
  selected: boolean
  design_score: number | null
  ai_score: number | null
  evidence_count: number
  verified_evidence_count: number
  chair_verdict: Record<string, unknown> | null
  cost_usd: number
}

// Panelden düzenlenebilen tek katman (service_catalog tablosu satırı).
export interface ServiceCatalogOverride {
  slug: string
  setup_price_override_tl: number | null
  monthly_price_override_tl: number | null
  active: boolean
}

// Merge edilmiş görünüm: kod default'ları + DB override.
export interface ResolvedServicePackage extends ServicePackage {
  domain: ServiceDomain
  familyName: string
  setupPriceTl: number
  monthlyPriceTl: number
  active: boolean
}

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export interface Proposal {
  id: string
  leadId: string
  clientName: string
  services: { offerId: string; offerName: string; setupPrice: number; monthlyPrice: number }[]
  problem: string
  solution: string
  scope: string[]
  setupPrice: number
  monthlyPrice: number
  timeline: string
  expectedOutcome: string
  nextStep: string
  whatsappText: string
  emailText: string
  createdAt: string
  followUpAt: string
  status: ProposalStatus
}

export type PaymentStatus = 'pending' | 'paid' | 'overdue'
export type ClientHealth = 'good' | 'neutral' | 'risk'
export type RiskLevel = 'low' | 'medium' | 'high'

export interface ProjectTask {
  id: string
  label: string
  done: boolean
}

export interface Project {
  id: string
  leadId?: string
  clientName: string
  services: { offerId: string; offerName: string }[]
  setupRevenue: number
  monthlyRevenue: number
  totalValue: number
  paymentStatus: PaymentStatus
  dueDate?: string
  deliveryDate?: string
  stage: string
  tasks: ProjectTask[]
  clientHealth: ClientHealth
  riskLevel: RiskLevel
  nextAction: string
  upsellSuggestion?: string
}

export type CouncilVerdict = 'continue' | 'pause' | 'reject' | 'needs_more_data'

export interface CouncilAgentOpinions {
  strategy: string
  risk: string
  operations: string
  growth: string
  chairman: string
}

export interface CouncilDecision {
  id: string
  topic: string
  context: string
  verdict: CouncilVerdict
  confidence: number
  recommendedAction: string
  risks: string[]
  requiredData: string[]
  nextSteps: string[]
  vetoReason?: string
  agentOpinions: CouncilAgentOpinions
  createdAt: string
  outcome?: string
}
