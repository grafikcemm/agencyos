/**
 * Opportunity Intelligence Engine
 * Multi-source trend signal collection, scoring, and product linking.
 * All external APIs are optional (fail-soft). No hardcoded scraping.
 */

import { createHash } from 'crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrendSignal {
  source: string
  source_url: string
  title: string
  summary: string
  relevance_score: number
  confidence_score: number
  raw_data: Record<string, unknown>
}

export interface ScoredSignal extends TrendSignal {
  linked_product_id: string | null
  matched_topic_id: string | null
  status: 'raw' | 'reviewed' | 'actionable' | 'parked'
  signal_hash: string
}

export interface OpportunityProduct {
  id: string
  title: string
  category: string
  action_tier: string
  priority_order: number
  description: string | null
}

export interface WatchTopic {
  id: string
  topic: string
  keywords: string[]
  linked_product_id: string | null
}

export interface SourceResult {
  source: string
  enabled: boolean
  signals: TrendSignal[]
  error?: string
  last_status?: 'ok' | 'blocked' | 'rate_limited' | 'no_data' | 'error'
}

export interface WeeklyReportData {
  period_start: string
  period_end: string
  total_signals: number
  actionable_signals: number
  parked_signals: number
  top_products: { id: string; title: string; signal_count: number }[]
  summary: string
  recommendations: string[]
  sources_status: Record<string, { enabled: boolean; count: number; error?: string }>
}

// ─── Hash Helper ──────────────────────────────────────────────────────────────

export function computeSignalHash(source: string, sourceUrl?: string | null, title?: string): string {
  const identifier = sourceUrl ? `${source}:${sourceUrl}` : `${source}:${title || ''}`
  return createHash('md5').update(identifier).digest('hex')
}

// ─── Turkey Gap Analysis (Hardcoded) ──────────────────────────────────────────

export interface TurkeyGapItem {
  id: string
  area: string
  global_equivalent: string
  potential: 'high' | 'medium' | 'low'
  difficulty: 'high' | 'medium' | 'low'
  why: string
  category: string
}

export const TURKEY_GAP_ANALYSIS: TurkeyGapItem[] = [
  {
    id: 'gap-ride-share',
    area: 'Ride-sharing / Mobility',
    global_equivalent: 'Uber / Lyft',
    potential: 'high',
    difficulty: 'high',
    why: 'Uber Türkiye\'de yasaklı. BiTaksi tekel. Dijital mobilite altyapısı zayıf.',
    category: 'mobility'
  },
  {
    id: 'gap-digital-payment',
    area: 'Dijital Ödeme Altyapısı',
    global_equivalent: 'PayPal / Stripe',
    potential: 'high',
    difficulty: 'high',
    why: 'PayPal Türkiye\'de yok. Stripe sınırlı. Yerli alternatiflerin UX\'i zayıf.',
    category: 'fintech'
  },
  {
    id: 'gap-creator-economy',
    area: 'Creator Economy Platformu',
    global_equivalent: 'Gumroad / Patreon / Ko-fi',
    potential: 'high',
    difficulty: 'medium',
    why: 'Türk kreatiflerin dijital ürün satış ve abonelik altyapısı yok. Shopier/iyzico Link var ama creator-first değil.',
    category: 'creator_tools'
  },
  {
    id: 'gap-freelancer-ops',
    area: 'Freelancer Operasyon Sistemi',
    global_equivalent: 'Bonsai / HoneyBook',
    potential: 'medium',
    difficulty: 'medium',
    why: 'Türkiye\'de 2M+ freelancer var ama teklif, fatura, proje takibi hâlâ Excel/WhatsApp üzerinden.',
    category: 'productivity'
  },
  {
    id: 'gap-ai-localization',
    area: 'AI Araç Türkçe Lokalizasyon',
    global_equivalent: 'Jasper / Copy.ai Türkçe',
    potential: 'medium',
    difficulty: 'medium',
    why: 'Global AI araçları Türkçe\'de zayıf. Türkçe prompt ve çıktı kalitesi düşük.',
    category: 'ai_tools'
  },
  {
    id: 'gap-local-seo',
    area: 'Yerel İşletme Dijital Dönüşüm',
    global_equivalent: 'Yelp + Squarespace + Calendly combo',
    potential: 'high',
    difficulty: 'low',
    why: 'KOBİ\'lerin %70\'inin web sitesi yok veya mobil uyumsuz. Online randevu ve WhatsApp entegrasyonu eksik.',
    category: 'local_business'
  },
  {
    id: 'gap-design-education',
    area: 'AI Destekli Tasarım Eğitimi',
    global_equivalent: 'Domestika / Skillshare (Türkçe AI odaklı)',
    potential: 'medium',
    difficulty: 'low',
    why: 'Türkçe AI tasarım eğitimi neredeyse yok. Prompt mühendisliği ve AI workflow eğitimi boşluğu büyük.',
    category: 'education'
  },
  {
    id: 'gap-micro-saas',
    area: 'Micro-SaaS / Tek Özellik Araçlar',
    global_equivalent: 'Lemon Squeezy + indie hacker araçları',
    potential: 'medium',
    difficulty: 'low',
    why: 'Türk geliştiriciler global micro-SaaS satışını bilmiyor. Ödeme + dağıtım bilgi açığı var.',
    category: 'saas'
  }
]

