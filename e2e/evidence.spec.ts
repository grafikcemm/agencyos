import { test, expect } from '@playwright/test'
import { E2E_PASSWORD } from '../playwright.config'
import {
  seedDraft, cleanupE2E, requestSend, approve, sendGmail, supabaseAdmin,
} from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZATION Faz 1 — canonical artifact + evidence DİKEY akışı, GERÇEK YENİ
// ŞEMA üzerinde (mig 062 v2 test DB'ye KALICI uygulandı, mock yok):
//   üretim izi (versiyon+claim satırları) → düzenle → server-side remap →
//   kanıtsız/alakasız iddia FAIL-CLOSED → onay → dry-run send.
// İddia eşlemesi HİÇBİR adımda client'tan gitmez — sunucu kayıtlı bağları okur.
// ─────────────────────────────────────────────────────────────────────────────

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

/** Taslak + kanıt + GERÇEK versiyon/claim satırları (üretim izinin surrogate'i —
 *  LLM çağrısı E2E'de yok; persist yolunun kendisi unit'te, okuma/remap yolu burada). */
async function seedEvidencedDraft(suffix: string, claimText: string, evidenceKind: string, evidenceSummary: string) {
  const db = supabaseAdmin()
  const seeded = await seedDraft(suffix)

  const { data: evRow, error: evErr } = await db
    .from('lead_evidence')
    .insert({ lead_id: seeded.leadId, kind: evidenceKind, source: 'e2e-seed', summary: evidenceSummary, verified: false })
    .select('id')
    .single()
  expect(evErr, `lead_evidence seed hatası: ${evErr?.message}`).toBeNull()

  // Gövdeye iddia cümlesi ekle (mevcut geçerli gövdenin başına).
  const { data: om } = await db.from('outreach_messages').select('subject, body').eq('id', seeded.draftId).single()
  const newBody = `${claimText}\n${om!.body}`
  await db.from('outreach_messages').update({ body: newBody }).eq('id', seeded.draftId)

  const { data: ver, error: verErr } = await db
    .from('outreach_message_versions')
    .insert({
      outreach_message_id: seeded.draftId, version: 1, channel: 'email',
      recipient_kind: 'lead_email', recipient_email: seeded.email,
      subject: om!.subject, body: newBody, content_digest: 'e2e-v1',
      gate_ok: true, gate_digest: 'e2e-gate-v1', source: 'generator:cold_email', created_by: 'e2e',
    })
    .select('id')
    .single()
  expect(verErr, `versiyon seed hatası: ${verErr?.message}`).toBeNull()

  const { error: ceErr } = await db.from('outreach_claim_evidence').insert({
    message_version_id: ver!.id, outreach_message_id: seeded.draftId,
    claim_key: `e2e-${suffix}`, claim_text: claimText, claim_category: null,
    evidence_id: evRow!.id, evidence_type: evidenceKind, evidence_source: 'e2e-seed',
  })
  expect(ceErr, `claim seed hatası: ${ceErr?.message}`).toBeNull()

  return { ...seeded, evidenceId: evRow!.id as string, versionId: ver!.id as string, body: newBody }
}

