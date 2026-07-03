// Skill kataloğu — KOD kaynak-of-truth (service_catalog deseni). Gerçek, benzersiz
// skill'ler; YAPAY DOLGU YOK (§10.1). DB (skills tablosu, mig 041) yalnız enable/override.
// Öncelikli takımlar: Lead Intelligence, Satış, Tasarım, AI-Otomasyon + orkestrasyon.
// Her kayıt: benzersiz amaç + dolu I/O + izin + risk + sensitivity + bütçe + timeout
// + gerçek eval_slug + versiyon. handlerKey deterministik/composite için compile-time
// allowlist anahtarı (§9.1); llm-kind için null.

import type { SkillManifest } from './types'

export const SKILL_CATALOG: SkillManifest[] = [
  // ── Orkestrasyon ──────────────────────────────────────────────────────────
  {
    slug: 'orchestration.plan_decompose',
    team: 'orchestration', name: 'Hedef Ayrıştırıcı',
    summary: 'Operatör hedefini bağımlı ≤5 adımlık göreve böler',
    kind: 'deterministic', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { goal: 'string', channel: 'string' }, outputSchema: { steps: 'PlanStep[]', order: 'string[]' },
    defaultTier: 'light', budgetUsdMax: 0.02, timeoutMs: 8000, evalSlug: 'eval.orchestration.plan_decompose', handlerKey: 'orchestration.plan_decompose', version: 1,
  },
  {
    slug: 'orchestration.judge_decision',
    team: 'orchestration', name: 'Karar Yargıcı',
    summary: 'Uzman+şüpheci çıktısından kanıta bağlı nihai kararı üretir',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'medium', dataSensitivity: 'internal',
    inputSchema: { findings: 'Finding[]', evidenceIds: 'string[]' }, outputSchema: { verdict: 'string', rationale: 'string[]' },
    defaultTier: 'medium', budgetUsdMax: 0.05, timeoutMs: 12000, evalSlug: 'eval.orchestration.judge_decision', handlerKey: null, version: 1,
  },
  // ── Lead Intelligence ─────────────────────────────────────────────────────
  {
    slug: 'lead.score_deterministic',
    team: 'lead_intelligence', name: 'Deterministik Fırsat Skoru',
    summary: 'Kanıttan LLM’siz tasarım/AI fırsat skorlarını hesaplar',
    kind: 'deterministic', permissionScopes: ['leads:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { evidence: 'Evidence[]' }, outputSchema: { design: 'number', ai: 'number', reasons: 'string[]' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.lead.score_deterministic', handlerKey: 'lead.score_deterministic', version: 1,
  },
  {
    slug: 'lead.match_services',
    team: 'lead_intelligence', name: 'Hizmet Eşleştirici',
    summary: 'Doğrulanmış kanıt ∩ katalog ile hizmet fırsatlarını sıralar',
    kind: 'deterministic', permissionScopes: ['leads:read', 'services:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { designScore: 'number', aiScore: 'number', sector: 'string', evidence: 'Evidence[]' }, outputSchema: { matches: 'ServiceMatch[]' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.lead.match_services', handlerKey: 'lead.match_services', version: 1,
  },
  {
    slug: 'lead.audit_website',
    team: 'lead_intelligence', name: 'Web Sitesi Denetçisi',
    summary: 'Tek lead sitesini kanıt zinciriyle (PSI/HTML/CTA) denetler',
    kind: 'composite', permissionScopes: ['leads:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { leadId: 'string', url: 'string' }, outputSchema: { evidence: 'Evidence[]', assessment: 'object' },
    defaultTier: 'light', budgetUsdMax: 0.1, timeoutMs: 30000, evalSlug: 'eval.lead.audit_website', handlerKey: 'lead.audit_website', version: 1,
  },
  // ── Satış ─────────────────────────────────────────────────────────────────
  {
    slug: 'sales.draft_cold_email',
    team: 'sales', name: 'Soğuk E-posta Taslakçısı',
    summary: 'Kanıta dayalı, tek-fırsat odaklı soğuk e-posta taslağı üretir',
    kind: 'llm', permissionScopes: ['leads:read', 'outreach:write'], riskLevel: 'medium', dataSensitivity: 'confidential',
    inputSchema: { leadId: 'string', angle: 'string' }, outputSchema: { subject: 'string', body: 'string' },
    defaultTier: 'medium', budgetUsdMax: 0.05, timeoutMs: 15000, evalSlug: 'eval.sales.draft_cold_email', handlerKey: null, version: 1,
  },
  {
    slug: 'sales.draft_proposal',
    team: 'sales', name: 'Teklif Taslakçısı',
    summary: 'Hizmet + fiyat kurallarıyla danışmanlık teklifi taslağı üretir',
    kind: 'llm', permissionScopes: ['leads:read', 'services:read', 'outreach:write'], riskLevel: 'high', dataSensitivity: 'confidential',
    inputSchema: { leadId: 'string', serviceSlug: 'string' }, outputSchema: { proposal: 'string' },
    defaultTier: 'heavy', budgetUsdMax: 0.2, timeoutMs: 25000, evalSlug: 'eval.sales.draft_proposal', handlerKey: null, version: 1,
  },
  {
    slug: 'sales.objection_handler',
    team: 'sales', name: 'İtiraz Karşılayıcı',
    summary: 'Yaygın satış itirazlarına danışmanlık çerçeveli yanıt üretir',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { objection: 'string', context: 'string' }, outputSchema: { response: 'string' },
    defaultTier: 'light', budgetUsdMax: 0.03, timeoutMs: 10000, evalSlug: 'eval.sales.objection_handler', handlerKey: null, version: 1,
  },
  {
    slug: 'sales.pricing_explain',
    team: 'sales', name: 'Fiyat Açıklayıcı',
    summary: 'Bir hizmet için fiyat mantığını kural tabanlı açıklar (uydurmasız)',
    kind: 'deterministic', permissionScopes: ['services:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { serviceSlug: 'string' }, outputSchema: { setupTl: 'number', monthlyTl: 'number', rationale: 'string' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.sales.pricing_explain', handlerKey: 'sales.pricing_explain', version: 1,
  },
  // ── Tasarım ───────────────────────────────────────────────────────────────
  {
    slug: 'design.brief_from_evidence',
    team: 'design', name: 'Tasarım Brief Üretici',
    summary: 'Site kanıtından somut tasarım iş kapsamı brief’i çıkarır',
    kind: 'llm', permissionScopes: ['leads:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { evidence: 'Evidence[]' }, outputSchema: { brief: 'string', scope: 'string[]' },
    defaultTier: 'medium', budgetUsdMax: 0.05, timeoutMs: 15000, evalSlug: 'eval.design.brief_from_evidence', handlerKey: null, version: 1,
  },
  {
    slug: 'design.critique_site',
    team: 'design', name: 'Site Tasarım Eleştirmeni',
    summary: 'Ekran görüntüsü kanıtına dayalı doğrulanabilir tasarım kritiği',
    kind: 'llm', permissionScopes: ['leads:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { screenshotUrl: 'string', evidence: 'Evidence[]' }, outputSchema: { findings: 'Finding[]', score: 'number' },
    defaultTier: 'light', budgetUsdMax: 0.05, timeoutMs: 15000, evalSlug: 'eval.design.critique_site', handlerKey: null, version: 1,
  },
  {
    slug: 'design.moodboard_prompt',
    team: 'design', name: 'Moodboard Prompt Üretici',
    summary: 'Marka tonuna göre İngilizce görsel üretim promptu yazar',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'public',
    inputSchema: { brand: 'string', direction: 'string' }, outputSchema: { prompt: 'string' },
    defaultTier: 'light', budgetUsdMax: 0.02, timeoutMs: 10000, evalSlug: 'eval.design.moodboard_prompt', handlerKey: null, version: 1,
  },
  // ── AI-Otomasyon ──────────────────────────────────────────────────────────
  {
    slug: 'automation.workflow_blueprint',
    team: 'ai_automation', name: 'Otomasyon Akış Planı',
    summary: 'İş sürecinden tetikleyici→aksiyon otomasyon planı üretir',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { process: 'string' }, outputSchema: { blueprint: 'object' },
    defaultTier: 'medium', budgetUsdMax: 0.05, timeoutMs: 15000, evalSlug: 'eval.automation.workflow_blueprint', handlerKey: null, version: 1,
  },
  {
    slug: 'automation.integration_matcher',
    team: 'ai_automation', name: 'Entegrasyon Eşleştirici',
    summary: 'İhtiyaca uygun otomasyon/entegrasyon araçlarını önerir',
    kind: 'deterministic', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { need: 'string', tools: 'string[]' }, outputSchema: { matches: 'string[]' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.automation.integration_matcher', handlerKey: 'automation.integration_matcher', version: 1,
  },
  {
    slug: 'automation.prompt_optimize',
    team: 'ai_automation', name: 'Prompt Optimizasyonu',
    summary: 'Bir görev için LLM promptunu yapılandırıp iyileştirir',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { task: 'string', draft: 'string' }, outputSchema: { optimized: 'string' },
    defaultTier: 'medium', budgetUsdMax: 0.04, timeoutMs: 12000, evalSlug: 'eval.automation.prompt_optimize', handlerKey: null, version: 1,
  },

  // ── Faz 5 otantik genişleme: kalan takımlar (YAPAY DOLGU YOK — her kayıt benzersiz
  // amaç + dolu I/O + izin + eval). handlerKey null → "kayıtlı, henüz aktif değil";
  // eval + handler eklenince active=true olur (registered ≠ active, §10.1). ─────────

  // ── Executive / Orkestrasyon ────────────────────────────────────────────────
  {
    slug: 'executive.goal_prioritize',
    team: 'executive', name: 'Hedef Önceliklendirici',
    summary: 'Aktif hedefleri etki×aciliyet ile sıralayıp tek odak önerir',
    kind: 'deterministic', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { goals: 'Goal[]' }, outputSchema: { ranked: 'Goal[]', focus: 'string' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.executive.goal_prioritize', handlerKey: null, version: 1,
  },
  {
    slug: 'executive.weekly_review',
    team: 'executive', name: 'Haftalık Retro Sentezleyici',
    summary: 'Haftanın run/metrik/kararlarından öğrenilenleri özetler',
    kind: 'llm', permissionScopes: ['assistant:read', 'metrics:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { runs: 'RunSummary[]', metrics: 'object' }, outputSchema: { wins: 'string[]', risks: 'string[]', nextFocus: 'string' },
    defaultTier: 'medium', budgetUsdMax: 0.06, timeoutMs: 15000, evalSlug: 'eval.executive.weekly_review', handlerKey: null, version: 1,
  },

  // ── Müşteri Yönetimi ────────────────────────────────────────────────────────
  {
    slug: 'client.health_score',
    team: 'customer_management', name: 'Müşteri Sağlık Skoru',
    summary: 'Etkileşim/ödeme/kapsam sinyalinden müşteri sağlık skoru üretir',
    kind: 'deterministic', permissionScopes: ['clients:read'], riskLevel: 'low', dataSensitivity: 'confidential',
    inputSchema: { signals: 'ClientSignal[]' }, outputSchema: { score: 'number', tier: 'string', reasons: 'string[]' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.client.health_score', handlerKey: null, version: 1,
  },
  {
    slug: 'client.churn_risk_flag',
    team: 'customer_management', name: 'Kayıp Riski İşaretleyici',
    summary: 'Sessizlik/gecikme desenlerinden müşteri kaybı riskini işaretler',
    kind: 'llm', permissionScopes: ['clients:read'], riskLevel: 'medium', dataSensitivity: 'confidential',
    inputSchema: { history: 'Interaction[]' }, outputSchema: { risk: 'string', signals: 'string[]', action: 'string' },
    defaultTier: 'light', budgetUsdMax: 0.03, timeoutMs: 10000, evalSlug: 'eval.client.churn_risk_flag', handlerKey: null, version: 1,
  },

  // ── İçerik ──────────────────────────────────────────────────────────────────
  {
    slug: 'content.calendar_plan',
    team: 'content', name: 'İçerik Takvimi Planlayıcı',
    summary: 'Tema+platformdan haftalık içerik takvimi ve format önerir',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { theme: 'string', platforms: 'string[]', cadence: 'string' }, outputSchema: { calendar: 'ContentSlot[]' },
    defaultTier: 'medium', budgetUsdMax: 0.05, timeoutMs: 15000, evalSlug: 'eval.content.calendar_plan', handlerKey: null, version: 1,
  },
  {
    slug: 'content.hook_variants',
    team: 'content', name: 'Kanca Varyantı Üretici',
    summary: 'Bir konu için scroll-durduran açılış kancası varyantları yazar',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'public',
    inputSchema: { topic: 'string', tone: 'string' }, outputSchema: { hooks: 'string[]' },
    defaultTier: 'light', budgetUsdMax: 0.03, timeoutMs: 10000, evalSlug: 'eval.content.hook_variants', handlerKey: null, version: 1,
  },

  // ── Reklam ──────────────────────────────────────────────────────────────────
  {
    slug: 'ads.copy_variants',
    team: 'ads', name: 'Reklam Metni Varyantı',
    summary: 'Teklif+kitleden A/B reklam metni varyantları üretir',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { offer: 'string', audience: 'string' }, outputSchema: { variants: 'AdCopy[]' },
    defaultTier: 'medium', budgetUsdMax: 0.04, timeoutMs: 12000, evalSlug: 'eval.ads.copy_variants', handlerKey: null, version: 1,
  },
  {
    slug: 'ads.audience_brief',
    team: 'ads', name: 'Kitle Brief Üretici',
    summary: 'Üründen hedefleme kitlesi ve ilgi/segment brief’i çıkarır',
    kind: 'llm', permissionScopes: ['assistant:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { product: 'string', goal: 'string' }, outputSchema: { audiences: 'AudienceSpec[]' },
    defaultTier: 'light', budgetUsdMax: 0.03, timeoutMs: 10000, evalSlug: 'eval.ads.audience_brief', handlerKey: null, version: 1,
  },

  // ── Araştırma ───────────────────────────────────────────────────────────────
  {
    slug: 'research.competitor_scan',
    team: 'research', name: 'Rakip Tarayıcı',
    summary: 'Verilen rakip URL’lerinden konumlanma+fiyat kanıtı toplar',
    kind: 'composite', permissionScopes: ['research:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { competitorUrls: 'string[]' }, outputSchema: { profiles: 'CompetitorProfile[]' },
    defaultTier: 'light', budgetUsdMax: 0.1, timeoutMs: 30000, evalSlug: 'eval.research.competitor_scan', handlerKey: null, version: 1,
  },
  {
    slug: 'research.trend_digest',
    team: 'research', name: 'Trend Özeti',
    summary: 'Niş sinyallerinden tasarım/AI trend özeti ve fırsat çıkarır',
    kind: 'llm', permissionScopes: ['research:read'], riskLevel: 'low', dataSensitivity: 'public',
    inputSchema: { niche: 'string', signals: 'string[]' }, outputSchema: { digest: 'string', opportunities: 'string[]' },
    defaultTier: 'medium', budgetUsdMax: 0.06, timeoutMs: 15000, evalSlug: 'eval.research.trend_digest', handlerKey: null, version: 1,
  },

  // ── Proje Yönetimi ──────────────────────────────────────────────────────────
  {
    slug: 'pm.scope_breakdown',
    team: 'project_management', name: 'Kapsam Ayrıştırıcı',
    summary: 'Proje brief’ini teslim edilebilir+tahmini iş kalemlerine böler',
    kind: 'deterministic', permissionScopes: ['projects:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { brief: 'string' }, outputSchema: { deliverables: 'Deliverable[]', estimateHours: 'number' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 4000, evalSlug: 'eval.pm.scope_breakdown', handlerKey: null, version: 1,
  },
  {
    slug: 'pm.milestone_plan',
    team: 'project_management', name: 'Kilometre Taşı Planı',
    summary: 'Teslimlerden bağımlı kilometre taşı ve zaman çizelgesi kurar',
    kind: 'llm', permissionScopes: ['projects:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { deliverables: 'Deliverable[]', deadline: 'string' }, outputSchema: { milestones: 'Milestone[]' },
    defaultTier: 'medium', budgetUsdMax: 0.04, timeoutMs: 12000, evalSlug: 'eval.pm.milestone_plan', handlerKey: null, version: 1,
  },

  // ── Finans ──────────────────────────────────────────────────────────────────
  {
    slug: 'finance.retainer_pricing',
    team: 'finance', name: 'Retainer Fiyat Hesaplayıcı',
    summary: 'Kapsam+saat maliyetinden aylık retainer fiyat aralığı hesaplar',
    kind: 'deterministic', permissionScopes: ['finance:read'], riskLevel: 'low', dataSensitivity: 'confidential',
    inputSchema: { scopeHours: 'number', hourlyCost: 'number', margin: 'number' }, outputSchema: { monthlyTl: 'number', range: 'number[]' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 2000, evalSlug: 'eval.finance.retainer_pricing', handlerKey: null, version: 1,
  },
  {
    slug: 'finance.cashflow_projection',
    team: 'finance', name: 'Nakit Akışı Projeksiyonu',
    summary: 'Aktif retainer+pipeline’dan aylık nakit akışı öngörür',
    kind: 'deterministic', permissionScopes: ['finance:read'], riskLevel: 'low', dataSensitivity: 'confidential',
    inputSchema: { retainers: 'number[]', pipeline: 'PipelineItem[]' }, outputSchema: { months: 'MonthProjection[]' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.finance.cashflow_projection', handlerKey: null, version: 1,
  },

  // ── Kişisel Disiplin / Alışkanlık ───────────────────────────────────────────
  {
    slug: 'discipline.habit_streak_analyze',
    team: 'personal_discipline', name: 'Alışkanlık Zinciri Analizi',
    summary: 'Alışkanlık loglarından zincir/kayma desenini ve tetikçiyi bulur',
    kind: 'deterministic', permissionScopes: ['life:read'], riskLevel: 'low', dataSensitivity: 'confidential',
    inputSchema: { logs: 'HabitLog[]' }, outputSchema: { streak: 'number', slipPattern: 'string', nudge: 'string' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.discipline.habit_streak_analyze', handlerKey: null, version: 1,
  },
  {
    slug: 'discipline.focus_block_plan',
    team: 'personal_discipline', name: 'Odak Bloğu Planı',
    summary: 'Enerji+takvimden günün derin-çalışma bloklarını yerleştirir',
    kind: 'llm', permissionScopes: ['life:read'], riskLevel: 'low', dataSensitivity: 'confidential',
    inputSchema: { energyCurve: 'string', commitments: 'string[]' }, outputSchema: { blocks: 'FocusBlock[]' },
    defaultTier: 'light', budgetUsdMax: 0.02, timeoutMs: 10000, evalSlug: 'eval.discipline.focus_block_plan', handlerKey: null, version: 1,
  },

  // ── Kariyer ─────────────────────────────────────────────────────────────────
  {
    slug: 'career.portfolio_gap',
    team: 'career', name: 'Portföy Boşluk Analizi',
    summary: 'Hedef role göre portföydeki eksik kanıt/parçaları belirler',
    kind: 'llm', permissionScopes: ['career:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { targetRole: 'string', portfolio: 'PortfolioItem[]' }, outputSchema: { gaps: 'string[]', nextPieces: 'string[]' },
    defaultTier: 'medium', budgetUsdMax: 0.05, timeoutMs: 15000, evalSlug: 'eval.career.portfolio_gap', handlerKey: null, version: 1,
  },
  {
    slug: 'career.skill_roadmap',
    team: 'career', name: 'Beceri Yol Haritası',
    summary: 'Mevcut→hedef seviye için sıralı beceri edinme planı üretir',
    kind: 'llm', permissionScopes: ['career:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { current: 'string[]', target: 'string' }, outputSchema: { roadmap: 'RoadmapStep[]' },
    defaultTier: 'medium', budgetUsdMax: 0.05, timeoutMs: 15000, evalSlug: 'eval.career.skill_roadmap', handlerKey: null, version: 1,
  },

  // ── Sistem Operasyonları ────────────────────────────────────────────────────
  {
    slug: 'sysops.migration_lint',
    team: 'system_ops', name: 'Migration Denetçisi',
    summary: 'SQL migration’ı idempotency/RLS/atomiklik kurallarına göre denetler',
    kind: 'deterministic', permissionScopes: ['system:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { sql: 'string' }, outputSchema: { issues: 'LintIssue[]', ok: 'boolean' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.sysops.migration_lint', handlerKey: null, version: 1,
  },
  {
    slug: 'sysops.cost_anomaly_detect',
    team: 'system_ops', name: 'Maliyet Anomali Dedektörü',
    summary: 'ai_cost_logs zaman serisinden ani harcama sıçramasını yakalar',
    kind: 'deterministic', permissionScopes: ['metrics:read'], riskLevel: 'low', dataSensitivity: 'internal',
    inputSchema: { series: 'CostPoint[]' }, outputSchema: { anomalies: 'Anomaly[]', peak: 'number' },
    defaultTier: 'light', budgetUsdMax: 0, timeoutMs: 3000, evalSlug: 'eval.sysops.cost_anomaly_detect', handlerKey: null, version: 1,
  },
]
