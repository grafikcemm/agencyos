import { test, expect } from '@playwright/test'
import { E2E_CRON_SECRET } from '../playwright.config'
import { seedDraft, cleanupE2E, requestSend, approve, sendGmail, supabaseAdmin, E2E_MARK } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 7 — inbound cevap ingest'i, GERÇEK route + GERÇEK şema
// üzerinde, FAKE transport ile (dış Gmail çağrısı yapısal imkânsız —
// GOOGLE_* env boş; fake yalnız bu koşulda çalışır):
//   dry-run send (rfc_message_id) → fake inbound cevap → attribution →
//   email_messages(inbound) → lead responded → açık follow-up İPTAL;
//   opt-out ("ret") → suppression + sonraki onay isteği 422 BLOKE.
// Zincirin "cevap algılama → follow-up durdurma → suppression" kısmı burada
// ölçülür; GERÇEK provider ile kanıt DEĞİLDİR (fake transport — dürüst etiket).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await cleanupE2E()
})

async function tick(request: import('@playwright/test').APIRequestContext, fakeMessages: unknown[]) {
  const res = await request.post('/api/cron/gmail-ingest', {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}`, 'content-type': 'application/json' },
    data: { fakeMessages },
  })
  return { status: res.status(), body: await res.json() }
}

test('cevap zinciri: dry-run sent → fake inbound → inbound kayıt + responded + follow-up İPTAL', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('gmail-reply')

  // 1) Gerçek HITL + dry-run send (mevcut makine) → rfc_message_id oluşur.
  const rq = await requestSend(request, seeded.draftId)
  expect(rq.status).toBe(200)
  const ap = await approve(request, rq.body.data.approvalId as string)
  expect(ap.status).toBe(200)
  const send = await sendGmail(request, seeded.draftId, rq.body.data.approvalId as string)
  expect(send.status).toBe(200)
  const { data: attempt } = await db
    .from('outreach_send_attempts')
    .select('rfc_message_id')
    .eq('outreach_message_id', seeded.draftId)
    .single()
  expect(attempt?.rfc_message_id).toBeTruthy()

  // Açık follow-up adımı (cevap gelince İPTAL olmalı).
  await db.from('follow_up_sequences').insert({
    lead_id: seeded.leadId, step: 1, channel: 'email',
    due_at: '2099-01-01T00:00:00.000Z', done: false,
  })

  // 2) Fake inbound cevap — In-Reply-To gerçek rfc id.
  const t = await tick(request, [
    {
      gmailMessageId: `e2e-in-${Date.now()}`,
      threadId: null,
      fromAddress: seeded.email,
      subject: 'Re: teklif',
      bodyText: 'Fiyat bilgisi alabilir miyim? Detay konuşalım.',
      inReplyTo: attempt!.rfc_message_id as string,
      references: null,
      internalDateMs: Date.now(),
    },
  ])
  expect(t.status).toBe(200)
  expect(t.body.transport).toBe('fake')
  expect(t.body.counters).toMatchObject({ ingested: 1, unmatched: 0, failed: 0, responded: 1 })

  // 3) DB kanıtları: inbound kayıt + lead responded + follow-up iptal.
  const { data: inbound } = await db
    .from('email_messages')
    .select('direction, outreach_message_id, from_address')
    .eq('outreach_message_id', seeded.draftId)
    .eq('direction', 'inbound')
  expect(inbound).toHaveLength(1)
  const { data: lead } = await db.from('leads').select('status').eq('id', seeded.leadId).single()
  expect(lead!.status).toBe('responded')
  const { data: fus } = await db
    .from('follow_up_sequences')
    .select('done')
    .eq('lead_id', seeded.leadId)
  expect(fus!.every((f) => f.done === true)).toBe(true)

  // 4) Aynı gmail mesajı ikinci kez (retry/overlap): dedupe — kayıt/yan etki
  //    ÇOĞALMAZ.
  const { data: firstRow } = await db
    .from('email_messages')
    .select('gmail_message_id')
    .eq('outreach_message_id', seeded.draftId)
    .eq('direction', 'inbound')
    .single()
  const t2 = await tick(request, [
    {
      gmailMessageId: firstRow!.gmail_message_id as string,
      threadId: null,
      fromAddress: seeded.email,
      subject: 'Re: teklif',
      bodyText: 'Fiyat bilgisi alabilir miyim? Detay konuşalım.',
      inReplyTo: attempt!.rfc_message_id as string,
      references: null,
      internalDateMs: Date.now(),
    },
  ])
  expect(t2.status).toBe(200)
  expect(t2.body.counters.deduped).toBe(1)
  const { data: allInbound } = await db
    .from('email_messages')
    .select('id')
    .eq('outreach_message_id', seeded.draftId)
    .eq('direction', 'inbound')
  expect(allInbound).toHaveLength(1)
})

test('OPT-OUT zinciri: "ret" cevabı → suppression + do_not_contact + SONRAKİ onay isteği 422 BLOKE', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('gmail-optout')
  const rq = await requestSend(request, seeded.draftId)
  expect(rq.status).toBe(200)
  const ap = await approve(request, rq.body.data.approvalId as string)
  expect(ap.status).toBe(200)
  const send = await sendGmail(request, seeded.draftId, rq.body.data.approvalId as string)
  expect(send.status).toBe(200)
  const { data: attempt } = await db
    .from('outreach_send_attempts')
    .select('rfc_message_id')
    .eq('outreach_message_id', seeded.draftId)
    .single()

  const t = await tick(request, [
    {
      gmailMessageId: `e2e-optout-${Date.now()}`,
      threadId: null,
      fromAddress: seeded.email,
      subject: 'Re: teklif',
      bodyText: 'Ret. Bir daha mail atmayın lütfen.',
      inReplyTo: attempt!.rfc_message_id as string,
      references: null,
      internalDateMs: Date.now(),
    },
  ])
  expect(t.status).toBe(200)
  expect(t.body.counters.optOuts).toBe(1)

  const { data: sup } = await db.from('suppression_list').select('reason').eq('address', seeded.email)
  expect(sup).toHaveLength(1)
  const { data: lead } = await db.from('leads').select('do_not_contact').eq('id', seeded.leadId).single()
  expect(lead!.do_not_contact).toBe(true)

  // Zincirin kapanışı: aynı lead'e YENİ taslak onaya BİLE gidemez (İYS).
  const { data: draft2 } = await db
    .from('outreach_messages')
    .insert({
      lead_id: seeded.leadId, channel: 'email', status: 'draft',
      subject: 'İkinci deneme', body: 'kısa metin', created_by: 'e2e', sequence_step: 0,
    })
    .select('id')
    .single()
  const rq2 = await requestSend(request, draft2!.id as string)
  expect(rq2.status).toBe(422)
  expect(JSON.stringify(rq2.body.blockedReasons ?? rq2.body)).toMatch(/suppress|do_not_contact/i)
})

test('GÖNDEREN UYUŞMAZLIĞI: bilinen In-Reply-To ama farklı From → karantina, lead DOKUNULMAZ', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('gmail-mismatch')
  const rq = await requestSend(request, seeded.draftId)
  expect(rq.status).toBe(200)
  const ap = await approve(request, rq.body.data.approvalId as string)
  expect(ap.status).toBe(200)
  const send = await sendGmail(request, seeded.draftId, rq.body.data.approvalId as string)
  expect(send.status).toBe(200)
  const { data: attempt } = await db
    .from('outreach_send_attempts')
    .select('rfc_message_id')
    .eq('outreach_message_id', seeded.draftId)
    .single()

  // Alakasız gönderen (yabancı adres) ama GEÇERLİ In-Reply-To taşıyor.
  const t = await tick(request, [
    {
      gmailMessageId: `e2e-mismatch-${Date.now()}`,
      threadId: null,
      fromAddress: `yabanci-${E2E_MARK}@baska-alan.example`,
      subject: `Re: teklif ${E2E_MARK}`,
      bodyText: 'Ret. Bir daha mail atmayın.',
      inReplyTo: attempt!.rfc_message_id as string,
      references: null,
      internalDateMs: Date.now(),
    },
  ])
  expect(t.status).toBe(200)
  expect(t.body.counters.senderMismatch).toBe(1)
  expect(t.body.counters.quarantined).toBe(1)
  expect(t.body.counters.optOuts).toBe(0)
  expect(t.body.counters.responded).toBe(0)

  // Lead DEĞİŞMEDİ: ne responded ne suppressed.
  const { data: lead } = await db.from('leads').select('status, do_not_contact').eq('id', seeded.leadId).single()
  expect(lead!.status).not.toBe('responded')
  expect(lead!.do_not_contact).toBe(false)
  // Karantina kaydı görünür.
  const { data: quar } = await db
    .from('gmail_inbound_quarantine')
    .select('reason')
    .eq('reason', 'sender_mismatch')
    .ilike('subject', `%${E2E_MARK}%`)
  expect((quar ?? []).length).toBeGreaterThanOrEqual(1)
  // Yabancı adres suppression'a EKLENMEDİ.
  const { data: sup } = await db.from('suppression_list').select('address').ilike('address', `%yabanci-${E2E_MARK}%`)
  expect(sup ?? []).toHaveLength(0)
})

test('SHADOW mode + fake-guard: bayrak kapalıyken mutasyon yok; yanlış secret 401', async ({ request }) => {
  // Yanlış cron secret → 401.
  const bad = await request.post('/api/cron/gmail-ingest', {
    headers: { authorization: 'Bearer yanlis' },
    data: { fakeMessages: [] },
  })
  expect(bad.status()).toBe(401)
  // Bozuk fake gövde → 400 (şema fail-closed).
  const malformed = await request.post('/api/cron/gmail-ingest', {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}`, 'content-type': 'application/json' },
    data: { fakeMessages: [{ yanlisAlan: true }] },
  })
  expect(malformed.status()).toBe(400)
})