// ─── Source Fetchers ──────────────────────────────────────────────────────────

const FETCH_TIMEOUT = 10_000

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Product Hunt — Public RSS feed (no API key needed)
 */
export async function fetchProductHuntSignals(): Promise<SourceResult> {
  try {
    // Try standard feed first, fallback to category feed if needed
    let res = await fetchWithTimeout('https://www.producthunt.com/feed')
    if (!res.ok) {
      res = await fetchWithTimeout('https://www.producthunt.com/feed?category=undefined')
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const xml = await res.text()

    // Simple XML parsing for RSS items
    const items: TrendSignal[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const itemXml = match[1]
      const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? itemXml.match(/<title>(.*?)<\/title>/)?.[1]
        ?? 'Untitled'
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] ?? ''
      const desc = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
        ?? itemXml.match(/<description>(.*?)<\/description>/)?.[1]
        ?? ''

      items.push({
        source: 'product_hunt',
        source_url: link,
        title: title.slice(0, 200),
        summary: desc.replace(/<[^>]*>/g, '').slice(0, 500),
        relevance_score: 0,
        confidence_score: 0,
        raw_data: { title, link }
      })
    }

    const last_status: SourceResult['last_status'] = items.length > 0 ? 'ok' : 'no_data'
    return { source: 'product_hunt', enabled: true, signals: items, last_status }
  } catch (err) {
    return { source: 'product_hunt', enabled: true, signals: [], last_status: 'error', error: String(err) }
  }
}

/**
 * Hacker News — Top stories via Firebase API (free, no key)
 */
export async function fetchHackerNewsSignals(): Promise<SourceResult> {
  try {
    const res = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ids: number[] = await res.json()
    const topIds = ids.slice(0, 15)

    const items: TrendSignal[] = []
    for (const id of topIds) {
      try {
        const itemRes = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        if (!itemRes.ok) continue
        const item = await itemRes.json()
        if (!item || item.type !== 'story' || !item.title) continue

        items.push({
          source: 'hacker_news',
          source_url: item.url || `https://news.ycombinator.com/item?id=${id}`,
          title: String(item.title).slice(0, 200),
          summary: `Score: ${item.score ?? 0} | Comments: ${item.descendants ?? 0}`,
          relevance_score: 0,
          confidence_score: 0,
          raw_data: { hn_id: id, score: item.score, comments: item.descendants }
        })
      } catch {
        // Skip individual items that fail
      }
    }

    const last_status: SourceResult['last_status'] = items.length > 0 ? 'ok' : 'no_data'
    return { source: 'hacker_news', enabled: true, signals: items, last_status }
  } catch (err) {
    return { source: 'hacker_news', enabled: true, signals: [], last_status: 'error', error: String(err) }
  }
}

/**
 * Reddit — Public JSON endpoints (no API key for read-only)
 */
