// Telegram SUCCESS-PATH E2E (Faz 5) — prod build'e karşı, TAMAMEN İZOLE:
// - LIFE erişimi TEST DB'sine yönlendirilmiş (playwright.config webServer env)
//   → canlı LIFE DB'ye SIFIR iz.
// - Bot token BOŞ + TELEGRAM_FAKE_TRANSPORT=success → dış Telegram çağrısı
//   yapısal imkânsız; cevap teslimi delivery ledger'da DB kanıtıyla izlenir.
// Zincir kanıtı: geçerli update → durable claim (fencing token) → handler →
// App DB mutasyonu → fake transport → delivery 'sent' → claim 'completed'.

import { test, expect } from '@playwright/test'
import {
  E2E_TELEGRAM_SECRET,
  E2E_TELEGRAM_CHAT_ID,
  E2E_TELEGRAM_USER_ID,
} from '../playwright.config'
import { seedDraft, cleanupE2E, supabaseAdmin, requestSend, approve } from './helpers'

const WEBHOOK = '/api/telegram'
// Her koşuda çakışmayan update_id aralığı (bigint).
const BASE_ID = 910_000_000 + (Date.now() % 1_000_000)

function tgHeaders() {
  return { 'x-telegram-bot-api-secret-token': E2E_TELEGRAM_SECRET, 'content-type': 'application/json' }
}

function update(updateId: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      text,
      chat: { id: Number(E2E_TELEGRAM_CHAT_ID) },
      from: { id: Number(E2E_TELEGRAM_USER_ID) },
    },
  }
}

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  const db = supabaseAdmin()
  // LIFE-mimic izleri: bu koşunun update aralığı + e2e görev başlıkları.
  await db.from('telegram_outbound_deliveries').delete().gte('update_id', 910_000_000)
  await db.from('telegram_update_claims').delete().gte('update_id', 910_000_000)
  await db.from('telegram_conversations').delete().ilike('message', '%e2e-tg%')
  await db.from('telegram_conversations').delete().eq('intent', 'sales:bugun')
  await db.from('telegram_conversations').delete().eq('intent', 'sales_show_reconcile')
  await db.from('telegram_conversations').delete().ilike('message', '%[e2e-ambiguous]%')
  await db.from('telegram_pending_actions').delete().eq('chat_key', E2E_TELEGRAM_CHAT_ID)
  await db.from('active_tasks').delete().ilike('title', '%e2e-tg görev%')
  await cleanupE2E()
})

test('success-path: /bugun → durable claim(completed, token) + fake delivery(sent) + conversation log', async ({ request }) => {
  const db = supabaseAdmin()
  const id = BASE_ID + 1

  const res = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(id, '/bugun') })
  expect(res.status()).toBe(200)
  expect((await res.json()).ok).toBe(true)

  // Durable claim: state makinesi 'completed' + fencing token yazılmış.
  const { data: claim } = await db.from('telegram_update_claims').select('*').eq('update_id', id).single()
  expect(claim?.status).toBe('completed')
  expect(claim?.claim_token).toBeTruthy()
  expect(claim?.attempt_count).toBe(1)

  // Cevap teslimi: fake transport başarı + ledger 'sent' + deterministik key.
  const { data: deliveries } = await db
    .from('telegram_outbound_deliveries')
    .select('delivery_key, status, message_id')
    .eq('update_id', id)
  expect(deliveries!.length).toBeGreaterThanOrEqual(1)
  expect(deliveries![0].status).toBe('sent')
  expect(Number(deliveries![0].message_id)).toBeGreaterThan(900_000_000) // fake transport kanıtı
})

test('duplicate delivery: aynı update ikinci kez → deduped, İKİNCİ cevap/log YOK', async ({ request }) => {
  const db = supabaseAdmin()
  const id = BASE_ID + 1 // önceki testin update'i (completed)

  const { data: before } = await db.from('telegram_outbound_deliveries').select('id').eq('update_id', id)
  const res = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(id, '/bugun') })
  expect(res.status()).toBe(200)
  expect((await res.json()).deduped).toBe(true)

  const { data: after } = await db.from('telegram_outbound_deliveries').select('id').eq('update_id', id)
  expect(after?.length).toBe(before?.length) // provider'a İKİNCİ mesaj gitmedi
})

