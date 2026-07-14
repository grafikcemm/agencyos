import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CRON_MANIFEST, manifestCronPairs } from './manifest'

// PARITY: kanonik cron manifesti ⇔ GitHub Actions scheduler BİREBİR. Bir taraf
// değişip diğeri unutulursa bu test KIRILIR → UI'ın gösterdiği sıklık her
// zaman GERÇEKTEN deploy edilen sıklıktır (audit bulgu #3).

function loadExternalSchedulerCrons(): Array<{ path: string; schedule: string }> {
  const workflowPath = fileURLToPath(new URL('../../../.github/workflows/agencyos-cron.yml', import.meta.url))
  const workflow = readFileSync(workflowPath, 'utf8')
  const pairs: Array<{ path: string; schedule: string }> = []

  for (const line of workflow.split(/\r?\n/)) {
    const route = line.match(/^\s*((?:"[^"]+"\|?)+)\)\s+endpoint="([a-z0-9-]+)"\s*;;/)
    if (!route) continue
    const schedules = [...route[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
    for (const schedule of schedules) pairs.push({ path: `/api/cron/${route[2]}`, schedule })
  }

  return pairs
}

function loadVercelConfig(): { crons?: unknown[] } {
  const vercelPath = fileURLToPath(new URL('../../../vercel.json', import.meta.url))
  return JSON.parse(readFileSync(vercelPath, 'utf8')) as { crons?: unknown[] }
}

function sortPairs(pairs: Array<{ path: string; schedule: string }>) {
  return [...pairs].sort((a, b) =>
    a.path === b.path ? a.schedule.localeCompare(b.schedule) : a.path.localeCompare(b.path),
  )
}

describe('cron manifest ⇔ external scheduler parity', () => {
  it('manifest ve GitHub Actions AYNI (path, schedule) kümesini içerir', () => {
    const manifest = sortPairs(manifestCronPairs())
    const external = sortPairs(loadExternalSchedulerCrons())
    expect(manifest).toEqual(external)
  })

  it('gmail-ingest cron KAYITLI (Faz 3 — reply SLA)', () => {
    const paths = manifestCronPairs().map((p) => p.path)
    expect(paths).toContain('/api/cron/gmail-ingest')
    const externalPaths = loadExternalSchedulerCrons().map((p) => p.path)
    expect(externalPaths).toContain('/api/cron/gmail-ingest')
  })

  it('Vercel Hobby deploy’unu engelleyecek yerleşik cron içermez', () => {
    expect(loadVercelConfig().crons ?? []).toEqual([])
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
