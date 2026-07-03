// Skill registry — getter'lar + compile-time handler allowlist (§9.1) + benzersizlik
// değişmezleri (§10.1). DB'den handler_key ile DİNAMİK IMPORT YASAK: yalnız bu statik
// map'teki anahtarlar çalışır.

import { SKILL_CATALOG } from './catalog'
import type { SkillManifest } from './types'
import { computeDeterministicScores } from '../leadIntel/council'
import { matchServices } from '../leadIntel/offerMatcher'
import { buildPlan } from '../brain/plan'

export type SkillHandler = (input: unknown) => unknown

function notImplemented(key: string): SkillHandler {
  return () => {
    throw new Error(`skill handler '${key}' henüz uygulanmadı (Faz 3 execute)`)
  }
}

// Compile-time allowlist. handlerKey yalnız BURADAN çözülür — DB satırından değil.
export const SKILL_HANDLERS: Record<string, SkillHandler> = {
  'orchestration.plan_decompose': (input) => {
    const g = input as Parameters<typeof buildPlan>[0]
    return buildPlan(g)
  },
  'lead.score_deterministic': (input) => {
    const e = (input as { evidence: Parameters<typeof computeDeterministicScores>[0] }).evidence
    return computeDeterministicScores(e)
  },
  'lead.match_services': (input) => matchServices(input as Parameters<typeof matchServices>[0]),
  'lead.audit_website': notImplemented('lead.audit_website'),
  'sales.pricing_explain': notImplemented('sales.pricing_explain'),
  'automation.integration_matcher': notImplemented('automation.integration_matcher'),
}

const BY_SLUG = new Map(SKILL_CATALOG.map((s) => [s.slug, s]))

export function getSkill(slug: string): SkillManifest | undefined {
  return BY_SLUG.get(slug)
}
export function listSkills(): SkillManifest[] {
  return SKILL_CATALOG
}
export function listSkillsByTeam(team: string): SkillManifest[] {
  return SKILL_CATALOG.filter((s) => s.team === team)
}

// ── Benzersizlik / bütünlük değişmezleri (§10.1) ────────────────────────────

export interface RegistryIssue {
  slug: string
  problem: string
}

// Duplicate slug, boş I/O, allowlist-dışı handler, eval_slug eksik → HATA (hard).
export function validateRegistry(skills: SkillManifest[] = SKILL_CATALOG): RegistryIssue[] {
  const issues: RegistryIssue[] = []
  const seenSlug = new Set<string>()
  const seenSummary = new Set<string>()
  for (const s of skills) {
    if (seenSlug.has(s.slug)) issues.push({ slug: s.slug, problem: 'duplicate slug' })
    seenSlug.add(s.slug)
    if (s.summary.length === 0 || s.summary.length > 120) issues.push({ slug: s.slug, problem: 'summary boş/>120' })
    const summaryKey = s.summary.toLowerCase().trim()
    if (seenSummary.has(summaryKey)) issues.push({ slug: s.slug, problem: 'duplicate summary (yapay tekrar)' })
    seenSummary.add(summaryKey)
    if (Object.keys(s.inputSchema).length === 0) issues.push({ slug: s.slug, problem: 'input_schema boş' })
    if (Object.keys(s.outputSchema).length === 0) issues.push({ slug: s.slug, problem: 'output_schema boş' })
    if (!s.evalSlug) issues.push({ slug: s.slug, problem: 'eval_slug eksik' })
    if (s.permissionScopes.length === 0) issues.push({ slug: s.slug, problem: 'permission_scopes boş' })
    if (s.handlerKey && !(s.handlerKey in SKILL_HANDLERS)) {
      issues.push({ slug: s.slug, problem: `handlerKey allowlist dışı: ${s.handlerKey}` })
    }
  }
  return issues
}
