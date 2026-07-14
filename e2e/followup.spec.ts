import { test, expect } from '@playwright/test'
import { E2E_PASSWORD, E2E_CRON_SECRET } from '../playwright.config'
import { seedDraft, cleanupE2E, supabaseAdmin, approve, sendGmail } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 3 — follow-up DİKEY akışı, GERÇEK yeni şema (062+063 test
// DB'de KALICI) + production build üzerinde:
//   due sequence → CRON tick → GÖRÜNÜR canonical taslak (/bugun) → edit →
//   gate → approval → dry-run send;  opt-out → taslak YOK;
//   eşzamanlı cron → exactly-once.
// Gerçek provider çağrısı YOK (dry-run); agent_tasks kuyruğuna İŞ YAZILMAZ.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

// İş günü kuralı gerçek davranıştır: hafta sonu koşularında terfi ertelenir.
// Suite deterministik kalsın diye dikey testler yalnız iş günü koşar.
const IS_WEEKEND = [0, 6].includes(new Date().getUTCDay())

test.afterAll(async () => {
  await cleanupE2E()
})

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByRole('textbox').fill(E2E_PASSWORD)
  await page.getByRole('button').click()
  await page.waitForURL((url) => !url.pathname.includes('/login'))
}

async function tick(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post('/api/cron/agent-tick', {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  })
  return { status: res.status(), body: await res.json() }
}

/** İlk temas gönderilmiş bir lead + vadesi geçmiş follow-up adımı kurar. */
async function seedDueStep(suffix: string, step: number) {
  const db = supabaseAdmin()
  const seeded = await seedDraft(suffix)
  // İlk taslak "gönderilmiş" ilk temas olsun (previousBodies bağlamı + panelde
  // takip taslağının tek AÇIK taslak olması).
  await db
    .from('outreach_messages')
    .update({ status: 'sent', sent_at: new Date().toISOString(), final_body: null })
    .eq('id', seeded.draftId)
  const { error } = await db.from('follow_up_sequences').insert({
    lead_id: seeded.leadId,
    step,
    channel: 'email',
    due_at: '2026-07-01T00:00:00.000Z',
    done: false,
  })
  expect(error, `follow-up seed hatası: ${error?.message}`).toBeNull()
  return seeded
}

