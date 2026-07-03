// Brain v2 — VERIFY: genelleştirilmiş critic/skeptic/judge disiplini (§4 adım 6).
// Lead-Intel council'in "serbest metin karar verisi DEĞİLDİR; her iddia geçerli
// evidence_id'ye bağlı olmalı" ilkesini genelleştirir (parity — council modülü
// DEĞİŞMEZ; bu yeni jenerik katmandır). Faz 1'de deterministik/saf.

export interface Finding {
  claim: string
  evidenceId: string | null
  severity: 'low' | 'medium' | 'high'
}

export interface VerifyResult {
  upheld: Finding[]
  rejected: Finding[]
  verdict: 'pass' | 'needs_review' | 'reject'
}

// Skeptic: kanıtsız (evidenceId null) veya bilinmeyen evidence → reddedilir.
// Judge: kalan yüksek-önem bulgular varsa needs_review; tümü reddedildiyse reject.
export function verifyFindings(findings: Finding[], evidenceIds: Set<string>): VerifyResult {
  const upheld: Finding[] = []
  const rejected: Finding[] = []
  for (const f of findings) {
    if (f.evidenceId && evidenceIds.has(f.evidenceId)) upheld.push(f)
    else rejected.push(f)
  }
  let verdict: VerifyResult['verdict']
  if (upheld.length === 0) verdict = findings.length === 0 ? 'pass' : 'reject'
  else if (upheld.some((f) => f.severity === 'high')) verdict = 'needs_review'
  else verdict = 'pass'
  return { upheld, rejected, verdict }
}
