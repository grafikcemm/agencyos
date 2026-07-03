// Deterministik Offer Matcher — konsey C2 aşaması. SAF KOD, LLM YOK, BEDAVA.
// Katalog requiredEvidenceKinds ∩ doğrulanmış kanıt + Tasarım/AI skorları + sektör
// uyumu → evidence_refs'li skorlu eşleşmeler. Konsey (Chair) YALNIZ bu çıktılar
// arasından seçim yapabilir — hizmet uydurma yapısal olarak imkânsız.

import type { ResolvedServicePackage } from '../types'

export interface MatcherEvidence {
  id: string
  kind: string
  verified: boolean
}

export interface ServiceMatch {
  service_slug: string
  domain: 'tasarim' | 'ai_otomasyon' | 'hibrit'
  rank: number
  score: number
  evidence_refs: string[]
  reasons: string[]
}

export interface MatcherInput {
  designScore: number // 0-100 fırsat skoru (yüksek = güçlü tasarım satış fırsatı)
  aiScore: number
  sector: string
  evidence: MatcherEvidence[]
  catalog: ResolvedServicePackage[]
  maxMatches?: number
}

const SECTOR_MATCH_BONUS = 10
const SECTOR_MISMATCH_PENALTY = 15
const EVIDENCE_KIND_BONUS = 4
const EVIDENCE_BONUS_CAP = 12

export function matchServices(input: MatcherInput): ServiceMatch[] {
  const verifiedByKind = new Map<string, string[]>()
  for (const e of input.evidence) {
    if (!e.verified) continue
    const list = verifiedByKind.get(e.kind) ?? []
    list.push(e.id)
    verifiedByKind.set(e.kind, list)
  }

  const candidates: Omit<ServiceMatch, 'rank'>[] = []

  for (const pkg of input.catalog) {
    if (!pkg.active) continue

    // Kanıt kapısı: paketin istediği türlerden en az biri DOĞRULANMIŞ olmalı.
    const matchingKinds = pkg.requiredEvidenceKinds.filter((k) => verifiedByKind.has(k))
    if (matchingKinds.length === 0) continue

    const evidence_refs = [...new Set(matchingKinds.flatMap((k) => verifiedByKind.get(k) ?? []))]
    const reasons: string[] = [`Kanıt türleri eşleşti: ${matchingKinds.join(', ')}`]

    // Baz skor: domain'e göre ilgili fırsat skoru; hibrit = ortalama.
    let score: number
    if (pkg.domain === 'tasarim') score = input.designScore
    else if (pkg.domain === 'ai_otomasyon') score = input.aiScore
    else score = Math.round((input.designScore + input.aiScore) / 2)
    reasons.push(`Baz skor (${pkg.domain}): ${score}`)

    // Sektör uyumu.
    if (pkg.targetSectors.length > 0) {
      if (pkg.targetSectors.includes(input.sector)) {
        score += SECTOR_MATCH_BONUS
        reasons.push(`Sektör uyumu: +${SECTOR_MATCH_BONUS}`)
      } else {
        score -= SECTOR_MISMATCH_PENALTY
        reasons.push(`Sektör dışı: -${SECTOR_MISMATCH_PENALTY}`)
      }
    }

    // Kanıt kapsamı bonusu.
    const evidenceBonus = Math.min(EVIDENCE_BONUS_CAP, matchingKinds.length * EVIDENCE_KIND_BONUS)
    score += evidenceBonus
    if (evidenceBonus > 0) reasons.push(`Kanıt kapsamı: +${evidenceBonus}`)

    score = Math.max(0, Math.min(100, Math.round(score)))
    candidates.push({ service_slug: pkg.slug, domain: pkg.domain, score, evidence_refs, reasons })
  }

  candidates.sort((a, b) => b.score - a.score)
  const max = input.maxMatches ?? 4
  return candidates.slice(0, max).map((c, i) => ({ ...c, rank: i + 1 }))
}