export async function fetchRedditSignals(): Promise<SourceResult> {
  const subreddits = ['SaaS', 'indiehackers', 'graphic_design', 'artificial']
  const items: TrendSignal[] = []
  let failedCount = 0
  let isRateLimited = false
  let isBlocked = false

  for (const sub of subreddits) {
    try {
      const res = await fetchWithTimeout(`https://www.reddit.com/r/${sub}/hot.json?limit=5`, {
        headers: { 'User-Agent': 'AgencyOS-OpportunityScanner/1.0' }
      })
      if (res.status === 429) {
        isRateLimited = true
        failedCount++
        continue
      }
      if (res.status === 403 || res.status === 401) {
        isBlocked = true
        failedCount++
        continue
      }
      if (!res.ok) {
        failedCount++
        continue
      }
      const data = await res.json()
      const posts = data?.data?.children ?? []

      for (const post of posts) {
        const d = post?.data
        if (!d || !d.title) continue

        items.push({
          source: 'reddit',
          source_url: `https://reddit.com${d.permalink ?? ''}`,
          title: String(d.title).slice(0, 200),
          summary: `r/${sub} | Score: ${d.score ?? 0} | Comments: ${d.num_comments ?? 0}`,
          relevance_score: 0,
          confidence_score: 0,
          raw_data: { subreddit: sub, score: d.score, comments: d.num_comments, upvote_ratio: d.upvote_ratio }
        })
      }
    } catch {
      failedCount++
    }
  }

  let last_status: SourceResult['last_status'] = 'ok'
  if (items.length === 0) {
    if (isRateLimited) last_status = 'rate_limited'
    else if (isBlocked) last_status = 'blocked'
    else last_status = 'no_data'
  }

  return {
    source: 'reddit',
    enabled: true,
    signals: items,
    last_status,
    error: items.length === 0 && failedCount === subreddits.length ? 'Reddit fetch failed completely' : undefined
  }
}

/**
 * Google Trends via SerpAPI (optional — requires SERPAPI_API_KEY or SERPAPI_KEY)
 */
