// Skill retrieval — 4 aşama (§11): eligibility filter → semantic top-k (exact cosine)
// → rerank → grant/budget validation. Saf/deterministik (verilen vektörler üstünde) →
// test edilebilir. pgvector exact-first (mig 042); 487'de ANN index YOK (plan §11/§18).
// In-memory cosine, mevcut knowledgeIndex.json deseniyle aynı → Vercel-uyumlu.

import type { SkillManifest } from './types'
import type { DataSensitivity } from '../brain/types'

export const MAX_SKILLS = 7
export const DEFAULT_TOPK = 12

const SENS_ORDER: Record<DataSensitivity, number> = { public: 0, internal: 1, confidential: 2, secret: 3 }

export interface SkillCandidate {
  slug: string
  vector: number[]
  manifest: SkillManifest
  // rerank sinyalleri (opsiyonel): geçmiş başarı [0..1], tazelik [0..1].
  pastSuccess?: number
  freshness?: number
}

export interface RetrievalContext {
  callerScopes: string[] // operatörün sahip olduğu izinler
  maxSensitivity: DataSensitivity
  teams?: string[] // verilirse yalnız bu takımlar
}

export interface RetrievalResult {
  selected: { slug: string; score: number }[]
  rejected: { slug: string; reason: string }[]
  notes: string[]
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// A. ELIGIBILITY: aktif + caller scope ⊇ skill scope + sensitivity ≤ ctx + team.
export function eligibilityFilter(cands: SkillCandidate[], ctx: RetrievalContext): SkillCandidate[] {
  const wildcard = ctx.callerScopes.includes('*')
  return cands.filter((c) => {
    const m = c.manifest
    const scopeOk = wildcard || m.permissionScopes.every((s) => ctx.callerScopes.includes(s))
    const sensOk = SENS_ORDER[m.dataSensitivity] <= SENS_ORDER[ctx.maxSensitivity]
    const teamOk = !ctx.teams || ctx.teams.includes(m.team)
    return scopeOk && sensOk && teamOk
  })
}

// B. SEMANTIC TOP-K: exact cosine sıralama.
export function semanticTopK(cands: SkillCandidate[], queryVec: number[], k: number): { cand: SkillCandidate; sim: number }[] {
  return cands
    .map((cand) => ({ cand, sim: cosine(cand.vector, queryVec) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k)
}

// C. RERANK: benzerlik + geçmiş başarı + tazelik + maliyet-tercihi harmanı.
export function rerank(scored: { cand: SkillCandidate; sim: number }[]): { cand: SkillCandidate; score: number }[] {
  return scored
    .map(({ cand, sim }) => {
      const success = cand.pastSuccess ?? 0.5
      const fresh = cand.freshness ?? 0.5
      const costPref = 1 - Math.min(1, cand.manifest.budgetUsdMax / 0.2) // ucuz skill hafif avantaj
      const score = 0.6 * sim + 0.2 * success + 0.1 * fresh + 0.1 * costPref
      return { cand, score }
    })
    .sort((a, b) => b.score - a.score)
}

// D. GRANT + BUDGET: agent grant + run bütçesi + sert skill tavanı (§11).
export function grantBudgetValidate(
  ranked: { cand: SkillCandidate; score: number }[],
  grantedSkills: Set<string>,
  runBudgetUsd: number,
  maxSkills = MAX_SKILLS
): RetrievalResult {
  const selected: { slug: string; score: number }[] = []
  const rejected: { slug: string; reason: string }[] = []
  let spent = 0
  for (const { cand, score } of ranked) {
    if (selected.length >= maxSkills) {
      rejected.push({ slug: cand.slug, reason: `skill tavanı (${maxSkills}) doldu` })
      continue
    }
    if (grantedSkills.size > 0 && !grantedSkills.has(cand.slug)) {
      rejected.push({ slug: cand.slug, reason: 'grant yok' })
      continue
    }
    if (spent + cand.manifest.budgetUsdMax > runBudgetUsd) {
      rejected.push({ slug: cand.slug, reason: 'run bütçesi aşılır' })
      continue
    }
    spent += cand.manifest.budgetUsdMax
    selected.push({ slug: cand.slug, score })
  }
  return { selected, rejected, notes: [`bütçe kullanımı ~$${spent.toFixed(3)}/${runBudgetUsd}`] }
}

// Tam boru hattı.
export function retrieveSkills(
  cands: SkillCandidate[],
  queryVec: number[],
  ctx: RetrievalContext,
  grantedSkills: Set<string>,
  runBudgetUsd: number,
  opts: { topK?: number; maxSkills?: number } = {}
): RetrievalResult {
  const eligible = eligibilityFilter(cands, ctx)
  const topk = semanticTopK(eligible, queryVec, opts.topK ?? DEFAULT_TOPK)
  const ranked = rerank(topk)
  const result = grantBudgetValidate(ranked, grantedSkills, runBudgetUsd, opts.maxSkills ?? MAX_SKILLS)
  return {
    ...result,
    notes: [`eligible=${eligible.length}`, `topk=${topk.length}`, ...result.notes],
  }
}
