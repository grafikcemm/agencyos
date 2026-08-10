/**
 * 9 Ağustos 2026 B2B araştırmasındaki 60 doğrulanmış şirketi `leads` tablosuna
 * KAYNAKLI biçimde alır.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GÜVENLİK SÖZLEŞMESİ
 *
 *   • Varsayılan mod --dry-run. Hiçbir şey yazmaz.
 *   • --apply olmadan tek satır bile değişmez.
 *   • Mevcut satırlarda YALNIZ boş araştırma alanları doldurulur. Operasyonel
 *     durum, uyum (lawful_basis / suppression), skor ve provenance ASLA ezilmez
 *     (bkz. src/lib/research/seedMapper.ts::PROTECTED_FIELDS).
 *   • --rollback yalnız o koşuda EKLENEN UUID'leri siler. `DELETE WHERE
 *     source_batch=...` KULLANILMAZ — önceden var olan eşleşmiş satırları
 *     silerdi.
 *   • Rapor dosyası canlı kayıt kimliği taşır; `reports/` gitignore'dadır.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KULLANIM
 *
 *   node scripts/seed-research-leads.ts --preflight
 *       Şema ve duplicate kontrolü. Migration 068 uygulanmadan önce çalıştır.
 *
 *   node scripts/seed-research-leads.ts            # --dry-run varsayılan
 *       Ne olacağını raporlar, hiçbir şey yazmaz.
 *
 *   node scripts/seed-research-leads.ts --apply
 *       Uygular ve reports/ altına geri alma raporu yazar.
 *
 *   node scripts/seed-research-leads.ts --emit-json
 *       Bağlantı/anahtar istemeden kanonik insert satırlarını stdout'a yazar.
 *       SQL Editor/MCP taşıması içindir; tek başına hiçbir yere yazmaz.
 *
 *   node scripts/seed-research-leads.ts --rollback reports/seed-<...>.json
 *       Yalnız o koşuda eklenen satırları siler.
 *
 * Gerekli ortam değişkenleri (DEĞERLER ASLA LOG'LANMAZ):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  mapResearchLead,
  mergeIntoExisting,
  insertRow,
  SOURCE_BATCH,
  PROTECTED_FIELDS,
  type RawResearchLead,
  type MappedLead,
} from '../src/lib/research/seedMapper'
import { normalizeDomain } from '../src/lib/leads/domain'
import { currentEpoch } from '../src/lib/leads/epoch'

const RESEARCH_FILE = 'docs/grafikcem-b2b-pazar-arastirmasi-2026-08-09.json'

/** Mevcut satırdan çekilecek alanlar — `select('*')` yapılmaz, PII genişlemesin. */
const EXISTING_SELECT = [
  'id',
  'acquisition_epoch',
  'retired_at',
  'business_name',
  'domain',
  'domain_normalized',
  'website',
  'country',
  'city',
  'niche_id',
  'employee_band',
  'ecommerce_status',
  'advertising_activity',
  'active_social_channels',
  'trigger_label',
  'trigger_date',
  'trigger_date_raw',
  'evidence_urls',
  'verified_at',
  'research_confidence',
  'research_score',
  'research_score_breakdown',
  'case_match',
  'offer_match_label',
  'offer_match_id',
  'pain_point',
  'decision_maker',
  'sales_angle',
  'next_check_date',
  'source_batch',
  'seeded_at',
  'provenance',
].join(',')

type Mode = 'preflight' | 'dry-run' | 'apply' | 'rollback' | 'emit-json'

interface Report {
  mode: Mode
  ranAt: string
  sourceBatch: string
  researchFile: string
  totals: {
    researchRecords: number
    toInsert: number
    toUpdate: number
    unchanged: number
    errors: number
  }
  insertedIds: string[]
  matchedExisting: { id: string; domain: string; filled: string[] }[]
  preservedFields: { id: string; domain: string; keptExisting: string[] }[]
  protectedNeverWritten: string[]
  byNiche: Record<string, number>
  byConfidence: Record<string, number>
  warnings: string[]
  errors: string[]
}

