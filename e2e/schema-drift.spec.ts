import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supabaseAdmin } from './helpers'

// Faz 0.1 — şema drift kapısı: izole test DB'nin yapısı, App DB'den alınmış
// kanonik fingerprint'le (expected-fingerprint.json) birebir eşleşmeli.
// Kapsam: kolonlar, PK/UNIQUE/CHECK/FK, indexler, fonksiyonlar, triggerlar, RLS bayrağı.
// Bilinçli sapmalar (policy/grant/event-trigger/e2e_%) fingerprint'in kendisinde dışlanır
// — bkz. e2e/schema/README.md.

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
  ) as { tables: Record<string, string>; functions_md5: string; triggers_md5: string }

  const db = supabaseAdmin()
  const { data, error } = await db.rpc('e2e_schema_fingerprint')
  expect(error, `fingerprint RPC hatası: ${error?.message}`).toBeNull()
  const actual = data as { tables: Record<string, string>; functions_md5: string; triggers_md5: string }

  // Ana ekranların okuduğu tablolar referansta MUTLAKA olmalı (eksik alt-küme regresyonu koruması)
  for (const t of REQUIRED_TABLES) {
    expect(expected.tables[t], `referans fingerprint'te zorunlu tablo eksik: ${t}`).toBeTruthy()
  }

  const allNames = [...new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)])].sort()
  const drifted = allNames.filter((t) => expected.tables[t] !== actual.tables[t])
  const missing = allNames.filter((t) => !actual.tables[t])
  const extra = allNames.filter((t) => !expected.tables[t])
  expect(
    drifted,
    `Şema drift! eksik=[${missing.join(',')}] fazla=[${extra.join(',')}] hash-farkı=[${drifted
      .filter((t) => !missing.includes(t) && !extra.includes(t))
      .join(',')}] — senkron prosedürü: e2e/schema/README.md`,
  ).toEqual([])

  expect(actual.functions_md5, 'public fonksiyon tanımları drift etti').toBe(expected.functions_md5)
  expect(actual.triggers_md5, 'trigger tanımları drift etti').toBe(expected.triggers_md5)
})
