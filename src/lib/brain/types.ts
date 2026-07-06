// Brain v2 — ortak tipler (plan §4-§13). Kanonik run/step modeliyle (mig 038)
// hizalı; permission scopes/risk/sensitivity (mig 038 agent_tasks sütunları) taşır.

export type RunMode = 'shadow' | 'active'

export type Archetype =
  | 'orchestrator'
  | 'router'
  | 'executor'
  | 'specialist'
  | 'critic'
  | 'judge'
  | 'researcher'

export type ModelTier = 'light' | 'medium' | 'heavy'

// İzin sınıfı — tek eylem sınıfı; permission_scopes[] bundan türetilir (§13).
export type PermissionClass = 'read' | 'write' | 'external' | 'spend'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'secret'

export interface Goal {
  rawInput: string
  channel: string
  // Niyet + başarı kriteri (yapılandırılmış). intent mevcut sınıflandırıcıdan gelir.
  intent: string
  route: 'business' | 'life' | 'system'
  successCriteria: string[]
  constraints: string[]
  budgetUsdMax: number | null
  trivial: boolean
}

export interface PlanStep {
  id: string
  title: string
  archetype: Archetype
  skillSlug: string | null
  tier: ModelTier
  dependsOn: string[]
  permissionScopes: string[]
  permissionClass: PermissionClass
  riskLevel: RiskLevel
  dataSensitivity: DataSensitivity
  /**
   * Adımın kendi handler girdisi (ör. lead.score_deterministic için { evidence }).
   * Handler'lar Goal değil adım-özel veri bekler; alan yokken goal geçirilirse
   * arg-uyuşmazlığı step'i 'error' yapar (güvenli ama işlevsiz).
   */
  input?: unknown
}

export interface GateDecision {
  stepId: string
  permissionClass: PermissionClass
  auto: boolean // true → otomatik yürütülebilir (yalnız güvenli read); false → onay gerekir
  reason: string
}

// Shadow modun çıktısı — HİÇBİR write/dış-çağrı yok; yalnız "would-do" kaydı.
export interface BrainShadowResult {
  mode: 'shadow'
  goal: Goal
  steps: PlanStep[]
  order: string[]
  gates: GateDecision[]
  wouldExecute: string[] // auto (read) adım id'leri
  wouldRequestApproval: string[] // write/external/spend adım id'leri
  notes: string[]
}
