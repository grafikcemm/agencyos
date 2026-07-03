// Eval — trajectory skoru + LLM-as-judge rubrik agregatörü (§16). SAF/deterministik.
// Trajectory: beklenen vs gerçek tool/adım seçimi (precision/recall + sıra). Judge:
// rubrik + ENJEKTE edilen skorer (gerçek LLM çağrısı dışarıda → burada harcama yok,
// tam test edilebilir). deterministik fallback skorer da sağlanır.

export interface Trajectory {
  tools: string[] // seçilen tool/skill slug'ları (sırayla)
  steps?: string[] // opsiyonel adım başlıkları
}

export interface TrajectoryScore {
  toolPrecision: number // seçilenlerin ne kadarı beklenen
  toolRecall: number // beklenenlerin ne kadarı seçildi
  orderScore: number // ortak tool'ların sıra tutarlılığı
  score: number // harman [0..1]
}

function jaccardCounts(expected: string[], actual: string[]): { tp: number } {
  const exp = new Set(expected)
  const seen = new Set<string>()
  let tp = 0
  for (const t of actual) {
    if (exp.has(t) && !seen.has(t)) {
      tp++
      seen.add(t)
    }
  }
  return { tp }
}

// Ortak tool'ların göreli sırası ne kadar korunmuş (LCS / min uzunluk).
function orderConsistency(expected: string[], actual: string[]): number {
  const common = actual.filter((t) => expected.includes(t))
  const expCommon = expected.filter((t) => actual.includes(t))
  if (common.length === 0) return 1 // ortak yoksa sıra cezası yok
  // LCS uzunluğu
  const m = common.length
  const n = expCommon.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = common[i - 1] === expCommon[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n] / Math.max(m, n)
}

export function scoreTrajectory(expected: Trajectory, actual: Trajectory): TrajectoryScore {
  const { tp } = jaccardCounts(expected.tools, actual.tools)
  const toolPrecision = actual.tools.length === 0 ? (expected.tools.length === 0 ? 1 : 0) : tp / actual.tools.length
  const toolRecall = expected.tools.length === 0 ? 1 : tp / expected.tools.length
  const orderScore = orderConsistency(expected.tools, actual.tools)
  const score = Number((0.4 * toolPrecision + 0.4 * toolRecall + 0.2 * orderScore).toFixed(4))
  return { toolPrecision, toolRecall, orderScore, score }
}

// ── LLM-as-judge rubrik ──────────────────────────────────────────────────────
export interface RubricCriterion {
  key: string
  weight: number // >0
}

export type CriterionScorer = (key: string, output: string) => number // 0..1

export interface RubricResult {
  perCriterion: { key: string; score: number; weight: number }[]
  weighted: number // 0..1
}

export function judgeWithRubric(criteria: RubricCriterion[], output: string, scorer: CriterionScorer): RubricResult {
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0)
  const perCriterion = criteria.map((c) => ({
    key: c.key,
    weight: c.weight,
    score: Math.min(1, Math.max(0, scorer(c.key, output))),
  }))
  const weighted = totalWeight === 0 ? 0 : Number((perCriterion.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight).toFixed(4))
  return { perCriterion, weighted }
}

// Deterministik fallback skorer: kriter anahtarı çıktıda geçiyorsa 1, yoksa 0.5
// (LLM judge yoksa kaba sinyal — asla gerçek LLM çağırmaz).
export const keywordPresenceScorer: CriterionScorer = (key, output) =>
  output.toLowerCase().includes(key.toLowerCase()) ? 1 : 0.5
