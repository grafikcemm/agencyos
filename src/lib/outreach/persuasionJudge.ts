// ─────────────────────────────────────────────────────────────────────────────
// Persuasion JUDGE runner (FINALIZATION Faz 2) — buildJudgePrompt artık ölü
// fonksiyon değil: bu runner her CI koşusunda gerçek prompt'u kurar ve bir
// PROVIDER üzerinden değerlendirir.
//
// Provider seçimi (resolveJudgeProvider):
// - PERSUASION_JUDGE_LIVE=1 + OPENROUTER_API_KEY → canlı model judge
//   (operatör/batch koşusu; CI'da KULLANILMAZ — maliyet + determinizm).
// - aksi hâlde → KAYITLI DETERMİNİSTİK FIXTURE (judgeFixtures.ts). Fixture'lar
//   beklenen sınır davranışının kaydıdır ve İNSAN KALİBRASYONU BEKLİYOR
//   durumundadır (docs/persuasion-golden-samples-2026-07-13.md) — bu dürüstçe
//   'pending human calibration' etiketiyle taşınır.
// ─────────────────────────────────────────────────────────────────────────────

import { buildJudgePrompt, type GoldenCase } from './persuasionEval'
import { JUDGE_FIXTURES, type JudgeFixture } from './judgeFixtures'

export interface JudgeResult {
  caseId: string
  scores: number[]
  gerekce: string[]
  toplamGecerMi: boolean
  /** 'live' = gerçek model; 'fixture' = kayıtlı deterministik beklenti. */
  source: 'live' | 'fixture'
}

export type JudgeProvider = {
  kind: 'live' | 'fixture'
  call: (prompt: string, caseId: string) => Promise<string>
}

/** Judge çıktısını parse eder; bozuk/eksik çıktı → null (çağıran fail-closed). */
export function parseJudgeOutput(raw: string): Omit<JudgeFixture, 'note'> | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    const parsed: unknown = JSON.parse(cleaned)
    if (!parsed || typeof parsed !== 'object') return null
    const p = parsed as Record<string, unknown>
    if (!Array.isArray(p.scores) || p.scores.length !== 5) return null
    if (!p.scores.every((s) => typeof s === 'number' && s >= 1 && s <= 5)) return null
    if (typeof p.toplamGecerMi !== 'boolean') return null
    const gerekce = Array.isArray(p.gerekce) ? p.gerekce.filter((g): g is string => typeof g === 'string') : []
    return { scores: p.scores as number[], gerekce, toplamGecerMi: p.toplamGecerMi }
  } catch {
    return null
  }
}

/** Kayıtlı fixture provider — prompt yine GERÇEKTEN kurulur ve doğrulanır
 *  (boş/bozuk prompt fixture'a bile gidemez); cevap fixture'dan döner. */
export function fixtureProvider(): JudgeProvider {
  return {
    kind: 'fixture',
    call: async (prompt: string, caseId: string) => {
      if (!prompt.includes('YALNIZ JSON döndür') || !prompt.includes('GÖVDE:')) {
        throw new Error(`judge prompt bozuk kuruldu (case=${caseId})`)
      }
      const fx = JUDGE_FIXTURES[caseId]
      if (!fx) throw new Error(`judge fixture eksik: ${caseId} — kayıt ekleyin veya PERSUASION_JUDGE_LIVE=1 koşun`)
      return JSON.stringify({ scores: fx.scores, gerekce: fx.gerekce, toplamGecerMi: fx.toplamGecerMi })
    },
  }
}

/** Canlı model judge provider — YALNIZ operatör/batch koşusu (CI dışı). */
export async function liveProvider(): Promise<JudgeProvider> {
  const { callWithOperation } = await import('@/lib/openrouter')
  return {
    kind: 'live',
    call: async (prompt: string) => {
      const { content } = await callWithOperation(
        'persuasion_judge',
        'Sen deneyimli bir Türk B2B satış editörüsün. YALNIZ istenen JSON formatında cevap ver.',
        prompt,
        400,
      )
      return content
    },
  }
}

export async function resolveJudgeProvider(): Promise<JudgeProvider> {
  if (process.env.PERSUASION_JUDGE_LIVE === '1' && process.env.OPENROUTER_API_KEY) {
    return liveProvider()
  }
  return fixtureProvider()
}

export interface JudgeRunSummary {
  results: JudgeResult[]
  /** Deterministik beklentiyle (expectPass) uyuşmayan case id'leri. */
  disagreements: string[]
}

/** Eval runner: her case için judge prompt'u kurar, provider'dan skor alır,
 *  parse edilemeyen çıktı HATA olarak fırlar (sessiz geçiş yok). */
export async function runJudgeEval(cases: GoldenCase[], provider: JudgeProvider): Promise<JudgeRunSummary> {
  const results: JudgeResult[] = []
  const disagreements: string[] = []
  for (const gc of cases) {
    const prompt = buildJudgePrompt(gc.sample, gc.ctx)
    const raw = await provider.call(prompt, gc.id)
    const parsed = parseJudgeOutput(raw)
    if (!parsed) throw new Error(`judge çıktısı parse edilemedi: ${gc.id}`)
    results.push({ caseId: gc.id, ...parsed, source: provider.kind })
    if (parsed.toplamGecerMi !== gc.expectPass) disagreements.push(gc.id)
  }
  return { results, disagreements }
}
