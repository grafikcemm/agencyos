import { test, expect } from '@playwright/test'
import { AUTH_HEADERS, seedDraft, cleanupE2E, supabaseAdmin } from './helpers'

// Faz 3.1 — Projeye Dönüştür: proje OLUŞMADAN "dönüştü" denmez; eşzamanlı
// iki istek TEK proje üretir; audit revenue-attribution izi taşır (DB kanıtı).

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await cleanupE2E()
})

test('convert: proje + converted + tek satır DB kanıtı; ikinci istek already', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('convert-tek')
  await db.from('leads').update({ status: 'meeting', expected_monthly_value_tl: 15000 }).eq('id', seeded.leadId)

  const r1 = await request.post(`/api/leads/${seeded.leadId}/convert`, { headers: AUTH_HEADERS })
  expect(r1.status()).toBe(200)
  const b1 = await r1.json()
  expect(b1.outcome).toBe('created')
  expect(b1.projectId).toBeTruthy()

  // DB kanıtı: TEK proje + lead converted.
  const { data: projects } = await db.from('projects').select('id, status, monthly_fee').eq('lead_id', seeded.leadId)
  expect(projects).toHaveLength(1)
  expect(Number(projects![0].monthly_fee)).toBe(15000)
  const { data: lead } = await db.from('leads').select('status').eq('id', seeded.leadId).single()
  expect(lead?.status).toBe('converted')

  // Audit ŞEFFAFLIĞI (Faz 0.5): API'nin auditRecorded iddiası DB gerçeğiyle
  // birebir eşleşmeli. mig 060 canlı değilken legacy yol audit YAZAMAZ
  // (057 CHECK 'convert' içermez → 23514) — bu test başarısının arkasına
  // GİZLENMEZ: false ise burada açıkça raporlanır.
  const { data: auditRows } = await db
    .from('lead_action_audit')
    .select('id')
    .eq('lead_id', seeded.leadId)
    .eq('action', 'convert')
  expect(b1.auditRecorded).toBe((auditRows?.length ?? 0) > 0)
  if (!b1.auditRecorded) {
    console.warn(
      '[E2E convert] BİLİNEN SINIR: audit satırı YAZILMADI (mig 060 canlı değil, 23514) — dönüşüm çalışıyor ama attribution izi eksik.',
    )
  }

  // İkinci istek → already, İKİNCİ PROJE YOK.
  const r2 = await request.post(`/api/leads/${seeded.leadId}/convert`, { headers: AUTH_HEADERS })
  expect((await r2.json()).outcome).toBe('already')
  const { data: after } = await db.from('projects').select('id').eq('lead_id', seeded.leadId)
  expect(after).toHaveLength(1)
})

test('convert: EŞZAMANLI iki tık → tek proje (yarış çözümü deterministik)', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('convert-yaris')
  await db.from('leads').update({ status: 'responded' }).eq('id', seeded.leadId)

  const [a, b] = await Promise.all([
    request.post(`/api/leads/${seeded.leadId}/convert`, { headers: AUTH_HEADERS }),
    request.post(`/api/leads/${seeded.leadId}/convert`, { headers: AUTH_HEADERS }),
  ])
  expect(a.status()).toBe(200)
  expect(b.status()).toBe(200)

  const { data: projects } = await db.from('projects').select('id').eq('lead_id', seeded.leadId)
  expect(projects).toHaveLength(1)
})

test('convert: lost lead reddedilir — proje oluşmaz, lead statüsü değişmez', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('convert-lost')
  await db.from('leads').update({ status: 'lost' }).eq('id', seeded.leadId)

  const r = await request.post(`/api/leads/${seeded.leadId}/convert`, { headers: AUTH_HEADERS })
  expect(r.status()).toBe(409)
  const { data: projects } = await db.from('projects').select('id').eq('lead_id', seeded.leadId)
  expect(projects).toHaveLength(0)
  const { data: lead } = await db.from('leads').select('status').eq('id', seeded.leadId).single()
  expect(lead?.status).toBe('lost')
})
