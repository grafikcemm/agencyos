import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseAdmin } from './helpers'

// Faz 0.1 — şema drift kapısı: izole test DB'nin yapısı, App DB'den alınmış
// kanonik fingerprint'le (expected-fingerprint.json) birebir eşleşmeli.
// Kapsam: kolonlar, PK/UNIQUE/CHECK/FK, indexler, fonksiyonlar, triggerlar, RLS bayrağı.
// Bilinçli sapmalar (policy/grant/event-trigger/e2e_%) fingerprint'in kendisinde dışlanır
// — bkz. e2e/schema/README.md.

interface Fingerprint {
  tables: Record<string, string>
  views: Record<string, string>
  functions_md5: string
  triggers_md5: string
}

// Ana ekranların okuduğu view'lar test DB'de MUTLAKA bulunmalı (finding #7:
// /api/runs 500 → runs view'ı ilk çıkarımda atlanmıştı).
const REQUIRED_VIEWS = ['runs', 'run_steps', 'leads_with_status', 'sector_engagement_stats_v2']

const REQUIRED_TABLES = [
  'leads', 'person_leads', 'knowledge_docs', 'agents', 'agent_tasks', 'projects',
  'ai_cost_logs', 'job_listings', 'lead_assessments', 'lead_service_matches',
  'outreach_messages', 'outreach_send_attempts', 'approval_requests',
  'email_threads', 'email_messages', 'follow_up_sequences', 'suppression_list',
  'gmail_accounts', 'settings', 'service_catalog', 'tool_cost_logs',
  'lead_evidence', 'lead_match_feedback', 'run_spans', 'directives',
]

test('şema drift: test DB fingerprint == App DB kanonik referansı', async () => {
  const expected = JSON.parse(
    readFileSync(join(process.cwd(), 'e2e', 'schema', 'expected-fingerprint.json'), 'utf8'),
  ) as Fingerprint

  const db = supabaseAdmin()
  const { data, error } = await db.rpc('e2e_schema_fingerprint')
  expect(error, `fingerprint RPC hatası: ${error?.message}`).toBeNull()
  const actual = data as Fingerprint

  // Ana ekranların okuduğu tablolar referansta MUTLAKA olmalı (eksik alt-küme regresyonu koruması)
  for (const t of REQUIRED_TABLES) {
    expect(expected.tables[t], `referans fingerprint'te zorunlu tablo eksik: ${t}`).toBeTruthy()
  }

  for (const v of REQUIRED_VIEWS) {
    expect(expected.views?.[v], `referans fingerprint'te zorunlu view eksik: ${v}`).toBeTruthy()
  }

  const diff = (kind: 'tables' | 'views') => {
    const names = [...new Set([...Object.keys(expected[kind]), ...Object.keys(actual[kind] ?? {})])].sort()
    const missing = names.filter((t) => !actual[kind]?.[t])
    const extra = names.filter((t) => !expected[kind][t])
    const drifted = names.filter((t) => expected[kind][t] !== actual[kind]?.[t])
    return { missing, extra, drifted }
  }

  const t = diff('tables')
  expect(
    t.drifted,
    `Tablo drift! eksik=[${t.missing.join(',')}] fazla=[${t.extra.join(',')}] hash-farkı=[${t.drifted
      .filter((x) => !t.missing.includes(x) && !t.extra.includes(x))
      .join(',')}] — senkron: e2e/schema/README.md`,
  ).toEqual([])

  const v = diff('views')
  expect(
    v.drifted,
    `View drift! eksik=[${v.missing.join(',')}] fazla=[${v.extra.join(',')}] hash-farkı=[${v.drifted
      .filter((x) => !v.missing.includes(x) && !v.extra.includes(x))
      .join(',')}] — senkron: e2e/schema/README.md`,
  ).toEqual([])

  expect(actual.functions_md5, 'public fonksiyon tanımları drift etti').toBe(expected.functions_md5)
  expect(actual.triggers_md5, 'trigger tanımları drift etti').toBe(expected.triggers_md5)
})