test('failed claim devralma (stale-worker kurtarması): failed satır YENİ attempt ile işlenir', async ({ request }) => {
  const db = supabaseAdmin()
  const id = BASE_ID + 2
  // Crash sonrası durumu simüle et: claim 'failed' (lease bitti, eski worker öldü).
  await db.from('telegram_update_claims').insert({
    update_id: id, status: 'failed', attempt_count: 1, last_error: 'e2e: simulated crash',
  })

  const res = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(id, '/bugun') })
  expect(res.status()).toBe(200)

  const { data: claim } = await db.from('telegram_update_claims').select('*').eq('update_id', id).single()
  expect(claim?.status).toBe('completed')
  expect(claim?.attempt_count).toBe(2) // takeover kanıtı — mesaj KAYBOLMADI
})

test('lead action Telegram\'dan: "<işletme> arandı" → App DB contacted + audit(channel=telegram)', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('tg-aksiyon')
  await db.from('leads').update({ status: 'new', phone: '+90 555 999 88 77' }).eq('id', seeded.leadId)
  const businessName = `E2E Test İşletmesi tg-aksiyon (e2e-sprint-p0)`

  const res = await request.post(WEBHOOK, {
    headers: tgHeaders(),
    data: update(BASE_ID + 3, `${businessName} arandı`),
  })
  expect(res.status()).toBe(200)

  await expect
    .poll(async () => {
      const { data } = await db.from('leads').select('status').eq('id', seeded.leadId).single()
      return data?.status
    }, { timeout: 10_000 })
    .toBe('contacted')

  const { data: audit } = await db
    .from('lead_action_audit')
    .select('action, channel')
    .eq('lead_id', seeded.leadId)
  expect(audit).toHaveLength(1)
  expect(audit![0]).toMatchObject({ action: 'called', channel: 'telegram' })
})

test('pending add-task: "görev ekle" → durable pending → "1" → active_tasks satırı + pending tüketildi', async ({ request }) => {
  const db = supabaseAdmin()

  const r1 = await request.post(WEBHOOK, {
    headers: tgHeaders(),
    data: update(BASE_ID + 4, 'görev ekle: e2e-tg görev başlığı'),
  })
  expect(r1.status()).toBe(200)
  // Pending aksiyon DURABLE (memory değil) — kanıt: LIFE-mimic tabloda satır.
  const { data: pending } = await db
    .from('telegram_pending_actions')
    .select('action_type, payload')
    .eq('chat_key', E2E_TELEGRAM_CHAT_ID)
    .maybeSingle()
  expect(pending?.action_type).toBe('add_task_choice')

  const r2 = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(BASE_ID + 5, '1') })
  expect(r2.status()).toBe(200)

  const { data: tasks } = await db.from('active_tasks').select('title, category').ilike('title', '%e2e-tg görev%')
  expect(tasks).toHaveLength(1)
  expect(tasks![0].category).toBe('active')

  // Tek-kullanımlık: pending tüketildi.
  const { data: consumed } = await db
    .from('telegram_pending_actions')
    .select('chat_key')
    .eq('chat_key', E2E_TELEGRAM_CHAT_ID)
    .maybeSingle()
  expect(consumed).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────────────
// FINAL PILOT BLOCKERS Faz 6 — İMZALI (kod'lu) send akışı: onay → GÖNDER kartı
// (kod DB'den) → yanlış kod REDDEDİLİR (tüketmez) → doğru kod DRY-RUN gönderim
// (at-most-once). "Onayla" ≠ "Gönder" ayrı adımlar.
// ─────────────────────────────────────────────────────────────────────────────

