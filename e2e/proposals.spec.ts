import { test, expect } from '@playwright/test'
import { AUTH_HEADERS, seedDraft, cleanupE2E, supabaseAdmin } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 4 — teklif motoru GERÇEK YENİ ŞEMA üzerinde (mig 061 v3
// test DB'ye KALICI: tablolar + 3 tx RPC; fallback DEĞİL — atomic:true kanıtı):
//   create → revize/version → request approval → approve/reject →
//   stale digest/versiyon BLOKE. Gönderim yolu YOK (HITL + flag korunur).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  const db = supabaseAdmin()
  // proposals cascade: lead silinince temizlenir (cleanupE2E leads'i siler).
  await cleanupE2E()
  void db
})

async function createProposal(request: import('@playwright/test').APIRequestContext, leadId: string) {
  const res = await request.post(`/api/leads/${leadId}/proposal`, {
    headers: AUTH_HEADERS,
    data: { offerIds: ['ai_lead_response'] },
  })
  return { status: res.status(), body: await res.json() }
}

async function action(
  request: import('@playwright/test').APIRequestContext,
  proposalId: string,
  data: Record<string, unknown>,
) {
  const res = await request.post(`/api/proposals/${proposalId}`, { headers: AUTH_HEADERS, data })
  return { status: res.status(), body: await res.json() }
}

test('dikey akış: create (atomic RPC) → request approval → approve; versiyon+event izi gerçek şemada', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('prop-vertical')
  // Teklif metni iddiasız kalsın diye pain_points claim-free bırakılır (seed default).

  // 1) Create — GERÇEK RPC yolu (fallback değil): atomic:true.
  const c = await createProposal(request, seeded.leadId)
  expect(c.status).toBe(200)
  expect(c.body.success).toBe(true)
  expect(c.body.atomic).toBe(true) // create_proposal_version_tx canlı — legacy fallback KULLANILMADI
  const proposalId = c.body.proposalId as string
  expect(c.body.version).toBe(1)

  // 2) Request approval (tx RPC) → pending onay + review durumu.
  const ra = await action(request, proposalId, { action: 'request_approval' })
  expect(ra.status).toBe(200)
  const { data: afterReq } = await db.from('proposals').select('status').eq('id', proposalId).single()
  expect(afterReq!.status).toBe('review')
  const { data: approval } = await db
    .from('proposal_approvals')
    .select('decision, version, action_digest')
    .eq('proposal_id', proposalId)
    .single()
  expect(approval).toMatchObject({ decision: 'pending', version: 1 })

  // 3) Decide approved (tx RPC) → approved + event izi.
  const de = await action(request, proposalId, { action: 'decide', version: 1, decision: 'approved' })
  expect(de.status).toBe(200)
  const { data: afterDec } = await db.from('proposals').select('status').eq('id', proposalId).single()
  expect(afterDec!.status).toBe('approved')
  const { data: events } = await db
    .from('proposal_events')
    .select('event')
    .eq('proposal_id', proposalId)
  const eventNames = (events ?? []).map((e) => e.event)
  expect(eventNames).toContain('created')
  expect(eventNames).toContain('approved')

  // 4) GET detay — application service (UI + Telegram aynı yüzey).
  const detRes = await request.get(`/api/proposals/${proposalId}`, { headers: AUTH_HEADERS })
  expect(detRes.status()).toBe(200)
  const det = await detRes.json()
  expect(det.detail).toMatchObject({ status: 'approved', currentVersion: 1 })
  expect(det.detail.versions).toHaveLength(1)
})

test('revize → yeni versiyon; ESKİ versiyonun onayı karara BAĞLANAMAZ (versiyon uyuşmazlığı)', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('prop-stale-ver')
  const c1 = await createProposal(request, seeded.leadId)
  const proposalId = c1.body.proposalId as string
  await action(request, proposalId, { action: 'request_approval' }) // v1 pending

  // Revize: aynı lead'e ikinci create → v2 (current ilerler, status draft).
  const c2 = await createProposal(request, seeded.leadId)
  expect(c2.body.success).toBe(true)
  expect(c2.body.proposalId).toBe(proposalId)
  expect(c2.body.version).toBe(2)

  // v1 onayı artık current DEĞİL → karar RED (approved geçmez).
  const de = await action(request, proposalId, { action: 'decide', version: 1, decision: 'approved' })
  expect(de.status).toBe(409)
  expect(String(de.body.error)).toContain('YENİDEN onay gerekir')
  const { data: p } = await db.from('proposals').select('status, current_version').eq('id', proposalId).single()
  expect(p!.status).not.toBe('approved')
  expect(p!.current_version).toBe(2)
})

test('STALE DIGEST: onaydan sonra içerik değişirse approved BLOKE (gerçek DB, tx RPC)', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('prop-stale-digest')
  const c = await createProposal(request, seeded.leadId)
  const proposalId = c.body.proposalId as string
  await action(request, proposalId, { action: 'request_approval' })

  // İçerik onaydan SONRA değişir (versiyon satırı üzerinde) → digest tutmaz.
  const { error: updErr } = await db
    .from('proposal_versions')
    .update({ email_body: 'ONAYDAN SONRA DEĞİŞTİRİLDİ' })
    .eq('proposal_id', proposalId)
    .eq('version', 1)
  expect(updErr).toBeNull()

  const de = await action(request, proposalId, { action: 'decide', version: 1, decision: 'approved' })
  expect(de.status).toBe(409)
  expect(String(de.body.error)).toContain('digest')
  const { data: p } = await db.from('proposals').select('status').eq('id', proposalId).single()
  expect(p!.status).toBe('review') // approved OLMADI
})

test('reject yolu + reddedilen teklife yeniden onay istenemez', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('prop-reject')
  const c = await createProposal(request, seeded.leadId)
  const proposalId = c.body.proposalId as string
  await action(request, proposalId, { action: 'request_approval' })
  const de = await action(request, proposalId, { action: 'decide', version: 1, decision: 'rejected' })
  expect(de.status).toBe(200)
  const { data: p } = await db.from('proposals').select('status').eq('id', proposalId).single()
  expect(p!.status).toBe('rejected')

  const ra2 = await action(request, proposalId, { action: 'request_approval' })
  expect(ra2.status).toBe(409)
  expect(String(ra2.body.error)).toContain('onay istenemez')
})
