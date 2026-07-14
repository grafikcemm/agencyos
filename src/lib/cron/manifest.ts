// ─────────────────────────────────────────────────────────────────────────────
// KANONİK cron manifesti (FINAL PILOT BLOCKERS Faz 3).
//
// TEK KAYNAK: hem vercel.json crons'u hem /schedule UI bundan türer. UI artık
// "hayali sıklık" göstermez (audit bulgu #3 — "*/10" ≠ gerçek "0 9 * * *").
// Parity CI testi (manifest.test.ts) vercel.json ⇔ bu manifest eşitliğini
// zorlar; bir taraf değişip diğeri unutulursa test KIRILIR.
//
// PLAN NOTU: birden çok günlük/saatlik cron Vercel Hobby'de DESTEKLENMEZ
// (Hobby = günde 1, en çok 2 cron). Bu manifest sub-daily (orchestrator 4×,
// gmail-ingest 8×) içerdiğinden Vercel PRO gerektirir — plan yetersizse
// deploy'da cron reddi görünür (aşağıdaki requiresProPlan bayrağı UI'da uyarır).
// ─────────────────────────────────────────────────────────────────────────────

export interface CronJob {
  /** Vercel cron path (vercel.json ile birebir). */
  path: string
  /** Cron ifadesi (UTC — Vercel cron'ları UTC yorumlar). */
  schedule: string
  /** UI başlığı. */
  name: string
  /** UI açıklaması — GERÇEK cadence'i anlatır. */
  description: string
  /** İnsan-okur cadence etiketi (UTC bazlı; TR = UTC+3). */
  cadenceLabel: string
  /** Follow-up / reply SLA açısından kritik mi (günlük-tek yetersiz olan iş). */
  slaCritical: boolean
}

/** Sub-daily cron sayısı Hobby limitini aştığından Pro gerekir. */
export const CRON_REQUIRES_PRO_PLAN = true

export const CRON_MANIFEST: CronJob[] = [
  {
    path: '/api/cron/daily-scan',
    schedule: '0 5 * * *',
    name: 'Günlük Lead Tarama',
    description: 'Her gün yeni leadleri tarar, kanonik kataloga göre sıralar.',
    cadenceLabel: 'Her gün 08:00 TR',
    slaCritical: false,
  },
  {
    path: '/api/cron/opportunity-scan',
    schedule: '0 6 * * 1',
    name: 'Fırsat Tarama',
    description: 'Pazartesi sabahları sektörel fırsatları ve sıcak pencereleri analiz eder.',
    cadenceLabel: 'Her Pazartesi 09:00 TR',
    slaCritical: false,
  },
  {
    path: '/api/cron/agent-tick',
    schedule: '0 9 * * *',
    name: 'Ajan Tick (Kuyruk İşleme)',
    description: 'Görev kuyruğunu işler; bekleyen görevleri uzman ajanlara dağıtır.',
    cadenceLabel: 'Her gün 12:00 TR',
    slaCritical: false,
  },
  {
    path: '/api/cron/job-scan',
    schedule: '0 4 * * *',
    name: 'İş İlanı Tarama',
    description: 'Kariyer radarı için yeni ilanları tarar.',
    cadenceLabel: 'Her gün 07:00 TR',
    slaCritical: false,
  },
  {
    path: '/api/cron/person-scan',
    schedule: '30 3 * * *',
    name: 'Kişi Tarama',
    description: 'Lead için karar-verici kişi/pozisyon zenginleştirmesi.',
    cadenceLabel: 'Her gün 06:30 TR',
    slaCritical: false,
  },
  {
    path: '/api/cron/orchestrator',
    schedule: '30 5 * * *',
    name: 'Orkestratör (Sabah)',
    description: 'Günlük operasyonu kurgular; recipient/evidence eksiklerini gece zenginleştirir, follow-up SLA’sını işler.',
    cadenceLabel: 'Her gün 08:30 TR',
    slaCritical: true,
  },
  {
    path: '/api/cron/orchestrator',
    schedule: '0 10 * * *',
    name: 'Orkestratör (Öğle)',
    description: 'Gün içi follow-up ve karar-bekleyen iş güncellemesi.',
    cadenceLabel: 'Her gün 13:00 TR',
    slaCritical: true,
  },
  {
    path: '/api/cron/orchestrator',
    schedule: '30 16 * * *',
    name: 'Orkestratör (İkindi)',
    description: 'Gün içi follow-up ve karar-bekleyen iş güncellemesi.',
    cadenceLabel: 'Her gün 19:30 TR',
    slaCritical: true,
  },
  {
    path: '/api/cron/orchestrator',
    schedule: '30 19 * * *',
    name: 'Orkestratör (Akşam)',
    description: 'Gün sonu follow-up ve ertesi gün hazırlığı.',
    cadenceLabel: 'Her gün 22:30 TR',
    slaCritical: true,
  },
  {
    path: '/api/cron/gmail-ingest',
    schedule: '0 */3 * * *',
    name: 'Gmail Inbound Sync',
    description: 'Gelen cevapları algılar (history cursor), follow-up’ı durdurur, opt-out’u uygular. Bayrak açıksa gerçek, kapalıysa shadow.',
    cadenceLabel: 'Her 3 saatte bir',
    slaCritical: true,
  },
  {
    path: '/api/cron/enrichment',
    schedule: '0 1 * * *',
    name: 'Recipient + Evidence Enrichment',
    description: 'Gece: yüksek öncelikli, alıcısı/evidence’i eksik leadleri otomatik zenginleştirir (cap’li, HITL eşikli). Bayrak açıksa gerçek, kapalıysa shadow.',
    cadenceLabel: 'Her gün 04:00 TR',
    slaCritical: true,
  },
  {
    path: '/api/cron/weekly-retro',
    schedule: '0 16 * * 0',
    name: 'Haftalık Retro',
    description: 'Haftalık performans ve tema desen özeti.',
    cadenceLabel: 'Her Pazar 19:00 TR',
    slaCritical: false,
  },
  {
    path: '/api/cron/model-health-check',
    schedule: '0 2 * * *',
    name: 'Model Sağlık Kontrolü',
    description: 'LLM model erişilebilirliğini ve maliyet tavanlarını denetler.',
    cadenceLabel: 'Her gün 05:00 TR',
    slaCritical: false,
  },
]

/** vercel.json crons'u ile karşılaştırma için normalize (path+schedule çifti). */
export function manifestCronPairs(): Array<{ path: string; schedule: string }> {
  return CRON_MANIFEST.map((j) => ({ path: j.path, schedule: j.schedule }))
}