test('imzalı send: approved onay → "gönder" kartı (kod) → yanlış kod red → doğru kod DRY-RUN gönderim', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('tg-signed-send')
  // Ayırt edici ada işaretle (resolveLeadByName ilike ile bulsun).
  const token = `tgsigned${Date.now() % 100000}`
  await db.from('leads').update({ business_name: `${token} (e2e-sprint-p0)` }).eq('id', seeded.leadId)

  // GERÇEK HITL onayı: request + approve (web application service).
  const rq = await requestSend(request, seeded.draftId)
  expect(rq.status).toBe(200)
  const ap = await approve(request, rq.body.data.approvalId as string)
  expect(ap.status).toBe(200)

  // Telegram "gönder" → imzalı aksiyon kurulur (mutasyon YOK; kod DB'de).
  const send1 = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(BASE_ID + 20, `${token} gönder`) })
  expect(send1.status()).toBe(200)
  const { data: pending } = await db
    .from('telegram_pending_actions')
    .select('action_type, code, payload')
    .eq('chat_key', E2E_TELEGRAM_CHAT_ID)
    .maybeSingle()
  expect(pending?.action_type).toBe('sales_send')
  const code = pending!.code as string
  expect(code).toMatch(/^[A-Z2-9]{6}$/)
  // Henüz GÖNDERİM YOK (kart aşaması) — send attempt oluşmadı.
  const { data: attempt0 } = await db.from('outreach_send_attempts').select('id').eq('outreach_message_id', seeded.draftId)
  expect(attempt0 ?? []).toHaveLength(0)

  // Yanlış kod → reddedilir, aksiyon TÜKETİLMEZ (tampered/replay güvenliği).
  const wrong = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(BASE_ID + 21, 'onayla ZZZ999') })
  expect(wrong.status()).toBe(200)
  const { data: stillPending } = await db.from('telegram_pending_actions').select('code').eq('chat_key', E2E_TELEGRAM_CHAT_ID).maybeSingle()
  expect(stillPending?.code).toBe(code) // hâlâ orada

  // Doğru kod → DRY-RUN gönderim (at-most-once; sendMachine attempt oluşur, sent).
  const right = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(BASE_ID + 22, `onayla ${code}`) })
  expect(right.status()).toBe(200)
  const { data: attempt1 } = await db
    .from('outreach_send_attempts')
    .select('state, rfc_message_id')
    .eq('outreach_message_id', seeded.draftId)
    .single()
  expect(['sent', 'reconciled'].includes(attempt1!.state as string)).toBe(true)
  expect(attempt1!.rfc_message_id).toBeTruthy()
  // İmzalı aksiyon tüketildi (tek-kullanımlık — replay edilemez).
  const { data: consumed } = await db.from('telegram_pending_actions').select('chat_key').eq('chat_key', E2E_TELEGRAM_CHAT_ID).maybeSingle()
  expect(consumed).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 5 — belirsiz provider sonucu (fake ambiguous) + parity komutu.
// ─────────────────────────────────────────────────────────────────────────────

test('AMBIGUOUS provider: ledger unknown + route 500; retry OTOMATİK RESEND YAPMAZ (tek satır, attempt=1)', async ({ request }) => {
  const db = supabaseAdmin()
  const seeded = await seedDraft('tg-ambig')
  // İşletme adına E2E marker gömülür → fake transport bu CEVABI belirsiz düşürür.
  await db
    .from('leads')
    .update({ business_name: 'Ambig [e2e-ambiguous] İşletmesi (e2e-sprint-p0)', status: 'new', phone: '+90 555 111 22 33' })
    .eq('id', seeded.leadId)

  const id = BASE_ID + 6
  const text = 'Ambig [e2e-ambiguous] İşletmesi arandı'

  // 1) İlk webhook: mutasyon çalışır, cevap teslimi BELİRSİZ → claim fail + 500
  //    (Telegram retry etsin; ledger duplicate'i yapısal engeller).
  const r1 = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(id, text) })
  expect(r1.status()).toBe(500)

  const { data: d1 } = await db
    .from('telegram_outbound_deliveries')
    .select('delivery_key, status, attempt_count')
    .eq('update_id', id)
  expect(d1).toHaveLength(1)
  expect(d1![0].status).toBe('unknown')
  expect(d1![0].attempt_count).toBe(1)

  // 2) Telegram retry (aynı update): unknown satır provider'ı BİR DAHA ÇAĞIRTMAZ —
  //    satır sayısı ve attempt_count DEĞİŞMEZ; yanıt yine 500 (manuel reconcile).
  const r2 = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(id, text) })
  expect(r2.status()).toBe(500)

  const { data: d2 } = await db
    .from('telegram_outbound_deliveries')
    .select('delivery_key, status, attempt_count')
    .eq('update_id', id)
  expect(d2).toHaveLength(1) // İKİNCİ provider çağrısı/satırı YOK
  expect(d2![0].status).toBe('unknown')
  expect(d2![0].attempt_count).toBe(1)

  // 3) Mutation-once: lead aksiyonu retry'da ÇOĞALMADI (tek audit satırı).
  const { data: audit } = await db.from('lead_action_audit').select('id').eq('lead_id', seeded.leadId)
  expect(audit).toHaveLength(1)
})

test('parity: /reconcile komutu unknown teslimatı GÖSTERİR (web ile aynı görünürlük)', async ({ request }) => {
  const id = BASE_ID + 7
  const res = await request.post(WEBHOOK, { headers: tgHeaders(), data: update(id, '/reconcile') })
  expect(res.status()).toBe(200)

  const db = supabaseAdmin()
  // Cevap teslim edildi (fake success) ve içerik unknown key'i içeriyor —
  // conversation log'dan doğrula.
  const { data: convo } = await db
    .from('telegram_conversations')
    .select('message')
    .eq('intent', 'sales_show_reconcile')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  expect(String(convo?.message ?? '')).toContain(`update:${BASE_ID + 6}:reply:1`)
})