export async function fetchGoogleTrendsSignals(): Promise<SourceResult> {
  const apiKey = process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY
  if (!apiKey) {
    return { source: 'google_trends', enabled: false, signals: [], last_status: 'no_data', error: 'SERPAPI_API_KEY not set' }
  }

  try {
    const queries = ['AI tools for designers', 'freelancer CRM', 'prompt engineering']
    const items: TrendSignal[] = []

    for (const q of queries) {
      try {
        const url = `https://serpapi.com/search.json?engine=google_trends&q=${encodeURIComponent(q)}&api_key=${apiKey}`
        const res = await fetchWithTimeout(url)
        if (!res.ok) continue
        const data = await res.json()

        const interest = data?.interest_over_time?.timeline_data
        if (Array.isArray(interest) && interest.length > 0) {
          const latest = interest[interest.length - 1]
          const value = latest?.values?.[0]?.extracted_value ?? 0

          items.push({
            source: 'google_trends',
            source_url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(q)}`,
            title: `Google Trends: "${q}"`,
            summary: `Son dönem ilgi seviyesi: ${value}/100`,
            relevance_score: 0,
            confidence_score: 0,
            raw_data: { query: q, latest_value: value, data_points: interest.length }
          })
        }
      } catch {
        // Skip individual queries that fail
      }
    }

    const last_status: SourceResult['last_status'] = items.length > 0 ? 'ok' : 'no_data'
    return { source: 'google_trends', enabled: true, signals: items, last_status }
  } catch (err) {
    return { source: 'google_trends', enabled: true, signals: [], last_status: 'error', error: String(err) }
  }
}

/**
 * Turkey Gap Analysis — hardcoded data, always available
 */
export function fetchTurkeyGapSignals(): SourceResult {
  const signals: TrendSignal[] = TURKEY_GAP_ANALYSIS.map(gap => ({
    source: 'turkey_gap',
    source_url: '',
    title: `Türkiye Fırsat Açığı: ${gap.area}`,
    summary: gap.why,
    relevance_score: gap.potential === 'high' ? 85 : gap.potential === 'medium' ? 60 : 35,
    confidence_score: 90, // Hardcoded = high confidence
    raw_data: { gap_id: gap.id, global_equivalent: gap.global_equivalent, difficulty: gap.difficulty, category: gap.category }
  }))

  return { source: 'turkey_gap', enabled: true, signals, last_status: 'ok' }
}

// ─── Signal Scoring & Product Linking ─────────────────────────────────────────

const RELEVANCE_KEYWORDS: Record<string, string[]> = {
  'opp-payment-stack': ['payment', 'checkout', 'ödeme', 'shopier', 'iyzico', 'stripe', 'lemon squeezy', 'digital sales'],
  'opp-prompt-booklet': ['prompt', 'ai prompt', 'chatgpt', 'midjourney', 'stable diffusion', 'prompt engineering', 'prompt template'],
  'opp-designer-agent-pack': ['ai agent', 'design agent', 'creative agent', 'gpt agent', 'automation', 'workflow agent', 'design tool'],
  'opp-mini-ai-creative-ops': ['creative ops', 'ai training', 'workshop', 'course', 'eğitim', 'ai workflow', 'design workflow'],
  'opp-agencyos-lite': ['freelancer', 'crm', 'client management', 'project management', 'freelance tool', 'invoice', 'proposal'],
  'opp-feed-the-goat': ['discipline', 'habit', 'goal setting', 'productivity', 'motivation', 'personal system', 'disiplin'],
  'opp-ai-vault': ['membership', 'subscription', 'vault', 'resource library', 'premium content', 'üyelik', 'abonelik']
}

/**
 * Score a signal's relevance to the overall business
 */
export function scoreSignalRelevance(signal: TrendSignal, watchTopics: WatchTopic[]): number {
  const text = `${signal.title} ${signal.summary}`.toLowerCase()
  let score = 0

  // For Hacker News, if no watch topic keywords match, make it irrelevant so it gets parked
  if (signal.source === 'hacker_news') {
    let hasMatch = false
    for (const topic of watchTopics) {
      if (text.includes(topic.topic.toLowerCase())) {
        score += 40
        hasMatch = true
      }
      for (const keyword of topic.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 30
          hasMatch = true
        }
      }
    }
    if (!hasMatch) {
      return 0
    }
  } else {
    // Normal watch topic matching for other sources
    for (const topic of watchTopics) {
      for (const keyword of topic.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 15
        }
      }
      if (text.includes(topic.topic.toLowerCase())) {
        score += 20
      }
    }
  }

  // Bonus for high engagement signals
  const rawScore = (signal.raw_data?.score as number) ?? 0
  const rawComments = (signal.raw_data?.comments as number) ?? 0
  if (rawScore > 100) score += 10
  if (rawScore > 500) score += 10
  if (rawComments > 50) score += 5
  if (rawComments > 200) score += 10

  return Math.min(100, Math.max(0, score))
}

/**
 * Link a signal to the best matching product
 */
export function linkSignalToProduct(signal: TrendSignal, products: OpportunityProduct[]): string | null {
  const text = `${signal.title} ${signal.summary}`.toLowerCase()
  let bestMatch: string | null = null
  let bestScore = 0

  for (const product of products) {
    const keywords = RELEVANCE_KEYWORDS[product.id] ?? []
    let matchScore = 0

    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchScore += 1
      }
    }

    // Also check product title
    const titleWords = product.title.toLowerCase().split(/\s+/)
    for (const word of titleWords) {
      if (word.length > 3 && text.includes(word)) {
        matchScore += 0.5
      }
    }

    if (matchScore > bestScore) {
      bestScore = matchScore
      bestMatch = product.id
    }
  }

  // Only link if at least 2 keyword matches
  return bestScore >= 2 ? bestMatch : null
}

/**
 * Find matching watch topic
 */
export function findMatchingTopic(signal: TrendSignal, topics: WatchTopic[]): string | null {
  const text = `${signal.title} ${signal.summary}`.toLowerCase()

  for (const topic of topics) {
    if (text.includes(topic.topic.toLowerCase())) return topic.id
    for (const keyword of topic.keywords) {
      if (text.includes(keyword.toLowerCase())) return topic.id
    }
  }

  return null
}

/**
 * Score and enrich all signals
 */
export function processSignals(
  rawSignals: TrendSignal[],
  products: OpportunityProduct[],
  watchTopics: WatchTopic[]
): ScoredSignal[] {
  return rawSignals.map(signal => {
    const relevance = scoreSignalRelevance(signal, watchTopics)
    const linkedProduct = linkSignalToProduct(signal, products)
    const matchedTopic = findMatchingTopic(signal, watchTopics)

    // Confidence = base relevance + product match bonus
    const confidence = Math.min(100, relevance + (linkedProduct ? 20 : 0) + (matchedTopic ? 10 : 0))

    // Status logic: "kanıt yoksa park et"
    let status: ScoredSignal['status'] = 'raw'
    if (confidence >= 70 && linkedProduct) {
      status = 'actionable'
    } else if (confidence >= 40) {
      status = 'reviewed'
    } else {
      status = 'parked'
    }

    const signalHash = computeSignalHash(signal.source, signal.source_url, signal.title)

    return {
      ...signal,
      relevance_score: relevance,
      confidence_score: confidence,
      linked_product_id: linkedProduct,
      matched_topic_id: matchedTopic,
      status,
      signal_hash: signalHash
    }
  })
}

// ─── Report Generation ────────────────────────────────────────────────────────

export function generateWeeklyReport(
  scoredSignals: ScoredSignal[],
  products: OpportunityProduct[],
  sourcesStatus: Record<string, { enabled: boolean; count: number; error?: string }>
): WeeklyReportData {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const actionable = scoredSignals.filter(s => s.status === 'actionable')
  const parked = scoredSignals.filter(s => s.status === 'parked')

  // Count signals per product
  const productCounts = new Map<string, number>()
  for (const signal of scoredSignals) {
    if (signal.linked_product_id) {
      productCounts.set(signal.linked_product_id, (productCounts.get(signal.linked_product_id) ?? 0) + 1)
    }
  }

  const topProducts = products
    .map(p => ({ id: p.id, title: p.title, signal_count: productCounts.get(p.id) ?? 0 }))
    .filter(p => p.signal_count > 0)
    .sort((a, b) => b.signal_count - a.signal_count)
    .slice(0, 5)

  // Generate recommendations
  const recommendations: string[] = []
  if (actionable.length > 0) {
    recommendations.push(`${actionable.length} aksiyon alınabilir sinyal var. En güçlü sinyalleri incele.`)
  }
  if (actionable.length === 0) {
    recommendations.push('Bu hafta aksiyon gerektiren güçlü sinyal yok. Mevcut ürünlere odaklan.')
  }
  if (topProducts.length > 0) {
    recommendations.push(`En çok sinyal alan ürün: "${topProducts[0].title}" (${topProducts[0].signal_count} sinyal).`)
  }
  recommendations.push('🚫 Yeni fikir = park et. Mevcut aktif sprint\'ten sapma.')

  const summary = `Haftalık Fırsat İstihbarat Raporu: ${scoredSignals.length} sinyal toplandı, ${actionable.length} aksiyon alınabilir, ${parked.length} park edildi.`

  return {
    period_start: weekAgo.toISOString().split('T')[0],
    period_end: now.toISOString().split('T')[0],
    total_signals: scoredSignals.length,
    actionable_signals: actionable.length,
    parked_signals: parked.length,
    top_products: topProducts,
    summary,
    recommendations,
    sources_status: sourcesStatus
  }
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function runOpportunityScan(
  products: OpportunityProduct[],
  watchTopics: WatchTopic[]
): Promise<{
  scoredSignals: ScoredSignal[]
  report: WeeklyReportData
  sourceResults: SourceResult[]
}> {
  // Fetch from all sources in parallel
  const sourceResults = await Promise.all([
    fetchProductHuntSignals(),
    fetchHackerNewsSignals(),
    fetchRedditSignals(),
    fetchGoogleTrendsSignals(),
    Promise.resolve(fetchTurkeyGapSignals())
  ])

  // Collect all raw signals
  const allRawSignals = sourceResults.flatMap(r => r.signals)

  // Score and link
  const scoredSignals = processSignals(allRawSignals, products, watchTopics)

  // Build sources status
  const sourcesStatus: Record<string, { enabled: boolean; count: number; error?: string }> = {}
  for (const result of sourceResults) {
    sourcesStatus[result.source] = {
      enabled: result.enabled,
      count: result.signals.length,
      error: result.error
    }
  }

  // Generate report
  const report = generateWeeklyReport(scoredSignals, products, sourcesStatus)

  return { scoredSignals, report, sourceResults }
}
