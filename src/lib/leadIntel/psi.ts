// PageSpeed Insights v5 istemcisi — masaüstü Lighthouse metrikleri + final-screenshot.
// Resmî API; fetch'i Google altyapısı yapar (SSRF riski bize dönmez), yine de şema
// kontrolü yapılır. PAGESPEED_API_KEY opsiyonel (günde ≤4 çağrı keyless kotaya sığar).
// Yeni npm bağımlılığı YOK: screenshot, yanıtın içindeki base64 data-URI'dan çıkarılır.

import { staticUrlCheck } from './urlGuard'

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const DEFAULT_TIMEOUT_MS = 75_000

export interface PsiMetrics {
  performanceScore: number | null // 0-100
  lcpMs: number | null
  cls: number | null
  tbtMs: number | null
  fcpMs: number | null
  speedIndexMs: number | null
}

export interface PsiScreenshot {
  mime: string
  base64: string
}

export interface PsiResult {
  ok: boolean
  error?: string
  finalUrl?: string
  metrics?: PsiMetrics
  screenshot?: PsiScreenshot | null
}

// "data:image/jpeg;base64,/9j/4AAQ..." → { mime, base64 }. Test edilebilir saf fonksiyon.
export function parseDataUri(dataUri: string | undefined | null): PsiScreenshot | null {
  if (!dataUri) return null
  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUri)
  if (!match) return null
  return { mime: match[1].toLowerCase(), base64: match[2] }
}

interface RawAudit {
  score?: number | null
  numericValue?: number
  details?: { data?: string }
}

interface RawPsiResponse {
  lighthouseResult?: {
    finalUrl?: string
    categories?: { performance?: { score?: number | null } }
    audits?: Record<string, RawAudit>
  }
  error?: { message?: string }
}

// Ham PSI yanıtından tipli metrik çıkarımı. Test edilebilir saf fonksiyon.
export function extractPsiResult(raw: RawPsiResponse): PsiResult {
  if (raw.error?.message) return { ok: false, error: raw.error.message }
  const lh = raw.lighthouseResult
  if (!lh?.audits) return { ok: false, error: 'lighthouseResult eksik' }

  const audits = lh.audits
  const num = (key: string): number | null => {
    const v = audits[key]?.numericValue
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null
  }
  const perfScore = lh.categories?.performance?.score
  return {
    ok: true,
    finalUrl: lh.finalUrl,
    metrics: {
      performanceScore: typeof perfScore === 'number' ? Math.round(perfScore * 100) : null,
      lcpMs: num('largest-contentful-paint'),
      cls: num('cumulative-layout-shift'),
      tbtMs: num('total-blocking-time'),
      fcpMs: num('first-contentful-paint'),
      speedIndexMs: num('speed-index'),
    },
    screenshot: parseDataUri(audits['final-screenshot']?.details?.data),
  }
}

export async function runPsiAudit(
  targetUrl: string,
  opts: { timeoutMs?: number; apiKey?: string } = {}
): Promise<PsiResult> {
  const check = staticUrlCheck(targetUrl)
  if (!check.ok) return { ok: false, error: check.reason }

  const params = new URLSearchParams({
    url: check.url.toString(),
    strategy: 'desktop', // spec: görsel audit yalnız masaüstü
    category: 'performance', // final-screenshot audit'ini içerir
  })
  const apiKey = opts.apiKey ?? process.env.PAGESPEED_API_KEY
  if (apiKey) params.set('key', apiKey)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(`${PSI_ENDPOINT}?${params.toString()}`, { signal: controller.signal })
    const json = (await res.json()) as RawPsiResponse
    if (!res.ok) return { ok: false, error: json.error?.message ?? `PSI HTTP ${res.status}` }
    return extractPsiResult(json)
  } catch (error) {
    const msg = error instanceof Error ? (error.name === 'AbortError' ? 'PSI zaman aşımı' : error.message) : 'PSI hatası'
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}
