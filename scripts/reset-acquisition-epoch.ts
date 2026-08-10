/**
 * Eski lead dönemini VERİ KAYBETMEDEN kapatır ve temiz bir edinim dönemi açar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GÜVENLİK SÖZLEŞMESİ — bu betik HİÇBİR ŞEY SİLMEZ
 *
 *   • `delete`, `truncate`, `drop` çağrısı YOKTUR. Emeklilik bir sütun
 *     işaretidir (`retired_at`); satır yerinde ve denetlenebilir kalır.
 *   • Uyum/denetim tabloları (suppression, consent, approval, provider event,
 *     send attempt, audit, lifecycle, e-posta, proje, teklif, maliyet) OKUNUR
 *     bile değil — hiçbir yazma yolu onlara dokunmaz.
 *     Kanonik liste: src/lib/leads/epoch.ts::NEVER_TOUCHED_TABLES
 *   • Kazanılmış müşteri (`status='converted'`), projesi veya teklifi olan lead
 *     emekliye AYRILMAZ.
 *   • Varsayılan mod --dry-run. --apply olmadan tek satır değişmez.
 *   • İdempotent: ikinci --apply koşusu 0 değişiklik üretir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KULLANIM
 *
 *   npm run epoch:reset -- --inventory
 *       Tablo/kaynak/adet/bağımlılık envanteri. Hiçbir şey yazmaz.
 *
 *   npm run epoch:reset -- --export
 *       Eski dönemi JSONL + SHA-256 manifest ile yerele arşivler.
 *
 *   npm run epoch:reset                     # --dry-run varsayılan
 *       Ne emekli olacak, ne korunacak — satır satır raporlar.
 *
 *   npm run epoch:reset -- --apply
 *       Emeklilik işaretini yazar ve geri alma raporu üretir.
 *
 *   npm run epoch:reset -- --undo reports/epoch-<...>.json
 *       Yalnız o koşuda işaretlenen satırların retired_at'ini temizler.
 *
 *   npm run epoch:reset -- --verify reports/epoch-export-<...>/manifest.json
 *       Export bütünlüğünü yeniden hesaplar.
 *
 * ÖNKOŞUL: migrations/071_acquisition_epoch.sql uygulanmış olmalı.
 * Gerekli ortam değişkenleri (DEĞERLER ASLA LOG'LANMAZ):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  CURRENT_ACQUISITION_EPOCH,
  LEGACY_ACQUISITION_EPOCH,
  NEVER_TOUCHED_TABLES,
  planRetirement,
  type EpochCandidate,
  type RetirementPlan,
} from '../src/lib/leads/epoch'

type Mode = 'inventory' | 'export' | 'dry-run' | 'apply' | 'undo' | 'verify'

/** Emeklilik kararı için gereken MİNİMUM alanlar — `select('*')` yapılmaz. */
const CANDIDATE_SELECT = 'id,status,acquisition_epoch,retired_at,business_name,source,created_at'

/** Export kapsamı: eski dönem lead verisi. Uyum tabloları export EDİLMEZ (yerlerinde kalırlar). */
const EXPORT_TABLES = ['leads', 'person_leads'] as const

interface Inventory {
  table: string
  total: number
  byEpoch: Record<string, number>
  byStatus: Record<string, number>
  bySource: Record<string, number>
}

interface ResetReport {
  mode: Mode
  ranAt: string
  currentEpoch: string
  legacyEpoch: string
  inventory: Inventory[]
  plan: { retire: number; preserve: number; byReason: Record<string, number> }
  /** Emekli edilen kimlikler — --undo yalnız BUNLARI geri alır. */
  retiredIds: string[]
  preservedSample: { id: string; reason: string }[]
  neverTouched: string[]
  warnings: string[]
  errors: string[]
}