test('dikey akış: kayıtlı kanıt bağı → server-side gate PASS → edit remap → onay → dry-run send + versiyon izi', async ({ page, request }) => {
  const db = supabaseAdmin()
  // Gözlem iddiası + uyumlu gözlemsel kanıt (html_signal).
  const seeded = await seedEvidencedDraft(
    'ev-vertical',
    'Sitenize baktım, mobil görünümde eksikler var.',
    'html_signal',
    'Site taraması: mobil görünüm kırık, başlık hiyerarşisi zayıf',
  )

  await login(page)
  await page.goto('/bugun')
  const row = page.getByTestId(`send-draft-${seeded.draftId}`)
  await expect(row).toBeVisible()

  // Editörü aç → kapıyı koş: iddia var ama SERVER kayıtlı bağı yükler → PASS.
  // (Client hiçbir claimEvidence göndermez — kanıt: gate yine de geçer.)
  await row.getByTestId(`draft-edit-toggle-${seeded.draftId}`).click()
  await row.getByTestId(`draft-gate-${seeded.draftId}`).click()
  await expect(row.getByText('Kapı ✓')).toBeVisible({ timeout: 10_000 })

  // Düzenleme: iddia cümlesi DEĞİŞMEDEN kalır + zararsız ek → remap bağı taşır.
  const bodyBox = row.getByTestId(`draft-body-${seeded.draftId}`)
  const current = await bodyBox.inputValue()
  await bodyBox.fill(`${current}\nEk not: örnek çalışmaları da ekleyebilirim.`)
  await row.getByTestId(`draft-gate-${seeded.draftId}`).click()
  await expect(row.getByText('Kapı ✓')).toBeVisible({ timeout: 10_000 })

  // Onaya al (gerçek finalBody) → rozet 'Onay bekliyor'.
  await row.getByTestId(`draft-request-approval-${seeded.draftId}`).click()
  await expect
    .poll(async () => (await row.getByTestId(`draft-state-${seeded.draftId}`).textContent().catch(() => '')) ?? '', {
      timeout: 20_000,
    })
    .toContain('Onay bekliyor')

  // DB kanıtı 1: editor versiyonu yazıldı (immutable zincir: v1 seed + v2 editor),
  // claim bağı yeni versiyona TAŞINDI, gate_ok=true.
  const { data: versions } = await db
    .from('outreach_message_versions')
    .select('id, version, source, gate_ok, recipient_email')
    .eq('outreach_message_id', seeded.draftId)
    .order('version', { ascending: true })
  expect(versions).toHaveLength(2)
  expect(versions![1].source).toBe('editor')
  expect(versions![1].gate_ok).toBe(true)
  expect(versions![1].recipient_email).toBe(seeded.email)
  const { data: movedClaims } = await db
    .from('outreach_claim_evidence')
    .select('claim_text, evidence_id')
    .eq('message_version_id', versions![1].id)
  expect(movedClaims).toHaveLength(1)
  expect(movedClaims![0].evidence_id).toBe(seeded.evidenceId)

  // Onay + dry-run send (GMAIL_SEND_ENABLED=false) → sent + email_messages izi.
  // run_id NULL yazılır (outreach-orijinli onay) — kart, preview'daki benzersiz
  // işletme adıyla bulunur.
  const { data: approval } = await db
    .from('approval_requests')
    .select('id')
    .eq('status', 'pending')
    .ilike('redacted_preview', '%E2E Test İşletmesi ev-vertical%')
    .single()
  const ap = await approve(request, approval!.id as string)
  expect(ap.status).toBe(200)
  const send = await sendGmail(request, seeded.draftId, approval!.id as string)
  expect(send.status).toBe(200)
  expect(send.body?.data?.dryRun).toBe(true)
  const { data: sentRow } = await db.from('outreach_messages').select('status, sent_at').eq('id', seeded.draftId).single()
  expect(sentRow?.status).toBe('sent')
  expect(sentRow?.sent_at).toBeTruthy()
})

test('fail-closed: iddia metni düzenlemeyle DEĞİŞİRSE bağ taşınmaz → onay isteği bloklanır', async ({ request }) => {
  const seeded = await seedEvidencedDraft(
    'ev-invalidate',
    'Google yorumlarınızı inceledim, tema tutarsız.',
    'review_signal',
    'Yorum taraması: görsel tutarsızlık şikayetleri',
  )
  // İddia cümlesi FARKLI bir iddiayla değiştirilir (remap eşleşmez) → fail-closed.
  const edited = seeded.body.replace(
    'Google yorumlarınızı inceledim, tema tutarsız.',
    'Rakip analizinize baktım, dönüşüm artışı garantili.',
  )
  const r = await requestSend(request, seeded.draftId, { finalBody: edited })
  expect(r.status).toBe(422)
  expect(JSON.stringify(r.body.blockedReasons ?? r.body)).toMatch(/CLAIM_WITHOUT_EVIDENCE|SPAM_RISK_LANGUAGE/)
})

test('fail-closed: ALAKASIZ kanıta bağlı sonuç vaadi CLAIM_EVIDENCE_MISMATCH ile bloklanır', async ({ request }) => {
  // outcome iddiası ('daha fazla randevu') pagespeed kanıtına bağlanmış —
  // sahiplik doğru ama TÜR uyumsuz → deterministik mismatch.
  const seeded = await seedEvidencedDraft(
    'ev-mismatch',
    'Yeni site ile daha fazla randevu alırsınız.',
    'pagespeed',
    'PageSpeed: mobil skor 34',
  )
  const r = await requestSend(request, seeded.draftId, {})
  expect(r.status).toBe(422)
  expect(JSON.stringify(r.body.blockedReasons ?? r.body)).toContain('CLAIM_EVIDENCE_MISMATCH')
})
