import { test, expect } from '@playwright/test'
import { E2E_PASSWORD } from '../playwright.config'
import { E2E_EMAIL_DOMAIN, seedDraft, cleanupE2E, requestSend, supabaseAdmin } from './helpers'

// Sprint 1A — /bugun gelir kokpiti: 7 panel + gelir şeridi + durumlar +
// mevcut approval→dry-run send akışının KOKPİTTEN uçtan uca sürülmesi.
// İzole test DB (e2e/env.ts guard'ı); afterAll tüm izleri siler.

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await cleanupE2E()
})

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByRole('textbox').fill(E2E_PASSWORD)
  await page.getByRole('button').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

test('kokpit panelleri: aranacaklar + geciken follow-up + unknown attempt + sıcak lead + cevap empty-state + gelir şeridi', async ({ page, request }) => {
  const db = supabaseAdmin()
  // Seed: aranacak lead (geçmiş follow-up tarihi + A tier)
  const call = await seedDraft('kokpit-call')
  await db.from('leads').update({
    next_follow_up_at: new Date(Date.now() - 60_000).toISOString(),
    lead_tier: 'A', phone: '+90 555 000 00 00', status: 'contacted',
    expected_monthly_value_tl: 12000,
  }).eq('id', call.leadId)
  // Seed: GÜNLÜK SEÇİM lead'i — status=new + next_follow_up_at=NULL + telefon.
  // Finding #1-4 regression koruması: bu lead "0 aranacak"a düşmemeli, panel-calls'ta
  // "GÜNÜN" kaynağıyla görünmeli (deterministik günlük seçim).
  const daily = await seedDraft('kokpit-gunluk')
  await db.from('leads').update({
    status: 'new', next_follow_up_at: null,
    phone: '+90 555 111 22 33', lead_tier: 'B', quality_score: 77,
  }).eq('id', daily.leadId)
  // Seed: sıcak lead (teklif bekleyen)
  const hot = await seedDraft('kokpit-hot')
  await db.from('leads').update({
    status: 'responded', expected_monthly_value_tl: 25000, pain_point: 'web sitesi eski',
  }).eq('id', hot.leadId)
  // Seed: geciken follow-up
  await db.from('follow_up_sequences').insert({
    lead_id: call.leadId, step: 1, channel: 'email',
    due_at: new Date(Date.now() - 3600_000).toISOString(), done: false,
  })
  // Seed: unknown send attempt (reconciliation kuyruğu) — onaylı gerçek approval'a bağlı
  const req1 = await requestSend(request, hot.draftId)
  expect(req1.status).toBe(200)
  await db.from('outreach_send_attempts').insert({
    outreach_message_id: hot.draftId, approval_id: req1.body.data.approvalId,
    action_digest: 'e2e', rfc_message_id: `<outreach-${hot.draftId}@agencyos.grafikcem>`,
    state: 'unknown', claim_token: '00000000-0000-0000-0000-000000000001',
    last_error: 'e2e: belirsiz sonuç simülasyonu',
  })

  await login(page)
  await page.goto('/bugun')

  // Gelir şeridi: ağırlıklı toplam görünür (contacted 12000×0.1 + responded 25000×0.35 ≥ 9950)
  const revenue = page.getByTestId('panel-revenue')
  await expect(revenue).toContainText('Beklenen aylık gelir')
  await expect(revenue).toContainText('Hedef:')

  // Aranacaklar: due lead (TAKİP) + tel: link
  const calls = page.getByTestId('panel-calls')
  await expect(calls).toContainText('kokpit-call')
  await expect(calls).toContainText('+90 555 000 00 00')
  await expect(calls).toContainText('TAKİP')
  // GÜNLÜK SEÇİM: NULL-follow-up new lead panel-calls'ta "GÜNÜN" ile görünür (finding #1-4)
  await expect(calls.getByTestId(`call-lead-${daily.leadId}`)).toContainText('GÜNÜN')
  await expect(calls.getByTestId(`call-lead-${daily.leadId}`)).toContainText('+90 555 111 22 33')
  // tel: aksiyon linki mevcut
  await expect(calls.locator('a[href^="tel:"]').first()).toBeVisible()

  // Geciken follow-up
  await expect(page.getByTestId('panel-followups')).toContainText('adım 1')

  // Gönderim sorunları: unknown attempt görünür
  const issues = page.getByTestId('panel-issues')
  await expect(issues).toContainText('unknown')
  await expect(issues).toContainText('belirsiz sonuç')

  // Sıcak lead + beklenen aylık değer
  const hotPanel = page.getByTestId('panel-hot')
  await expect(hotPanel).toContainText('kokpit-hot')
  await expect(hotPanel).toContainText('25.000 TL')

  // Cevaplar: empty-state metni (reply ingest Sprint 2)
  await expect(page.getByTestId('panel-replies')).toContainText('Henüz gelen cevap yok')
})

test('kokpitten tam HITL akışı: Onayla → Gönder (dry-run) → Gönderildi + DB kanıtı', async ({ page, request }) => {
  const seeded = await seedDraft('kokpit-akis')
  const req1 = await requestSend(request, seeded.draftId)
  expect(req1.status).toBe(200)

  await login(page)
  await page.goto('/bugun')

  const row = page.getByTestId(`send-draft-${seeded.draftId}`)
  await expect(row).toContainText(`alıcı-domain: ${E2E_EMAIL_DOMAIN}`)

  // Onayla → Gönder: tek dirençli poll — hydration/busy yarışlarına karşı her
  // turda iki butona da tıklamayı dener (çift tık ZARARSIZ: ikinci approve 409
  // no-op, ikinci send alreadySent no-op — at-most-once makinesi garanti eder).
  await expect
    .poll(async () => {
      await row.getByRole('button', { name: 'Onayla' }).click({ timeout: 1_000 }).catch(() => {})
      await row.getByRole('button', { name: /Gönder/ }).click({ timeout: 1_000 }).catch(() => {})
      return row.getByText(/Gönderildi ✓ \(dry-run\)/).isVisible().catch(() => false)
    }, { timeout: 30_000, intervals: [500, 1000, 2000] })
    .toBe(true)

  // DB kanıtı: attempt sent+finalized, email_messages tek satır, outreach sent
  const db = supabaseAdmin()
  const { data: attempt } = await db
    .from('outreach_send_attempts').select('state, finalized').eq('outreach_message_id', seeded.draftId).single()
  expect(attempt?.state).toBe('sent')
  expect(attempt?.finalized).toBe(true)
  const { data: msgs } = await db.from('email_messages').select('id').eq('outreach_message_id', seeded.draftId)
  expect(msgs).toHaveLength(1)
  const { data: om } = await db.from('outreach_messages').select('status').eq('id', seeded.draftId).single()
  expect(om?.status).toBe('sent')
})