function parseArgs(argv: string[]): { mode: Mode; reportPath: string | null; arg: string | null } {
  const has = (f: string) => argv.includes(f)
  const valueOf = (f: string): string | null => {
    const i = argv.indexOf(f)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null
  }
  const undoFile = valueOf('--undo')
  const verifyFile = valueOf('--verify')

  let mode: Mode = 'dry-run'
  if (has('--inventory')) mode = 'inventory'
  else if (has('--export')) mode = 'export'
  else if (undoFile) mode = 'undo'
  else if (verifyFile) mode = 'verify'
  else if (has('--apply')) mode = 'apply'

  if (has('--undo') && !undoFile) throw new Error('--undo bir rapor dosyası yolu gerektirir')
  if (has('--verify') && !verifyFile) throw new Error('--verify bir manifest yolu gerektirir')

  return { mode, reportPath: valueOf('--report'), arg: undoFile ?? verifyFile }
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

function tally(rows: Record<string, unknown>[], column: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = r[column] == null ? '(boş)' : String(r[column])
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

/** Sayfalı okuma — Supabase varsayılan 1000 satır sınırını sessizce yemesin. */
async function readAll(
  db: SupabaseClient,
  table: string,
  select: string,
  warnings: string[],
): Promise<Record<string, unknown>[]> {
  const page = 1000
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select(select).range(from, from + page - 1)
    if (error) {
      warnings.push(`${table} okunamadı: ${error.message}`)
      return out
    }
    const batch = (data ?? []) as unknown as Record<string, unknown>[]
    out.push(...batch)
    if (batch.length < page) return out
  }
}

async function buildInventory(db: SupabaseClient, warnings: string[]): Promise<Inventory[]> {
  const out: Inventory[] = []
  for (const table of EXPORT_TABLES) {
    const select = table === 'leads' ? CANDIDATE_SELECT : 'id,acquisition_epoch,retired_at,created_at'
    const rows = await readAll(db, table, select, warnings)
    out.push({
      table,
      total: rows.length,
      byEpoch: tally(rows, 'acquisition_epoch'),
      byStatus: table === 'leads' ? tally(rows, 'status') : {},
      bySource: table === 'leads' ? tally(rows, 'source') : {},
    })
  }
  return out
}

/** Gerçek müşteri bağı — hangi lead'lerin projesi/teklifi var. Yalnız OKUR. */
async function readCustomerLinks(
  db: SupabaseClient,
  warnings: string[],
): Promise<{ projects: Set<string>; proposals: Set<string> }> {
  const projects = new Set<string>()
  const proposals = new Set<string>()
  for (const [table, sink] of [
    ['projects', projects],
    ['proposals', proposals],
  ] as const) {
    const { data, error } = await db.from(table).select('lead_id').not('lead_id', 'is', null)
    if (error) {
      // Fail-closed: bağ okunamazsa HİÇBİR ŞEY emekliye ayrılmaz, çünkü gerçek
      // müşterinin korunduğunu kanıtlayamayız.
      throw new Error(`${table} bağı okunamadı — koruma kanıtlanamadığı için işlem durdu: ${error.message}`)
    }
    for (const row of (data ?? []) as { lead_id: string | null }[]) {
      if (row.lead_id) sink.add(row.lead_id)
    }
  }
  void warnings
  return { projects, proposals }
}

async function buildPlan(db: SupabaseClient, warnings: string[]): Promise<{ plan: RetirementPlan; rows: Record<string, unknown>[] }> {
  const rows = await readAll(db, 'leads', CANDIDATE_SELECT, warnings)
  const links = await readCustomerLinks(db, warnings)
  const candidates: EpochCandidate[] = rows.map((r) => ({
    id: String(r.id),
    status: r.status == null ? null : String(r.status),
    acquisitionEpoch: r.acquisition_epoch == null ? null : String(r.acquisition_epoch),
    retiredAt: r.retired_at == null ? null : String(r.retired_at),
    hasProject: links.projects.has(String(r.id)),
    hasProposal: links.proposals.has(String(r.id)),
  }))
  return { plan: planRetirement(candidates, CURRENT_ACQUISITION_EPOCH), rows }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Tarihli, checksum'lı, geri alınabilir yerel arşiv. */
async function exportEpoch(db: SupabaseClient, stamp: string, warnings: string[]): Promise<string> {
  const dir = join('reports', `epoch-export-${stamp}`)
  mkdirSync(dir, { recursive: true })
  const files: { file: string; rows: number; sha256: string }[] = []

  for (const table of EXPORT_TABLES) {
    const rows = await readAll(db, table, '*', warnings)
    const jsonl = rows.map((r) => JSON.stringify(r)).join('\n')
    const file = `${table}.jsonl`
    writeFileSync(join(dir, file), jsonl, 'utf8')
    files.push({ file, rows: rows.length, sha256: sha256(jsonl) })
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    legacyEpoch: LEGACY_ACQUISITION_EPOCH,
    currentEpoch: CURRENT_ACQUISITION_EPOCH,
    files,
    note:
      'Uyum ve denetim tabloları BU ARŞİVDE YOK çünkü hiç dokunulmuyorlar — ' +
      'canlı tabloda kalırlar ve yeni edinimde fail-closed uygulanmaya devam ederler.',
    neverTouched: [...NEVER_TOUCHED_TABLES],
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  return dir
}

function verifyManifest(manifestPath: string): { ok: boolean; details: string[] } {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    files: { file: string; rows: number; sha256: string }[]
  }
  const dir = dirname(manifestPath)
  const details: string[] = []
  let ok = true
  for (const f of manifest.files) {
    const actual = sha256(readFileSync(join(dir, f.file), 'utf8'))
    const match = actual === f.sha256
    if (!match) ok = false
    details.push(`${f.file}: ${match ? 'BÜTÜN' : 'BOZUK'} (${f.rows} satır)`)
  }
  return { ok, details }
}

/** Emeklilik işareti — yalnız `leads` tablosuna, yalnız iki sütuna yazar. */
async function applyRetirement(db: SupabaseClient, ids: string[], errors: string[]): Promise<string[]> {
  const done: string[] = []
  const chunk = 200
  for (let i = 0; i < ids.length; i += chunk) {
    const batch = ids.slice(i, i + chunk)
    const { error } = await db
      .from('leads')
      .update({ retired_at: new Date().toISOString(), retired_reason: 'legacy-epoch-close' })
      .in('id', batch)
      .is('retired_at', null) // yarış koşulunda çift yazma olmasın
    if (error) errors.push(`emeklilik yazılamadı (${batch.length} kayıt): ${error.message}`)
    else done.push(...batch)
  }
  return done
}

async function undoRetirement(db: SupabaseClient, reportPath: string, errors: string[]): Promise<number> {
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as ResetReport
  const ids = report.retiredIds ?? []
  if (ids.length === 0) return 0
  let n = 0
  const chunk = 200
  for (let i = 0; i < ids.length; i += chunk) {
    const batch = ids.slice(i, i + chunk)
    const { error } = await db
      .from('leads')
      .update({ retired_at: null, retired_reason: null })
      .in('id', batch)
    if (error) errors.push(`geri alma başarısız (${batch.length} kayıt): ${error.message}`)
    else n += batch.length
  }
  return n
}

function printReport(report: ResetReport, exportDir: string | null): void {
  const line = (s = '') => process.stdout.write(s + '\n')
  line()
  line(`═══ EDİNİM DÖNEMİ RESET — mod: ${report.mode} ═══`)
  line(`Güncel dönem: ${report.currentEpoch}   ·   Kapanan dönem: ${report.legacyEpoch}`)
  line()
  for (const inv of report.inventory) {
    line(`▸ ${inv.table}: ${inv.total} satır`)
    line(`  dönem:  ${JSON.stringify(inv.byEpoch)}`)
    if (Object.keys(inv.byStatus).length) line(`  durum:  ${JSON.stringify(inv.byStatus)}`)
    if (Object.keys(inv.bySource).length) line(`  kaynak: ${JSON.stringify(inv.bySource)}`)
  }
  line()
  line(`Emekliye ayrılacak: ${report.plan.retire}   ·   Korunacak: ${report.plan.preserve}`)
  line(`Neden kırılımı: ${JSON.stringify(report.plan.byReason, null, 1)}`)
  line()
  line('ASLA DOKUNULMAYAN tablolar (uyum/denetim kaydı):')
  line('  ' + report.neverTouched.join(', '))
  if (exportDir) line(`\nArşiv: ${exportDir}`)
  if (report.mode === 'dry-run') line('\n⚠ DRY-RUN — hiçbir şey yazılmadı. Uygulamak için: --apply')
  for (const w of report.warnings) line(`UYARI: ${w}`)
  for (const e of report.errors) line(`HATA: ${e}`)
  line()
}

async function main(): Promise<void> {
  const { mode, reportPath, arg } = parseArgs(process.argv.slice(2))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  if (mode === 'verify') {
    const { ok, details } = verifyManifest(arg!)
    for (const d of details) process.stdout.write(d + '\n')
    process.stdout.write(ok ? 'Manifest BÜTÜN.\n' : 'Manifest BOZUK.\n')
    if (!ok) process.exitCode = 1
    return
  }

  const db = requireClient()
  const warnings: string[] = []
  const errors: string[] = []

  if (mode === 'undo') {
    const n = await undoRetirement(db, arg!, errors)
    process.stdout.write(`${n} kaydın emeklilik işareti geri alındı.\n`)
    for (const e of errors) process.stdout.write(`HATA: ${e}\n`)
    if (errors.length) process.exitCode = 1
    return
  }

  const inventory = await buildInventory(db, warnings)
  let exportDir: string | null = null
  if (mode === 'export') exportDir = await exportEpoch(db, stamp, warnings)

  const { plan } = await buildPlan(db, warnings)
  let retiredIds: string[] = []
  if (mode === 'apply') {
    retiredIds = await applyRetirement(db, plan.retire.map((d) => d.id), errors)
  }

  const report: ResetReport = {
    mode,
    ranAt: new Date().toISOString(),
    currentEpoch: CURRENT_ACQUISITION_EPOCH,
    legacyEpoch: LEGACY_ACQUISITION_EPOCH,
    inventory,
    plan: { retire: plan.retire.length, preserve: plan.preserve.length, byReason: plan.byReason },
    retiredIds,
    preservedSample: plan.preserve.slice(0, 25).map((p) => ({ id: p.id, reason: p.reason })),
    neverTouched: [...NEVER_TOUCHED_TABLES],
    warnings,
    errors,
  }

  const outPath = reportPath ?? join('reports', `epoch-${mode}-${stamp}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
  printReport(report, exportDir)
  process.stdout.write(`Rapor: ${outPath}\n`)
  if (errors.length) process.exitCode = 1
}

void main().catch((error: unknown) => {
  process.stderr.write(`reset-acquisition-epoch başarısız: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
