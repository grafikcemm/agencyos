import { test, expect } from '@playwright/test'
import { E2E_PASSWORD } from '../playwright.config'
import {
  AUTH_HEADERS, E2E_EMAIL_DOMAIN, seedDraft, cleanupE2E,
  requestSend, approve, sendGmail, supabaseAdmin,
} from './helpers'

// Akış 3-8 + 10: taslak → onay isteği → konsol onay kartı (UI) → onayla →
// dry-run gönderim → duplicate/eşzamanlı imkânsız → suppression bloke →
// digest mismatch bloke → manuel email bypass 422 → Gmail-bağlı-değil durumu.
// Canlı App DB'ye seed yazar; afterAll TÜM artıkları siler.
// ÖN-KOŞUL: mig 054 (outreach_send_attempts + finalize RPC) canlı olmalı.

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await cleanupE2E()
})

test('Akış 4 — istek → konsol kartı (domain görünür) → onayla (UI) → dry-run send → kayıtlar', async ({ page, request }) => {
  const seeded = await seedDraft('akis4')

  // Onay isteği (drawer'daki "Gmail Onayı İste" butonunun API sözleşmesi).
  const req1 = await requestSend(request, seeded.draftId)
  expect(req1.status).toBe(200)
  const approvalId = req1.body.data.approvalId as string
  expect(req1.body.data.status).toBe('pending')

  // Konsol UI: onay kartı + alıcı domain GÖRÜNÜR (T10).
  await page.goto('/login')
  await page.getByRole('textbox').fill(E2E_PASSWORD)
  await page.getByRole('button').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
  await page.goto('/konsol')
  await expect(page.getByText(`alıcı-domain: ${E2E_EMAIL_DOMAIN}`).first()).toBeVisible({ timeout: 15_000 })

  // UI'dan onayla (konsol onay kartı = <article>; buton metni "Onayla").
  // Hydration yarışı: prod build'de ilk tık handler bağlanmadan gidebilir —
  // tık + durum kontrolü tek poll içinde (ikinci tık zararsız: 409 no-op).
  const card = page.locator('article').filter({ hasText: `alıcı-domain: ${E2E_EMAIL_DOMAIN}` }).first()
  await expect
    .poll(async () => {
      await card.getByRole('button', { name: 'Onayla' }).click({ timeout: 2_000 }).catch(() => {})
      const res = await request.get(`/api/outreach/${seeded.draftId}/send-status`, { headers: AUTH_HEADERS })
      const json = await res.json()
      return json.data.approval?.status ?? 'yok'
    }, { timeout: 20_000, intervals: [500, 1000, 2000] })
    .toBe('approved')

  // Dry-run gönderim.
  const sent = await sendGmail(request, seeded.draftId, approvalId)
  expect(sent.status).toBe(200)
  expect(sent.body.data.dryRun).toBe(true)
  expect(String(sent.body.data.gmailMessageId)).toContain('dryrun-')

  // Kalıcı kayıtlar: status/attempt/email_messages/approval executed.
  const status = await request.get(`/api/outreach/${seeded.draftId}/send-status`, { headers: AUTH_HEADERS })
  const sj = (await status.json()).data
  expect(sj.sent).toBe(true)
  expect(sj.attempt.state).toBe('sent')
  expect(sj.attempt.finalized).toBe(true)

  const db = supabaseAdmin()
  const { data: msgs } = await db.from('email_messages').select('id').eq('outreach_message_id', seeded.draftId)
  expect(msgs).toHaveLength(1)

  // Akış 7 kuyruğu — duplicate: ikinci send no-op.
  const dup = await sendGmail(request, seeded.draftId, approvalId)
  expect(dup.body.data?.alreadySent ?? dup.body.alreadySent).toBe(true)
  const { data: msgs2 } = await db.from('email_messages').select('id').eq('outreach_message_id', seeded.draftId)
  expect(msgs2).toHaveLength(1)
})

test('Akış 7 — eşzamanlı çift send: tek gönderim, tek email_messages satırı', async ({ request }) => {
  const seeded = await seedDraft('akis7')
  const req1 = await requestSend(request, seeded.draftId)
  const approvalId = req1.body.data.approvalId as string
  await approve(request, approvalId)

  const [a, b] = await Promise.all([
    sendGmail(request, seeded.draftId, approvalId),
    sendGmail(request, seeded.draftId, approvalId),
  ])
  const outcomes = [a, b]
  const winners = outcomes.filter((o) => o.status === 200 && o.body.data && !o.body.data.alreadySent && !o.body.inProgress)
  expect(winners.length).toBeLessThanOrEqual(1)

  const db = supabaseAdmin()
  await expect
    .poll(async () => {
      const { data } = await db.from('email_messages').select('id').eq('outreach_message_id', seeded.draftId)
      return (data ?? []).length
    }, { timeout: 10_000 })
    .toBe(1)
  const { data: attempts } = await db.from('outreach_send_attempts').select('attempt_count').eq('outreach_message_id', seeded.draftId)
  expect(attempts).toHaveLength(1)
})

test('Akış 5 — suppression: onaydan sonra eklense bile gönderim bloke', async ({ request }) => {
  const seeded = await seedDraft('akis5')
  const req1 = await requestSend(request, seeded.draftId)
  const approvalId = req1.body.data.approvalId as string
  await approve(request, approvalId)

  const db = supabaseAdmin()
  await db.from('suppression_list').insert({ scope: 'email', address: seeded.email, reason: 'opt_out', source: 'e2e' })

  const sent = await sendGmail(request, seeded.draftId, approvalId)
  expect(sent.status).toBe(422)
  expect(JSON.stringify(sent.body.blockedReasons)).toContain('suppression')

  // Yeni onay isteği de kart üretmemeli.
  const seeded2 = await seedDraft('akis5b')
  await db.from('leads').update({ email: seeded.email }).eq('id', seeded2.leadId)
  const req2 = await requestSend(request, seeded2.draftId)
  expect(req2.status).toBe(422)
})

test('Akış 6 — onaydan sonra içerik değişti → digest mismatch bloke', async ({ request }) => {
  const seeded = await seedDraft('akis6')
  const req1 = await requestSend(request, seeded.draftId)
  const approvalId = req1.body.data.approvalId as string
  await approve(request, approvalId)

  const db = supabaseAdmin()
  await db.from('outreach_messages').update({ final_body: 'SONRADAN DEĞİŞTİRİLMİŞ içerik.' }).eq('id', seeded.draftId)

  const sent = await sendGmail(request, seeded.draftId, approvalId)
  expect(sent.status).toBe(409)
  expect(String(sent.body.error)).toContain('Digest')
})

test('Akış 8 — email satırı manuel endpoint\'le sent YAPILAMAZ (422)', async ({ request }) => {
  const seeded = await seedDraft('akis8')
  const res = await request.post('/api/outreach/send', {
    headers: AUTH_HEADERS,
    data: { message_id: seeded.draftId },
  })
  expect(res.status()).toBe(422)
  const db = supabaseAdmin()
  const { data } = await db.from('outreach_messages').select('status').eq('id', seeded.draftId).single()
  expect(data?.status).toBe('draft')
})

test('Akış 10 — Gmail bağlı değil: dryRunMode görünür durumda', async ({ request }) => {
  const seeded = await seedDraft('akis10')
  const res = await request.get(`/api/outreach/${seeded.draftId}/send-status`, { headers: AUTH_HEADERS })
  const json = await res.json()
  expect(json.data.dryRunMode).toBe(true)
  expect(json.data.sent).toBe(false)
  expect(json.data.attempt).toBeNull()
})
