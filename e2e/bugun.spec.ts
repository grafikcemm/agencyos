import { test, expect } from '@playwright/test'
import { E2E_PASSWORD } from '../playwright.config'
import { E2E_EMAIL_DOMAIN, AUTH_HEADERS, seedDraft, cleanupE2E, requestSend, supabaseAdmin } from './helpers'

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
  // Seed: DUPLICATE telefon (C2) — daily ile aynı numara; listede İKİ KEZ çıkmamalı.
  const dup = await seedDraft('kokpit-duplike')
  await db.from('leads').update({
    status: 'new', next_follow_up_at: null,
    phone: '0555 111 22 33', lead_tier: 'C', quality_score: 10,
  }).eq('id', dup.leadId)
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

  // C2 dedupe: aynı telefon listede TEK satır; duplicate notu görünür, otomatik merge yok.
  await expect(calls.getByTestId(`call-lead-${dup.leadId}`)).toHaveCount(0)
  await expect(calls.getByTestId('call-duplicates')).toContainText('kokpit-duplike')

  // C4 (finding #5-6): approval'ı OLMAYAN taslak da panelde görünür + durum rozeti.
  const drafts = page.getByTestId('panel-approvals')
  await expect(drafts.getByTestId(`draft-state-${call.draftId}`)).toContainText('Onay yok')

  // Gönderim sorunları: unknown attempt görünür + Reconcile aksiyonu (finding #9)
  const issues = page.getByTestId('panel-issues')
  await expect(issues).toContainText('unknown')
  await expect(issues).toContainText('belirsiz sonuç')
  await expect(issues.getByTestId(`reconcile-${hot.draftId}`)).toBeVisible()

  // Sıcak lead + beklenen aylık değer
  const hotPanel = page.getByTestId('panel-hot')
  await expect(hotPanel).toContainText('kokpit-hot')
  await expect(hotPanel).toContainText('25.000 TL')

  // Cevaplar: empty-state metni (reply ingest Sprint 2)
  await expect(page.getByTestId('panel-replies')).toContainText('Henüz gelen cevap yok')
})

test('satır aksiyonu: Arandı → contacted + follow-up planlanır (server authoritative, finding C1)', async ({ page }) => {
  const db = supabaseAdmin()
  const lead = await seedDraft('kokpit-aksiyon')
  await db.from('leads').update({
    status: 'new', next_follow_up_at: null, phone: '+90 555 222 33 44',
    lead_tier: 'A', quality_score: 90,
  }).eq('id', lead.leadId)

  await login(page)
  await page.goto('/bugun')

  const row = page.getByTestId(`call-lead-${lead.leadId}`)
  await expect(row).toBeVisible()
  await row.getByTestId(`lead-action-called-${lead.leadId}`).click()
  await expect(row).toContainText('Arandı ✓')

  // Server authoritative kanıt: statü contacted + follow-up İLERİ tarihli.
  await expect
    .poll(async () => {
      const { data } = await db
        .from('leads').select('status, next_follow_up_at, last_contact_at').eq('id', lead.leadId).single()
      return data?.status === 'contacted' && data?.next_follow_up_at != null && data?.last_contact_at != null
    }, { timeout: 10_000 })
    .toBe(true)

  // Audit kanıtı (mig 057 canlı): before/after + actor + idempotency key kayıtlı.
  const { data: audit } = await db
    .from('lead_action_audit')
    .select('action, actor, channel, before_state, after_state, idempotency_key')
    .eq('lead_id', lead.leadId)
  expect(audit).toHaveLength(1)
  expect(audit![0]).toMatchObject({ action: 'called', channel: 'ui', actor: 'operator' })
  expect((audit![0].before_state as { status: string }).status).toBe('new')
  expect((audit![0].after_state as { status: string }).status).toBe('contacted')
  expect(audit![0].idempotency_key).toContain(lead.leadId)
})

test('Faz 0.4: aynı güne İKİ FARKLI not kaydolur; aynı operation id retry duplicate yazmaz; not tamamlama sayılmaz', async ({ request }) => {
  const db = supabaseAdmin()
  const lead = await seedDraft('kokpit-not')
  await db.from('leads').update({ status: 'contacted' }).eq('id', lead.leadId)

  const post = (body: object) =>
    request.post(`/api/leads/${lead.leadId}/action`, { headers: AUTH_HEADERS, data: body })

  // 1. not — kendi operation id'siyle.
  const k1 = `e2e-note-${lead.leadId}-op1`
  const r1 = await post({ action: 'note', note: 'ilk e2e notu', idempotencyKey: k1 })
  expect(r1.status()).toBe(200)

  // Ağ retry simülasyonu: AYNI operation id → replay; duplicate satır YAZILMAZ.
  const r1b = await post({ action: 'note', note: 'ilk e2e notu', idempotencyKey: k1 })
  expect(r1b.status()).toBe(200)
  expect((await r1b.json()).idempotentReplay).toBe(true)

  // 2. not — YENİ operation id → aynı gün ikinci not kaybolmaz.
  const r2 = await post({ action: 'note', note: 'ikinci e2e notu', idempotencyKey: `e2e-note-${lead.leadId}-op2` })
  expect(r2.status()).toBe(200)

  const { data } = await db.from('leads').select('notes, status').eq('id', lead.leadId).single()
  const notes = String(data?.notes ?? '')
  expect(notes).toContain('ilk e2e notu')
  expect(notes).toContain('ikinci e2e notu')
  expect(notes.match(/ilk e2e notu/g)).toHaveLength(1) // replay duplicate yazmadı
  expect(data?.status).toBe('contacted') // not, arama tamamlama/statü geçişi DEĞİL
})

test('Faz 2.2: recipient_missing satırından INLINE contact → primary yazılır, alıcı çözülür, drawer gerekmez', async ({ page }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('kokpit-alicisiz')
  await db.from('leads').update({ email: null }).eq('id', seeded.leadId) // alıcı yok

  await login(page)
  await page.goto('/bugun')

  const row = page.getByTestId(`send-draft-${seeded.draftId}`)
  await expect(row.getByTestId(`draft-state-${seeded.draftId}`)).toContainText('Alıcı eksik')

  // Satırdan çıkmadan kişi ekle (ad + rol + e-posta + source + primary).
  await row.getByTestId(`inline-contact-name-${seeded.leadId}`).fill('E2E İnline Kişi')
  await row.getByTestId(`inline-contact-email-${seeded.leadId}`).fill(`inline-kisi@${E2E_EMAIL_DOMAIN}`)
  await row.getByTestId(`inline-contact-save-${seeded.leadId}`).click()

  // DB kanıtı: primary contact satırı yazıldı.
  await expect
    .poll(async () => {
      const { data } = await db.from('contacts').select('is_primary, email').eq('lead_id', seeded.leadId)
      return data?.length === 1 && data[0].is_primary === true
    }, { timeout: 10_000 })
    .toBe(true)

  // Panel yeniden yüklenince canonical recipient çözülür → durum ilerler.
  await page.reload()
  await expect(row.getByTestId(`draft-state-${seeded.draftId}`)).toContainText('Onay yok')
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
