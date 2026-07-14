import { test, expect } from '@playwright/test'
import { E2E_CRON_SECRET } from '../playwright.config'
import { cleanupE2E, supabaseAdmin, E2E_MARK, E2E_EMAIL_DOMAIN } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// FINAL PILOT BLOCKERS Faz 4 — recipient + evidence ENRICHMENT, GERÇEK route +
// GERÇEK şema, FAKE provider (dış web/Apollo yapısal imkânsız: APOLLO_API_KEY
// boş). Akış: seed (alıcı YOK + evidence YOK) → enrich (fake kişi+kanıt) →
// contact yazıldı + evidence yazıldı + lead recipient/evidence-READY → canonical
// alıcı çözülür. UYDURMA YOK: fake YALNIZ kaynağı sağlar; persist gerçek DB.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await cleanupE2E()
})

async function runEnrichment(
  request: import('@playwright/test').APIRequestContext,
  body: Record<string, unknown>,
) {
  const res = await request.post('/api/cron/enrichment', {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}`, 'content-type': 'application/json' },
    data: body,
  })
  return { status: res.status(), body: await res.json() }
}

test('seed→enrich: alıcısı+evidence\'i eksik lead → yüksek-güven contact primary + evidence yazılır', async ({ request }) => {
  const db = supabaseAdmin()
  const email = `enrich-${Date.now()}@${E2E_EMAIL_DOMAIN}`
  const { data: lead } = await db
    .from('leads')
    .insert({
      business_name: `Enrichment Test ${E2E_MARK}`,
      website: 'https://ornek-enrich.example',
      city: 'İstanbul',
      sector: 'kafe',
      status: 'new',
      score: 90, // yüksek öncelik
      // email BİLEREK yok → recipient eksik
    })
    .select('id')
    .single()
  const leadId = lead!.id as string

  // Başlangıç: alıcı yok, evidence yok.
  const rec0 = await db.from('contacts').select('id').eq('lead_id', leadId)
  expect(rec0.data ?? []).toHaveLength(0)

  const r = await runEnrichment(request, {
    contacts: {
      [leadId]: [
        { fullName: 'Ayşe Yıldız', role: 'owner', email, source: 'website', confidence: 0.85, fetchedAt: new Date().toISOString() },
      ],
    },
    evidence: {
      [leadId]: [
        { kind: 'html_signal', source: 'website', url: 'https://ornek-enrich.example', summary: 'Site mobil uyumsuz, CTA yok', verified: true, confidence: 0.7, fetchedAt: new Date().toISOString() },
      ],
    },
    maxLeads: 20,
  })
  expect(r.status).toBe(200)
  expect(r.body.mode).toBe('fake')
  expect(r.body.summary.contactsAdded).toBeGreaterThanOrEqual(1)
  expect(r.body.summary.primaryAutoSet).toBeGreaterThanOrEqual(1)
  expect(r.body.summary.evidenceAdded).toBeGreaterThanOrEqual(1)

  // DB kanıtları: contact primary + evidence satırı.
  const { data: contacts } = await db.from('contacts').select('email, is_primary').eq('lead_id', leadId)
  expect(contacts ?? []).toHaveLength(1)
  expect(contacts![0]).toMatchObject({ email: email.toLowerCase(), is_primary: true })
  const { data: evidence } = await db.from('lead_evidence').select('summary').eq('lead_id', leadId)
  expect((evidence ?? []).length).toBeGreaterThanOrEqual(1)
})

test('düşük güven → contact yazılır ama primary DEĞİL, HITL bekler (görünür)', async ({ request }) => {
  const db = supabaseAdmin()
  const email = `enrich-lo-${Date.now()}@${E2E_EMAIL_DOMAIN}`
  const { data: lead } = await db
    .from('leads')
    .insert({ business_name: `Enrichment LowConf ${E2E_MARK}`, city: 'Ankara', status: 'new', score: 80 })
    .select('id')
    .single()
  const leadId = lead!.id as string

  const r = await runEnrichment(request, {
    contacts: {
      [leadId]: [
        { fullName: 'Belirsiz Kişi', role: 'other', email, source: 'apollo', confidence: 0.5, fetchedAt: new Date().toISOString() },
      ],
    },
    evidence: {},
    maxLeads: 20,
  })
  expect(r.status).toBe(200)
  expect(r.body.summary.hitlPending).toBeGreaterThanOrEqual(1)

  const { data: contacts } = await db.from('contacts').select('is_primary').eq('lead_id', leadId)
  expect(contacts ?? []).toHaveLength(1)
  expect(contacts![0].is_primary).toBe(false) // otomatik primary YOK — operatör seçecek
})

test('idempotent + dedup: aynı e-posta iki koşuda TEK contact (transaction) + kokpit özeti', async ({ request }) => {
  const db = supabaseAdmin()
  const email = `enrich-dup-${Date.now()}@${E2E_EMAIL_DOMAIN}`
  const { data: lead } = await db
    .from('leads')
    .insert({ business_name: `Enrichment Dup ${E2E_MARK}`, city: 'İzmir', status: 'new', score: 70 })
    .select('id')
    .single()
  const leadId = lead!.id as string
  // Aynı e-postayı ZATEN kayıtlı bir contact olarak seed et (dedup yolu için).
  await db.from('contacts').insert({ lead_id: leadId, full_name: 'Var Olan', role: 'other', email: email.toLowerCase(), source: 'manual', is_primary: false })

  // Enrichment aynı e-postayı bulursa → transaction dedup (duplicate), yeni satır YOK.
  const payload = {
    contacts: { [leadId]: [{ fullName: 'Tekrar Kişi', role: 'owner', email, source: 'website' as const, confidence: 0.8, fetchedAt: new Date().toISOString() }] },
    evidence: {},
    maxLeads: 20,
  }
  const r1 = await runEnrichment(request, payload)
  expect(r1.status).toBe(200)
  expect(r1.body.summary.duplicatesSkipped).toBeGreaterThanOrEqual(1)

  // İki koşu sonrası da TEK contact (idempotent + transaction dedup).
  await runEnrichment(request, payload)
  const { data: contacts } = await db.from('contacts').select('id').eq('lead_id', leadId).eq('email', email.toLowerCase())
  expect(contacts ?? []).toHaveLength(1)

  // Kokpit görünürlüğü: settings'te son koşu özeti var.
  const { data: setting } = await db.from('settings').select('value').eq('key', 'enrichment_last_run').maybeSingle()
  expect(setting?.value).toBeTruthy()
})

test('auth + shadow: yanlış secret 401; bayrak kapalı davranışı yapısal', async ({ request }) => {
  const bad = await request.post('/api/cron/enrichment', {
    headers: { authorization: 'Bearer yanlis' },
    data: { contacts: {}, evidence: {} },
  })
  expect(bad.status()).toBe(401)

  const malformed = await request.post('/api/cron/enrichment', {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}`, 'content-type': 'application/json' },
    data: { yanlisAlan: true },
  })
  expect(malformed.status()).toBe(400)
})
