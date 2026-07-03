// Skill/Agent registry tipleri (Faz 2, plan §6-§10). DB+kod hibrit: yapı KODDA
// (typed, testable, versiyonlu), enable/fiyat/override DB'de (skills tablosu, mig 041).
// service_catalog deseninin aynısı: kod = kaynak-of-truth, DB = override.

import type { ModelTier, PermissionClass, RiskLevel, DataSensitivity } from '../brain/types'

export type SkillKind = 'deterministic' | 'llm' | 'composite'

// Basit alan tanımlayıcı (JSONB input_schema/output_schema karşılığı). Tam zod
// doğrulaması handler yürütülürken (Faz 3) yapılır; burada yapı + benzersizlik yeter.
export type FieldSpec = Record<string, string>

export interface SkillManifest {
  slug: string
  team: string
  name: string
  summary: string // ≤120, benzersiz amaç (§10.1)
  kind: SkillKind
  permissionScopes: string[]
  riskLevel: RiskLevel
  dataSensitivity: DataSensitivity
  inputSchema: FieldSpec
  outputSchema: FieldSpec
  defaultTier: ModelTier
  budgetUsdMax: number
  timeoutMs: number
  evalSlug: string // gerçek eval_case slug'ı (§10.1 zorunlu)
  handlerKey: string | null // deterministic/composite için compile-time allowlist anahtarı (§9.1)
  version: number
}

export interface AgentProfile {
  key: string
  name: string
  team: string
  archetype: import('../brain/types').Archetype
  modelTier: ModelTier
  permissionScopes: string[]
  riskLevel: RiskLevel
  dataSensitivity: DataSensitivity
  grantedSkills: string[] // agent_skill_grants (§6)
  budgetUsdMax: number
  timeoutMs: number
  evalSlug: string
}

// permission_class türetimi (brain/gate.classifyScopes ile aynı mantık).
export type { PermissionClass }