function parseArgs(argv: string[]): { mode: Mode; reportPath: string | null; rollbackFile: string | null } {
  const has = (flag: string) => argv.includes(flag)
  const valueOf = (flag: string): string | null => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
  }

  const rollbackFile = valueOf('--rollback')
  let mode: Mode = 'dry-run'
  if (has('--preflight')) mode = 'preflight'
  else if (has('--emit-json')) mode = 'emit-json'
  else if (rollbackFile) mode = 'rollback'
  else if (has('--apply')) mode = 'apply'

  if (has('--rollback') && !rollbackFile) {
    throw new Error('--rollback bir rapor dosyası yolu gerektirir')
  }

  return { mode, reportPath: valueOf('--report'), rollbackFile }
}

function requireClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı olmalı. ' +
        '(Değerler bu betikte hiçbir yere yazılmaz.)',
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

function loadResearch(): RawResearchLead[] {
  const raw = JSON.parse(readFileSync(RESEARCH_FILE, 'utf8')) as { leads: RawResearchLead[] }
  if (!Array.isArray(raw.leads) || raw.leads.length === 0) {
    throw new Error(`${RESEARCH_FILE} içinde lead bulunamadı`)
  }
  return raw.leads
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFLIGHT — migration'dan ÖNCE çalışır
// ─────────────────────────────────────────────────────────────────────────────

const DUPLICATE_SQL = `-- Migration 068 uygulanmadan ÖNCE Supabase SQL Editor'da çalıştır.
-- Sonuç BOŞ gelmelidir. Satır dönerse UNIQUE constraint eklenemez;
-- önce bu şirketler birleştirilmeli veya biri arşivlenmeli.
select
  lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(btrim(coalesce(website, ''))), '^[a-z][a-z0-9+.-]*://', ''),
            '^[^/@]*@', ''),
          '[/?#].*$', ''),
        ':[0-9]+$', ''),
      '^(www\\.)+', ''),
    '\\.+$', '')
  ) as domain_normalized,
  count(*) as kayit,
  array_agg(id) as ids,
  array_agg(business_name) as isimler
from leads
where coalesce(website, '') <> ''
group by 1
having count(*) > 1
order by 2 desc;`

async function runPreflight(client: SupabaseClient | null, leads: RawResearchLead[]): Promise<Report> {
  const report = emptyReport('preflight', leads.length)

  // 1. Araştırma dosyasının kendi içinde çakışma var mı?
  const keys = leads.map((l) => normalizeDomain(l.domain))
  const nulls = leads.filter((_, i) => keys[i] === null)
  if (nulls.length > 0) {
    report.errors.push(
      `${nulls.length} araştırma kaydının alan adı kanonikleştirilemedi: ` +
        nulls.map((l) => l.company).join(', '),
    )
  }
  const seen = new Map<string, string[]>()
  keys.forEach((k, i) => {
    if (k) seen.set(k, [...(seen.get(k) ?? []), leads[i].company])
  })
  for (const [key, companies] of seen) {
    if (companies.length > 1) {
      report.errors.push(`araştırma dosyasında çakışan domain ${key}: ${companies.join(', ')}`)
    }
  }

  console.log(`\n[1/3] Araştırma dosyası: ${leads.length} kayıt, ${seen.size} benzersiz domain`)

  // 2. Canlı DB duplicate SQL'i
  console.log('\n[2/3] Canlı DB duplicate kontrolü — aşağıdaki SQL Supabase SQL Editor\'da:')
  console.log('─'.repeat(78))
  console.log(DUPLICATE_SQL)
  console.log('─'.repeat(78))

  // 3. Şema kontrolü (bağlantı varsa)
  if (!client) {
    report.warnings.push('Supabase bağlantısı yok — şema kontrolü atlandı')
    console.log('\n[3/3] Supabase bağlantısı yok; şema kontrolü atlandı.')
    return report
  }

  const { error } = await client.from('leads').select('domain_normalized,niche_id,research_score').limit(1)
  if (error) {
    report.warnings.push(
      `Şema henüz hazır değil (migration 068 uygulanmamış olabilir): ${error.message}`,
    )
    console.log(`\n[3/3] Şema HAZIR DEĞİL — migration 068 uygulanmalı.\n      ${error.message}`)
  } else {
    console.log('\n[3/3] Şema hazır: domain_normalized, niche_id, research_score mevcut.')
  }

  return report
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN — dry-run ve apply ortak yolu
// ─────────────────────────────────────────────────────────────────────────────

interface Plan {
  inserts: { company: string; domain: string; row: Record<string, unknown> }[]
  updates: { id: string; domain: string; patch: Record<string, unknown>; keptExisting: string[] }[]
  unchanged: { id: string; domain: string }[]
  warnings: string[]
}

async function buildPlan(
  client: SupabaseClient,
  leads: RawResearchLead[],
  nowIso: string,
): Promise<Plan> {
  const plan: Plan = { inserts: [], updates: [], unchanged: [], warnings: [] }

  const mappedAll: { raw: RawResearchLead; mapped: MappedLead }[] = leads.map((raw) => ({
    raw,
    mapped: mapResearchLead(raw, nowIso),
  }))
  mappedAll.forEach(({ mapped }) => plan.warnings.push(...mapped.warnings))

  const keys = mappedAll.map(({ mapped }) => mapped.matchKey).filter((k) => k !== '')
  const { data, error } = await client
    .from('leads')
    .select(EXISTING_SELECT)
    .in('domain_normalized', keys)
    .eq('acquisition_epoch', currentEpoch())
    .is('retired_at', null)

  if (error) throw new Error(`mevcut lead'ler okunamadı: ${error.message}`)

  const existingByKey = new Map<string, Record<string, unknown>>()
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const key = row.domain_normalized as string | null
    if (key) existingByKey.set(key, row)
  }

  for (const { raw, mapped } of mappedAll) {
    if (mapped.matchKey === '') continue
    const existing = existingByKey.get(mapped.matchKey)
    if (!existing) {
      plan.inserts.push({ company: raw.company, domain: mapped.matchKey, row: insertRow(mapped) })
      continue
    }
    const { patch, keptExisting } = mergeIntoExisting(existing, mapped)
    if (Object.keys(patch).length === 0) {
      plan.unchanged.push({ id: existing.id as string, domain: mapped.matchKey })
    } else {
      plan.updates.push({
        id: existing.id as string,
        domain: mapped.matchKey,
        patch,
        keptExisting,
      })
    }
  }

  return plan
}

function emptyReport(mode: Mode, researchRecords: number): Report {
  return {
    mode,
    ranAt: new Date().toISOString(),
    sourceBatch: SOURCE_BATCH,
    researchFile: RESEARCH_FILE,
    totals: { researchRecords, toInsert: 0, toUpdate: 0, unchanged: 0, errors: 0 },
    insertedIds: [],
    matchedExisting: [],
    preservedFields: [],
    protectedNeverWritten: [...PROTECTED_FIELDS],
    byNiche: {},
    byConfidence: {},
    warnings: [],
    errors: [],
  }
}

async function run(mode: Mode, client: SupabaseClient, leads: RawResearchLead[]): Promise<Report> {
  const nowIso = new Date().toISOString()
  const report = emptyReport(mode, leads.length)

  for (const raw of leads) {
    report.byNiche[raw.niche_id] = (report.byNiche[raw.niche_id] ?? 0) + 1
    report.byConfidence[raw.confidence] = (report.byConfidence[raw.confidence] ?? 0) + 1
  }

  const plan = await buildPlan(client, leads, nowIso)
  report.warnings.push(...plan.warnings)
  report.totals.toInsert = plan.inserts.length
  report.totals.toUpdate = plan.updates.length
  report.totals.unchanged = plan.unchanged.length

  for (const u of plan.updates) {
    report.matchedExisting.push({ id: u.id, domain: u.domain, filled: Object.keys(u.patch) })
    if (u.keptExisting.length > 0) {
      report.preservedFields.push({ id: u.id, domain: u.domain, keptExisting: u.keptExisting })
    }
  }

  if (mode === 'dry-run') return report

  // ── APPLY ────────────────────────────────────────────────────────────────
  // Tek tek yazılır: bir kayıt patlarsa hangi şirket olduğu bilinsin ve
  // öncekiler raporda kalsın (rollback dosyası eksiksiz olmalı).
  for (const ins of plan.inserts) {
    const { data, error } = await client.from('leads').insert(ins.row).select('id').single()
    if (error) {
      report.errors.push(`INSERT ${ins.company} (${ins.domain}): ${error.message}`)
      continue
    }
    report.insertedIds.push((data as { id: string }).id)
  }

  for (const u of plan.updates) {
    const { error } = await client.from('leads').update(u.patch).eq('id', u.id)
    if (error) report.errors.push(`UPDATE ${u.domain} (${u.id}): ${error.message}`)
  }

  report.totals.errors = report.errors.length
  return report
}

async function runRollback(client: SupabaseClient, reportFile: string): Promise<Report> {
  const prior = JSON.parse(readFileSync(reportFile, 'utf8')) as Report
  const ids = prior.insertedIds ?? []

  const report = emptyReport('rollback', prior.totals?.researchRecords ?? 0)
  report.warnings.push(`geri alınan rapor: ${reportFile} (${prior.ranAt})`)

  if (ids.length === 0) {
    report.warnings.push('rapor hiç eklenen satır içermiyor — silinecek bir şey yok')
    return report
  }

  // YALNIZ bu UUID'ler. source_batch ile toplu silme YAPILMAZ: eşleşen mevcut
  // satırlar da o batch etiketini almış olabilir ve onlar bize ait değil.
  const { error, count } = await client
    .from('leads')
    .delete({ count: 'exact' })
    .in('id', ids)

  if (error) {
    report.errors.push(`rollback başarısız: ${error.message}`)
  } else {
    report.warnings.push(`${count ?? 0} / ${ids.length} satır silindi`)
  }
  report.totals.errors = report.errors.length
  return report
}

function printSummary(report: Report): void {
  const t = report.totals
  console.log('\n' + '═'.repeat(78))
  console.log(`MOD: ${report.mode.toUpperCase()}${report.mode === 'dry-run' ? '  (hiçbir şey yazılmadı)' : ''}`)
  console.log('═'.repeat(78))
  console.log(`araştırma kaydı : ${t.researchRecords}`)
  console.log(`eklenecek       : ${t.toInsert}`)
  console.log(`güncellenecek   : ${t.toUpdate}`)
  console.log(`değişmeyen      : ${t.unchanged}`)
  console.log(`hata            : ${t.errors}`)
  console.log(`\nniş dağılımı    : ${JSON.stringify(report.byNiche)}`)
  console.log(`güven dağılımı  : ${JSON.stringify(report.byConfidence)}`)
  if (report.preservedFields.length > 0) {
    console.log(`\nEZİLMEKTEN KORUNAN alanlar ${report.preservedFields.length} satırda:`)
    for (const p of report.preservedFields.slice(0, 10)) {
      console.log(`  ${p.domain}: ${p.keptExisting.join(', ')}`)
    }
    if (report.preservedFields.length > 10) {
      console.log(`  … ve ${report.preservedFields.length - 10} satır daha`)
    }
  }
  for (const w of report.warnings) console.log(`UYARI: ${w}`)
  for (const e of report.errors) console.log(`HATA : ${e}`)
}

async function main(): Promise<void> {
  const { mode, reportPath, rollbackFile } = parseArgs(process.argv.slice(2))

  // Node'un yerleşik .env okuyucusu (24.x). `@next/env` bundle içinde CJS
  // interop nedeniyle named export vermiyor; ek paket eklemeye de gerek yok.
  // Sıra Next.js ile aynı: .env.local .env'i ezer. Değerler LOG'LANMAZ.
  for (const file of ['.env', '.env.local']) {
    try {
      process.loadEnvFile(file)
    } catch {
      // dosya yoksa sorun değil — ortam değişkeni doğrudan verilmiş olabilir
    }
  }

  const leads = loadResearch()

  if (mode === 'emit-json') {
    const nowIso = new Date().toISOString()
    const rows = leads.map((lead) => insertRow(mapResearchLead(lead, nowIso)))
    const payload = JSON.stringify(rows)
    if (reportPath) {
      mkdirSync(dirname(reportPath), { recursive: true })
      writeFileSync(reportPath, payload, 'utf8')
      console.log(`seed payload: ${reportPath} (${rows.length} satır)`)
    } else {
      console.log(payload)
    }
    return
  }

  let client: SupabaseClient | null = null
  try {
    client = requireClient()
  } catch (err) {
    if (mode !== 'preflight') throw err
    console.log(`(bağlantı yok: ${(err as Error).message})`)
  }

  let report: Report
  if (mode === 'preflight') {
    report = await runPreflight(client, leads)
  } else if (mode === 'rollback') {
    report = await runRollback(client!, rollbackFile!)
  } else {
    report = await run(mode, client!, leads)
  }

  printSummary(report)

  const stamp = report.ranAt.replace(/[:.]/g, '-')
  const outPath = reportPath ?? join('reports', `seed-${mode}-${stamp}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\nrapor: ${outPath}`)

  if (report.errors.length > 0) process.exitCode = 1
}

void main().catch((error: unknown) => {
  console.error(`\nHATA: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
