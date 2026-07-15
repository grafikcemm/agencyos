/**
 * AgencyOS customer-data clean-start auditor.
 *
 * It creates a complete, gitignored local backup and count manifest first.
 * Deletion is opt-in, project-ref locked, ordered around the live FK graph and
 * followed by a full zero-row verification. If any step fails, it stops and
 * leaves the backup available for recovery.
 *
 * Usage:
 *   npm run clean:start -- --project-ref=<APP_PROJECT_REF>
 *   npm run clean:start -- --project-ref=<APP_PROJECT_REF> --confirm-delete=AGENCYOS_CUSTOMER_DATA
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const CUSTOMER_TABLES = [
  { name: 'outreach_claim_evidence', key: 'id' },
  { name: 'outreach_message_versions', key: 'id' },
  { name: 'outreach_send_attempts', key: 'id' },
  { name: 'email_messages', key: 'id' },
  { name: 'email_threads', key: 'id' },
  { name: 'follow_up_sequences', key: 'id' },
  { name: 'follow_ups', key: 'id' },
  { name: 'proposal_events', key: 'id' },
  { name: 'proposal_approvals', key: 'id' },
  { name: 'proposal_versions', key: 'id' },
  { name: 'proposals', key: 'id' },
  { name: 'outreach_messages', key: 'id' },
  { name: 'approval_requests', key: 'id', filter: { column: 'action', value: 'send-gmail' } },
  { name: 'gmail_inbound_quarantine', key: 'gmail_message_id' },
  { name: 'lead_action_audit', key: 'id' },
  { name: 'projects', key: 'id' },
  { name: 'contacts', key: 'id' },
  { name: 'apollo_enrichments', key: 'lead_id' },
  { name: 'lead_match_feedback', key: 'id' },
  { name: 'lead_service_matches', key: 'id' },
  { name: 'lead_assessments', key: 'id' },
  { name: 'lead_evidence', key: 'id' },
  { name: 'lead_intel_runs', key: 'id' },
  { name: 'leads', key: 'id' },
  { name: 'person_leads', key: 'id' },
  { name: 'person_scan_runs', key: 'id' },
  { name: 'scan_runs', key: 'id' },
]

const PRESERVED_TABLES = [
  'suppression_list',
  'consent_records',
  'settings',
  'gmail_accounts',
  'service_catalog',
  'playbooks',
  'ai_cost_logs',
  'tool_cost_logs',
]

// Minimal parent/blocker order. Remaining customer tables are removed by the
// declared FK cascades and are still verified individually afterwards.
const DELETE_ORDER = [
  'email_messages',
  'email_threads',
  'outreach_messages',
  'proposals',
  'projects',
  'lead_action_audit',
  'leads',
  'approval_requests',
  'gmail_inbound_quarantine',
  'person_leads',
  'lead_intel_runs',
  'person_scan_runs',
  'scan_runs',
]

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  const result = {}
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    result[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return result
}

function projectRef(url) {
  try {
    return new URL(url).hostname.split('.')[0]
  } catch {
    return ''
  }
}

function expectedRefArg() {
  const prefix = '--project-ref='
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? ''
}

function deleteConfirmation() {
  const prefix = '--confirm-delete='
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? ''
}

async function fetchAll(client, spec) {
  const pageSize = 1000
  const rows = []
  for (let from = 0; ; from += pageSize) {
    let query = client
      .from(spec.name)
      .select('*')
      .order(spec.key, { ascending: true })
      .range(from, from + pageSize - 1)
    if (spec.filter) query = query.eq(spec.filter.column, spec.filter.value)
    const { data, error } = await query
    if (error) throw new Error(`${spec.name} yedeklenemedi: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}

async function deleteRows(client, spec) {
  let query = client.from(spec.name).delete()
  if (spec.filter) {
    query = query.eq(spec.filter.column, spec.filter.value)
  } else {
    query = query.not(spec.key, 'is', null)
  }
  const { error } = await query
  if (error) throw new Error(`${spec.name} silinemedi: ${error.message}`)
}

async function countRows(client, table) {
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table} sayilamadi: ${error.message}`)
  return count ?? 0
}

async function main() {
  const fileEnv = loadEnvFile(path.join(process.cwd(), '.env.local'))
  const env = { ...fileEnv, ...process.env }
  const appUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const appRef = projectRef(appUrl)
  const lifeRef = projectRef(env.NEXT_PUBLIC_LIFE_SUPABASE_URL)
  const e2eRef = projectRef(env.E2E_SUPABASE_URL)
  const expectedRef = expectedRefArg()

  if (!appUrl || !serviceKey || !appRef) {
    throw new Error('App Supabase URL/service-role yapılandırması eksik')
  }
  if (!expectedRef || expectedRef !== appRef) {
    throw new Error(`Hedef proje doğrulanmadı. --project-ref=${appRef} ile yeniden çalıştırın`)
  }
  if (appRef === lifeRef || appRef === e2eRef) {
    throw new Error('App DB hedefi LIFE veya E2E projesiyle aynı; işlem fail-closed durduruldu')
  }

  const client = createClient(appUrl, serviceKey, { auth: { persistSession: false } })
  const data = {}
  const counts = {}
  for (const spec of CUSTOMER_TABLES) {
    const rows = await fetchAll(client, spec)
    data[spec.name] = rows
    counts[spec.name] = rows.length
  }
  const preservedCounts = {}
  for (const table of PRESERVED_TABLES) {
    preservedCounts[table] = await countRows(client, table)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const backupDir = path.join(process.cwd(), 'output', 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `agencyos-customer-data-${stamp}.json`)
  const payload = JSON.stringify({
    created_at: new Date().toISOString(),
    project_ref: appRef,
    scope: 'AgencyOS App DB customer/revenue operations only',
    preserved_tables: PRESERVED_TABLES,
    preserved_counts: preservedCounts,
    counts,
    data,
  }, null, 2)
  fs.writeFileSync(backupPath, payload, { encoding: 'utf8', mode: 0o600 })
  const digest = crypto.createHash('sha256').update(payload).digest('hex')
  fs.writeFileSync(`${backupPath}.sha256`, `${digest}  ${path.basename(backupPath)}\n`, { encoding: 'utf8', mode: 0o600 })

  const confirmation = deleteConfirmation()
  if (!confirmation) {
    console.log(JSON.stringify({
      ok: true,
      deleted: false,
      projectRef: appRef,
      backupPath,
      sha256: digest,
      counts,
      preservedCounts,
      note: 'Dry-run/yedek tamam. Silmek için exact confirmation flag gerekir.',
    }, null, 2))
    return
  }
  if (confirmation !== 'AGENCYOS_CUSTOMER_DATA') {
    throw new Error('Silme confirmation değeri uyuşmuyor; işlem durduruldu')
  }

  for (const table of DELETE_ORDER) {
    const spec = CUSTOMER_TABLES.find((item) => item.name === table)
    if (!spec) throw new Error(`Silme planında bilinmeyen tablo: ${table}`)
    if (counts[table] > 0) await deleteRows(client, spec)
  }

  const remaining = {}
  for (const spec of CUSTOMER_TABLES) {
    remaining[spec.name] = (await fetchAll(client, spec)).length
  }
  const nonZero = Object.entries(remaining).filter(([, count]) => count !== 0)
  if (nonZero.length > 0) {
    throw new Error(`Temizlik doğrulanamadı: ${nonZero.map(([name, count]) => `${name}=${count}`).join(', ')}`)
  }

  console.log(JSON.stringify({
    ok: true,
    deleted: true,
    projectRef: appRef,
    backupPath,
    sha256: digest,
    counts,
    remaining,
    preservedCounts,
    note: 'Müşteri operasyon verisi temizlendi; uyum/suppression ve sistem ayarları korundu.',
  }, null, 2))
}

main().catch((error) => {
  console.error(`Clean-start audit başarısız: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