test('dikey akış: due → cron tick → GÖRÜNÜR taslak (/bugun) → gate → onay → dry-run send + versiyon/bağ izi', async ({ page, request }) => {
  test.skip(IS_WEEKEND, 'iş günü kuralı: hafta sonu terfiler ertelenir (gerçek davranış)')
  const db = supabaseAdmin()
  const seeded = await seedDueStep('fu-vertical', 4) // objection_reduction (iddiasız açı)

  // 1) Cron tick — due adım canonical taslağa terfi eder.
  const t = await tick(request)
  expect(t.status).toBe(200)
  expect(t.body.sequencesPromoted).toBeGreaterThanOrEqual(1)

  // 2) DB kanıtı: taslak + adım bağı + immutable versiyon (gate sonucu).
  const { data: fuDraft } = await db
    .from('outreach_messages')
    .select('id, subject, body, status, created_by, sequence_step')
    .eq('lead_id', seeded.leadId)
    .eq('created_by', 'agent:followup')
    .single()
  expect(fuDraft).toBeTruthy()
  expect(fuDraft!.status).toBe('draft')
  expect(fuDraft!.sequence_step).toBe(4)
  expect(String(fuDraft!.body)).toContain('istemiyorsanız') // email opt-out
  expect(String(fuDraft!.body)).toContain('önceliğimiz değil') // itiraz karşılama açısı

  const { data: seqRow } = await db
    .from('follow_up_sequences')
    .select('done, outreach_message_id')
    .eq('lead_id', seeded.leadId)
    .single()
  expect(seqRow!.done).toBe(true)
  expect(seqRow!.outreach_message_id).toBe(fuDraft!.id) // adım taslağa BAĞLI — kaybolmadı

  const { data: version } = await db
    .from('outreach_message_versions')
    .select('source, gate_ok, version, recipient_email')
    .eq('outreach_message_id', fuDraft!.id)
    .single()
  expect(version!.source).toBe('generator:followup')
  expect(version!.gate_ok).toBe(true)
  expect(version!.recipient_email).toBe(seeded.email)

  // 3) UI: taslak /bugun panelinde görünür → editör → gate ✓ → onaya al.
  await login(page)
  await page.goto('/bugun')
  const row = page.getByTestId(`send-draft-${fuDraft!.id}`)
  await expect(row).toBeVisible()
  await row.getByTestId(`draft-edit-toggle-${fuDraft!.id}`).click()
  await row.getByTestId(`draft-gate-${fuDraft!.id}`).click()
  await expect(row.getByText('Kapı ✓')).toBeVisible({ timeout: 10_000 })
  await row.getByTestId(`draft-request-approval-${fuDraft!.id}`).click()
  await expect
    .poll(async () => (await row.getByTestId(`draft-state-${fuDraft!.id}`).textContent().catch(() => '')) ?? '', {
      timeout: 20_000,
    })
    .toContain('Onay bekliyor')

  // 4) Onay + dry-run send → next state (sent) — mevcut Gmail send machine.
  const { data: approval } = await db
    .from('approval_requests')
    .select('id')
    .eq('status', 'pending')
    .ilike('redacted_preview', '%E2E Test İşletmesi fu-vertical%')
    .single()
  expect(approval).toBeTruthy()
  const ap = await approve(request, approval!.id as string)
  expect(ap.status).toBe(200)
  const send = await sendGmail(request, fuDraft!.id as string, approval!.id as string)
  expect(send.status).toBe(200)
  expect(send.body?.data?.dryRun).toBe(true)
  const { data: after } = await db.from('outreach_messages').select('status, sent_at').eq('id', fuDraft!.id).single()
  expect(after!.status).toBe('sent')
  expect(after!.sent_at).toBeTruthy()
})

test('opt-out: due adım TASLAK ÜRETMEZ; tüm açık adımlar iptal edilir', async ({ request }) => {
  test.skip(IS_WEEKEND, 'iş günü kuralı: hafta sonu terfiler ertelenir (gerçek davranış)')
  const db = supabaseAdmin()
  const seeded = await seedDueStep('fu-optout', 1)
  await db.from('leads').update({ do_not_contact: true }).eq('id', seeded.leadId)

  const t = await tick(request)
  expect(t.status).toBe(200)

  const { data: fuDrafts } = await db
    .from('outreach_messages')
    .select('id')
    .eq('lead_id', seeded.leadId)
    .eq('created_by', 'agent:followup')
  expect(fuDrafts ?? []).toHaveLength(0)
  const { data: seqRows } = await db
    .from('follow_up_sequences')
    .select('done, outreach_message_id')
    .eq('lead_id', seeded.leadId)
  expect(seqRows!.every((s) => s.done === true)).toBe(true)
  expect(seqRows!.every((s) => s.outreach_message_id === null)).toBe(true)
})

test('EŞZAMANLI iki cron tick: aynı due adım için EXACTLY-ONCE taslak', async ({ request }) => {
  test.skip(IS_WEEKEND, 'iş günü kuralı: hafta sonu terfiler ertelenir (gerçek davranış)')
  const db = supabaseAdmin()
  const seeded = await seedDueStep('fu-concurrent', 5)

  const [a, b] = await Promise.all([tick(request), tick(request)])
  expect(a.status).toBe(200)
  expect(b.status).toBe(200)

  const { data: fuDrafts } = await db
    .from('outreach_messages')
    .select('id')
    .eq('lead_id', seeded.leadId)
    .eq('created_by', 'agent:followup')
  expect(fuDrafts ?? []).toHaveLength(1) // duplicate YOK (CAS claim)
})
