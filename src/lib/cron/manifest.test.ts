import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CRON_MANIFEST, manifestCronPairs } from './manifest'

// PARITY: kanonik cron manifesti ⇔ vercel.json crons BİREBİR. Bir taraf
// değişip diğeri unutulursa bu test KIRILIR → UI'ın gösterdiği sıklık her
// zaman GERÇEKTEN deploy edilen sıklıktır (audit bulgu #3).

function loadVercelCrons(): Array<{ path: string; schedule: string }> {
  const vercelPath = fileURLToPath(new URL('../../../vercel.json', import.meta.url))
  const json = JSON.parse(readFileSync(vercelPath, 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>
  }
  return json.crons ?? []
}

function sortPairs(pairs: Array<{ path: string; schedule: string }>) {
  return [...pairs].sort((a, b) =>
    a.path === b.path ? a.schedule.localeCompare(b.schedule) : a.path.localeCompare(b.path),
  )
}

describe('cron manifest ⇔ vercel.json parity', () => {
  it('manifest ve vercel.json AYNI (path, schedule) kümesini içerir', () => {
    const manifest = sortPairs(manifestCronPairs())
    const vercel = sortPairs(loadVercelCrons())
    expect(manifest).toEqual(vercel)
  })

  it('gmail-ingest cron KAYITLI (Faz 3 — reply SLA)', () => {
    const paths = manifestCronPairs().map((p) => p.path)
    expect(paths).toContain('/api/cron/gmail-ingest')
    const vercelPaths = loadVercelCrons().map((p) => p.path)
    expect(vercelPaths).toContain('/api/cron/gmail-ingest')
  })

  it('her manifest girdisi geçerli 5-alanlı cron ifadesine sahip', () => {
    for (const job of CRON_MANIFEST) {
      expect(job.schedule.trim().split(/\s+/)).toHaveLength(5)
      expect(job.name.length).toBeGreaterThan(0)
      expect(job.cadenceLabel.length).toBeGreaterThan(0)
    }
  })

  it('en az bir SLA-kritik cron sub-daily (follow-up/reply günlük-tek yetmez)', () => {
    const slaCrons = CRON_MANIFEST.filter((j) => j.slaCritical)
    expect(slaCrons.length).toBeGreaterThan(0)
    // Orchestrator 4× + gmail-ingest → follow-up/reply günden fazla işlenir.
    const orchestratorCount = CRON_MANIFEST.filter((j) => j.path === '/api/cron/orchestrator').length
    expect(orchestratorCount).toBeGreaterThanOrEqual(2)
  })
})
