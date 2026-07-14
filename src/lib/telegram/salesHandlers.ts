// ─────────────────────────────────────────────────────────────────────────────
// Telegram satış komutları → kokpit service katmanı (Faz B6).
//
// AYRI SORGU KOPYASI YOK: /bugun, /aranacaklar, /taslaklar, /takipler,
// /sorunlar, /pipeline hepsi getTodayCockpit()'ten okur → web /bugun sayfası
// ile AYNI lead kimlikleri, AYNI sıralama, AYNI blocker durumları.
//
// Mutasyonlar applyLeadAction'dan geçer (audit + idempotency + geçiş kuralı).
// Taslak üretimi HİÇBİR ZAMAN "gönderilebilir" izlenimi vermez — onay kokpitte.
// ─────────────────────────────────────────────────────────────────────────────

import { getTodayCockpit, type TodayCockpit } from '@/lib/cockpit/today'
import { applyLeadAction, type LeadRowAction } from '@/lib/cockpit/leadActions'
import { supabaseAdmin } from '@/lib/supabase'
import { lifeSupabaseAdmin } from '@/lib/lifeSupabaseAdmin'
import { escapeTelegramHtml as esc } from '@/lib/telegramHtml'
import type { SalesCommand } from './salesCommands'
import { consumePendingAction } from './pendingActions'
import { generateColdEmailDraft } from '@/lib/outreach/coldEmailService'
import { requestSendApproval, findSendApproval } from '@/lib/outreach/gmail'
import { createProposalDraft, listProposalsForLead } from '@/lib/proposals/proposalService'
import { classifyDraftState, DRAFT_NEXT_ACTION } from '@/lib/cockpit/shared'
import { resolveCanonicalRecipient } from '@/lib/contacts/contactService'
import { getSuppressedSet } from '@/lib/outreach/auditCompliance'

const TL = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} TL`

function formatCalls(c: TodayCockpit): string {
  const { items, error } = c.leadsToCall
  if (error) return `Aranacaklar yüklenemedi: ${esc(error)}`
  if (!items.length) return 'Bugün için aranacak aktif lead yok.'
  const lines = items.map((l, i) => {
    const badge = l.source === 'due' ? 'TAKİP' : 'GÜNÜN'
    return `${i + 1}. <b>${esc(l.businessName)}</b> [${badge}] ${esc(l.phone ?? 'telefon yok')}`
  })
  const dup = c.callDuplicates.length
    ? `\n⚠ ${c.callDuplicates.length} olası duplicate telefon — kokpitten incele.`
    : ''
  return `<b>Bugün aranacaklar (${items.length})</b>\n${lines.join('\n')}${dup}\n\nAksiyon: "&lt;işletme&gt; arandı / ulaşılamadı / görüşme oldu / daha sonra ara yarın"`
}

function formatDrafts(c: TodayCockpit): string {
  const { items, error } = c.pendingSends
  if (error) return `Taslaklar yüklenemedi: ${esc(error)}`
  if (!items.length) return 'Bekleyen e-posta taslağı yok.'
  const stateLabel: Record<string, string> = {
    recipient_missing: '🔴 alıcı yok',
    compliance_blocked: '⛔ suppression',
    approval_missing: '🟠 onay yok',
    approval_pending: '🟡 onay bekliyor',
    approved: '🟢 onaylı',
    sent: '✅ gönderildi',
    unknown: '❓ reconcile gerek',
    finalize_pending: '❓ finalize eksik',
    failed: '🔴 hata',
  }
  const lines = items.map(
    (d) => `• <b>${esc(d.businessName)}</b> — ${stateLabel[d.state] ?? d.state}\n  ↳ ${esc(d.nextAction)}`,
  )
  return `<b>Taslak darboğazı (${items.length})</b>\n${lines.join('\n')}\n\nOnay ve gönderim YALNIZ /bugun kokpitinden yapılır.`
}

function formatToday(c: TodayCockpit): string {
  const calls = c.leadsToCall.items.length
  const drafts = c.pendingSends.items.length
  const followups = c.overdueFollowups.items.length
  const issues = c.sendIssues.items.length
  const hot = c.hotLeads.items.length
  const rev = c.revenue.data
  const next =
    calls > 0
      ? `İlk iş: <b>${esc(c.leadsToCall.items[0].businessName)}</b>'i ara.`
      : drafts > 0
        ? 'İlk iş: taslak darboğazını temizle (/taslaklar).'
        : 'Bugün acil satış işi görünmüyor.'
  return [
    `<b>Bugün — satış özeti</b>`,
    `📞 Aranacak: ${calls}  ✉️ Taslak: ${drafts}  ⏰ Geciken takip: ${followups}`,
    `⚠ Gönderim sorunu: ${issues}  🔥 Sıcak lead: ${hot}`,
    rev ? `💰 Ağırlıklı pipeline: ${TL(rev.weightedPipelineTl)} / hedef ${TL(rev.targetTl)}` : '',
    '',
    next,
  ]
    .filter(Boolean)
    .join('\n')
}

function formatFollowups(c: TodayCockpit): string {
  const { items, error } = c.overdueFollowups
  if (error) return `Takipler yüklenemedi: ${esc(error)}`
  if (!items.length) return 'Geciken follow-up yok.'
  return `<b>Geciken takipler (${items.length})</b>\n${items
    .map((f) => `• ${esc(f.businessName)} — adım ${f.step}, vade ${f.dueAt.slice(0, 10)}`)
    .join('\n')}`
}

function formatIssues(c: TodayCockpit): string {
  const { items, error } = c.sendIssues
  if (error) return `Sorunlar yüklenemedi: ${esc(error)}`
  if (!items.length) return 'Gönderim/reconciliation sorunu yok.'
  return `<b>Gönderim sorunları (${items.length})</b>\n${items
    .map((s) => `• ${s.outreachMessageId.slice(0, 8)}… — ${s.state}${s.finalized ? '' : ' (finalize eksik)'}`)
    .join('\n')}\n\nReconcile kokpitten çalıştırılır.`
}

function formatPipeline(c: TodayCockpit): string {
  const rev = c.revenue.data
  if (!rev) return `Pipeline yüklenemedi: ${esc(c.revenue.error ?? 'bilinmeyen hata')}`
  const stages = rev.byStage
    .map((s) => `• ${s.stage}: ${s.count} lead, ${TL(s.weightedTl)}`)
    .join('\n')
  return `<b>Pipeline</b>\nAğırlıklı beklenen: <b>${TL(rev.weightedPipelineTl)}</b> / hedef ${TL(rev.targetTl)}\n${stages}`
}

/** İsimle lead bul: tek eşleşme → id; çoklu → seçenek listesi; yok → null. */
async function resolveLeadByName(
  name: string,
): Promise<
  | { kind: 'one'; id: string; businessName: string }
  | { kind: 'many'; names: string[] }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
> {
  if (!name.trim()) return { kind: 'none' }
  // FINALIZATION Faz 5: DB hatasi 'bulunamadi' DEGILDIR - acik hata doner.
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, business_name')
    .ilike('business_name', `%${name.trim()}%`)
    .limit(5)
  if (error) return { kind: 'error', message: error.message }
  const rows = (data ?? []) as Array<{ id: string; business_name: string }>
  if (!rows.length) return { kind: 'none' }
  if (rows.length === 1) return { kind: 'one', id: rows[0].id, businessName: rows[0].business_name }
  return { kind: 'many', names: rows.map((r) => r.business_name) }
}

const LEAD_LOOKUP_ERR = (msg: string) =>
  `Lead sorgusu HATA verdi (bulunamadı değil): ${esc(msg)} — tekrar dene.`

const ACTION_LABEL: Record<LeadRowAction, string> = {
  called: 'arandı',
  no_answer: 'ulaşılamadı',
  meeting: 'görüşme oldu',
  later: 'daha sonra aranacak',
  note: 'not eklendi',
}

/** "yarın", "3 gün sonra", ISO tarih → ISO. Anlaşılamazsa null (mutasyon yok). */
export function parseLaterHint(hint: string | undefined, nowMs: number): string | null {
  if (!hint) return new Date(nowMs + 86_400_000).toISOString() // varsayılan: yarın
  const t = hint.toLowerCase().trim()
  if (/yar[ıi]n/.test(t)) return new Date(nowMs + 86_400_000).toISOString()
  const days = t.match(/(\d{1,2})\s*g[uü]n/)
  if (days) return new Date(nowMs + Number(days[1]) * 86_400_000).toISOString()
  const week = t.match(/(\d{1,2})?\s*hafta/)
  if (week) return new Date(nowMs + (Number(week[1]) || 1) * 7 * 86_400_000).toISOString()
  const iso = Date.parse(hint)
  if (Number.isFinite(iso) && iso > nowMs) return new Date(iso).toISOString()
  return null
}

async function handleLeadAction(
  cmd: Extract<SalesCommand, { type: 'lead_action' }>,
  updateId: number,
): Promise<string> {
  const resolved = await resolveLeadByName(cmd.leadName)
  if (resolved.kind === 'error') return LEAD_LOOKUP_ERR(resolved.message)
  if (resolved.kind === 'none') return `"${esc(cmd.leadName)}" adında lead bulamadım. Tam adıyla dener misin?`
  if (resolved.kind === 'many') {
    return `Birden çok eşleşme var, hangisi?\n${resolved.names.map((n) => `• ${esc(n)}`).join('\n')}\n(Tam adıyla tekrar yaz — mutasyon yapılmadı.)`
  }

  const nowMs = Date.now()
  let laterAtIso: string | undefined
  if (cmd.action === 'later') {
    const parsed = parseLaterHint(cmd.timeHint, nowMs)
    if (!parsed) return `Zamanı anlayamadım ("${esc(cmd.timeHint ?? '')}"). Örnek: "daha sonra ara yarın" veya "3 gün".`
    laterAtIso = parsed
  }

  const result = await applyLeadAction({
    leadId: resolved.id,
    action: cmd.action,
    actor: 'telegram-operator',
    channel: 'telegram',
    note: cmd.note,
    laterAtIso,
    idempotencyKey: `tg-${updateId}-${resolved.id}-${cmd.action}`,
    nowMs,
  })

  if (!result.ok) return `Aksiyon uygulanamadı: ${esc(result.error ?? 'bilinmeyen hata')}`
  const replay = result.idempotentReplay ? ' (tekrar — zaten işlenmişti)' : ''
  const auditNote = result.audit === 'degraded' ? '\n⚠ Audit tablosu henüz canlı değil (mig 057 onay bekliyor).' : ''
  return `✔ <b>${esc(resolved.businessName)}</b>: ${ACTION_LABEL[cmd.action]}${replay}.\n${
    result.after?.next_follow_up_at ? `Sonraki takip: ${result.after.next_follow_up_at.slice(0, 16).replace('T', ' ')}` : ''
  }${auditNote}`
}

async function handlePrepareDraft(
  cmd: Extract<SalesCommand, { type: 'prepare_draft' }>,
): Promise<string> {
  if (!cmd.leadName) {
    return 'Hangi işletme için? Örnek: "Klinik X için cold email hazırla". (Taslak oluşturulmadı.)'
  }
  const resolved = await resolveLeadByName(cmd.leadName)
  if (resolved.kind === 'error') return LEAD_LOOKUP_ERR(resolved.message)
  if (resolved.kind === 'none') return `"${esc(cmd.leadName)}" adında lead bulamadım. Taslak oluşturulmadı.`
  if (resolved.kind === 'many') {
    return `Birden çok eşleşme:\n${resolved.names.map((n) => `• ${esc(n)}`).join('\n')}\nTam adıyla tekrar yaz. Taslak oluşturulmadı.`
  }

  if (cmd.kind === 'follow_up') {
    return (
      'Takip taslakları sequence motorundan üretilir (vadesi gelen adım /bugun paneline düşer). ' +
      'Manuel takip için kokpitteki taslağı düzenle; buradan legacy metin üretmem.'
    )
  }

  // FINALIZATION Faz 5: legacy first_message/pitch_draft YOLU KALDIRILDI —
  // web ile AYNI canonical cold-email servisi (structured claims + Voice DNA +
  // canonical alıcı + gate + immutable versiyon izi).
  const result = await generateColdEmailDraft(resolved.id)
  if (!result.ok) {
    return `Taslak üretilemedi: ${esc(result.error ?? 'bilinmeyen hata')}${result.modelFailed ? ' (model çıktısı bozuk — tekrar dene)' : ''}`
  }
  const q = result.quality
  const gateLine = q?.ok
    ? '✅ Kalite kapısı: geçti.'
    : `⛔ Kalite kapısı: ${esc(q?.violations.map((v) => v.code).join(', ') ?? 'ihlal')} — kokpit editöründen düzelt.`
  const claimLine =
    (result.claims?.length ?? 0) > 0
      ? `Kanıtlı iddia: ${result.claims!.length} (iz: ${result.claimPersisted ? 'yazıldı' : 'YAZILAMADI — mig 062 bekliyor'})`
      : 'Somut iddia yok (kanıt listesi boş olabilir).'
  return (
    `📝 Canonical taslak üretildi: <b>${esc(resolved.businessName)}</b> (${String(result.draft!.id).slice(0, 8)}…)\n` +
    `${gateLine}\n${claimLine}${result.voiceDegraded ? '\n⚠ Voice DNA kuralları okunamadı (degraded).' : ''}\n` +
    `Durum: <b>taslak</b> — gönderilebilir DEĞİL. "&lt;işletme&gt; onaya al" ile HITL onayı başlatabilirsin; gönderim kokpitten.`
  )
}

// ── FINALIZATION Faz 5: web kokpitiyle parity komutları ──────────────────────

/** Lead'in EN SON email taslağının durumunu web ile AYNI sınıflandırıcıyla verir. */
async function handleDraftStatus(cmd: Extract<SalesCommand, { type: 'draft_status' }>): Promise<string> {
  if (!cmd.leadName) return 'Hangi işletme? Örnek: "Denta taslak durumu".'
  const resolved = await resolveLeadByName(cmd.leadName)
  if (resolved.kind === 'error') return LEAD_LOOKUP_ERR(resolved.message)
  if (resolved.kind === 'none') return `"${esc(cmd.leadName)}" adında lead bulamadım.`
  if (resolved.kind === 'many') {
    return `Birden çok eşleşme:\n${resolved.names.map((n) => `• ${esc(n)}`).join('\n')}`
  }

  const { data: draft, error } = await supabaseAdmin
    .from('outreach_messages')
    .select('id, status, subject')
    .eq('lead_id', resolved.id)
    .eq('channel', 'email')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return `Taslak sorgusu hata verdi: ${esc(error.message)}`
  if (!draft) return `${esc(resolved.businessName)} için e-posta taslağı yok. "cold email hazırla" ile üretebilirsin.`

  const [attemptQ, recipient] = await Promise.all([
    supabaseAdmin
      .from('outreach_send_attempts')
      .select('state, finalized')
      .eq('outreach_message_id', draft.id)
      .maybeSingle(),
    resolveCanonicalRecipient(resolved.id),
  ])
  if (attemptQ.error) return `Gönderim durumu okunamadı: ${esc(attemptQ.error.message)}`
  let approval: { status: string } | null = null
  try {
    approval = await findSendApproval(draft.id as string)
  } catch (err) {
    return `Onay durumu okunamadı: ${esc(err instanceof Error ? err.message : 'hata')}`
  }
  const suppressed = recipient.email ? (await getSuppressedSet([recipient.email])).has(recipient.email) : false
  const state = classifyDraftState({
    attemptState: (attemptQ.data?.state as string) ?? null,
    attemptFinalized: Boolean(attemptQ.data?.finalized),
    hasRecipient: Boolean(recipient.email),
    suppressed,
    approvalStatus: approval?.status ?? null,
    rowStatus: draft.status as string,
  })
  return (
    `<b>${esc(resolved.businessName)}</b> — taslak durumu: <b>${state}</b>\n` +
    `Konu: ${esc((draft.subject as string) ?? '(yok)')}\n` +
    `Sonraki adım: ${esc(DRAFT_NEXT_ACTION[state])}`
  )
}

/** "onaya al": lead'in en son taslağı için GERÇEK HITL onay isteği (send DEĞİL). */
async function handleRequestSendApproval(
  cmd: Extract<SalesCommand, { type: 'request_send_approval' }>,
): Promise<string> {
  if (!cmd.leadName) return 'Hangi işletme? Örnek: "Denta onaya al".'
  const resolved = await resolveLeadByName(cmd.leadName)
  if (resolved.kind === 'error') return LEAD_LOOKUP_ERR(resolved.message)
  if (resolved.kind === 'none') return `"${esc(cmd.leadName)}" adında lead bulamadım.`
  if (resolved.kind === 'many') {
    return `Birden çok eşleşme:\n${resolved.names.map((n) => `• ${esc(n)}`).join('\n')}`
  }
  const { data: draft, error } = await supabaseAdmin
    .from('outreach_messages')
    .select('id')
    .eq('lead_id', resolved.id)
    .eq('channel', 'email')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return `Taslak sorgusu hata verdi: ${esc(error.message)}`
  if (!draft) return `${esc(resolved.businessName)} için açık taslak yok.`

  // Web ile AYNI application service: suppression + kalite kapısı + digest'li
  // onay kartı. GÖNDERİM DEĞİL — send yalnız kokpit HITL akışından.
  const result = await requestSendApproval(draft.id as string)
  if (!result.ok) {
    if (result.blockedReasons?.length) {
      return `⛔ Onay isteği bloklandı: ${esc(result.blockedReasons.join(', '))} — kokpit editöründen düzelt.`
    }
    return `Onay isteği oluşturulamadı: ${esc(result.error ?? 'bilinmeyen hata')}`
  }
  return (
    `🟡 Onay isteği oluşturuldu: <b>${esc(resolved.businessName)}</b> (durum: ${esc(result.status ?? 'pending')}).\n` +
    'Gönderim YAPILMADI — onay ve gönderim /bugun kokpitindeki HITL akışından.'
  )
}

/** Teklifleri göster: lead verilirse o lead'in kalıcı teklifleri; verilmezse son 5. */
async function handleShowProposals(cmd: Extract<SalesCommand, { type: 'show_proposals' }>): Promise<string> {
  if (cmd.leadName) {
    const resolved = await resolveLeadByName(cmd.leadName)
    if (resolved.kind === 'error') return LEAD_LOOKUP_ERR(resolved.message)
    if (resolved.kind === 'none') return `"${esc(cmd.leadName)}" adında lead bulamadım.`
    if (resolved.kind === 'many') {
      return `Birden çok eşleşme:\n${resolved.names.map((n) => `• ${esc(n)}`).join('\n')}`
    }
    const list = await listProposalsForLead(resolved.id)
    if (!list.ok) {
      return list.schemaMissing
        ? 'Teklif şeması (mig 061) canlı değil — kalıcı teklifler onay sonrası görünür.'
        : `Teklifler okunamadı: ${esc(list.error ?? 'hata')}`
    }
    if (!list.proposals.length) {
      return `${esc(resolved.businessName)} için kalıcı teklif yok. "&lt;işletme&gt; için teklif hazırla" ile oluştur.`
    }
    return (
      `<b>${esc(resolved.businessName)} — teklifler</b>\n` +
      list.proposals
        .map((p) => `• v${p.currentVersion} — ${p.status}${p.pendingApprovalVersion ? ` (onay bekliyor: v${p.pendingApprovalVersion})` : ''}`)
        .join('\n')
    )
  }
  const { data, error } = await supabaseAdmin
    .from('proposals')
    .select('id, status, current_version, leads(business_name)')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code ?? '')) {
      return 'Teklif şeması (mig 061) canlı değil — kalıcı teklifler onay sonrası görünür.'
    }
    return `Teklifler okunamadı: ${esc(error.message)}`
  }
  if (!data?.length) return 'Kalıcı teklif yok. "&lt;işletme&gt; için teklif hazırla" ile oluştur.'
  return (
    '<b>Son teklifler</b>\n' +
    data
      .map((p) => {
        const name = (p as { leads?: { business_name?: string } }).leads?.business_name ?? '—'
        return `• ${esc(name)} — v${p.current_version} ${p.status}`
      })
      .join('\n')
  )
}

/** Teklif hazırla: web ile AYNI application service (gerçek gate + tx RPC). */
async function handleCreateProposal(cmd: Extract<SalesCommand, { type: 'create_proposal' }>): Promise<string> {
  if (!cmd.leadName) return 'Hangi işletme? Örnek: "Denta için teklif hazırla".'
  const resolved = await resolveLeadByName(cmd.leadName)
  if (resolved.kind === 'error') return LEAD_LOOKUP_ERR(resolved.message)
  if (resolved.kind === 'none') return `"${esc(cmd.leadName)}" adında lead bulamadım.`
  if (resolved.kind === 'many') {
    return `Birden çok eşleşme:\n${resolved.names.map((n) => `• ${esc(n)}`).join('\n')}`
  }
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select('recommended_offers')
    .eq('id', resolved.id)
    .maybeSingle()
  if (error) return `Lead okunamadı: ${esc(error.message)}`
  const offerIds = ((lead?.recommended_offers as Array<{ offerId?: string }>) ?? [])
    .map((o) => o.offerId)
    .filter((x): x is string => Boolean(x))
  if (!offerIds.length) {
    return `${esc(resolved.businessName)} için önerilmiş hizmet yok — önce kokpit/haritadan hizmet önerisi üret.`
  }
  const result = await createProposalDraft({ leadId: resolved.id, offerIds })
  if (!result.ok) {
    if (result.schemaMissing) return 'Teklif şeması (mig 061) canlı değil — kalıcı teklif onay sonrası mümkün.'
    if (result.quality) {
      return `⛔ Kalite kapısı blokladı: ${esc(result.quality.violations.map((v) => v.code).join(', '))}`
    }
    return `Teklif oluşturulamadı: ${esc(result.error ?? 'bilinmeyen hata')}`
  }
  return (
    `📄 Kalıcı teklif: <b>${esc(resolved.businessName)}</b> v${result.version}${result.atomic ? '' : ' (legacy yol)'}\n` +
    'Onay/karar web kokpitinden veya "teklifleri göster" ile izlenir. Gönderim yolu YOK (HITL + flag).'
  )
}

/** Reconcile görünümü: Gmail send sorunları + Telegram unknown/pending teslimatlar. */
async function handleShowReconcile(): Promise<string> {
  const c = await getTodayCockpit()
  const gmail = c.sendIssues.error
    ? `Gmail sorunları okunamadı: ${esc(c.sendIssues.error)}`
    : c.sendIssues.items.length
      ? c.sendIssues.items
          .map((s) => `• ${s.outreachMessageId.slice(0, 8)}… — ${s.state}${s.finalized ? '' : ' (finalize eksik)'}`)
          .join('\n')
      : 'Gmail tarafında bekleyen sorun yok.'

  let telegramPart: string
  const { data, error } = await lifeSupabaseAdmin
    .from('telegram_outbound_deliveries')
    .select('delivery_key, status, attempt_count, updated_at')
    .in('status', ['unknown', 'pending'])
    .order('updated_at', { ascending: false })
    .limit(8)
  if (error) {
    telegramPart = ['42P01', 'PGRST205', 'PGRST204', '42703'].includes(error.code ?? '')
      ? 'Telegram teslimat ledger şeması canlı değil (LIFE 006 bekliyor).'
      : `Telegram teslimatları okunamadı: ${esc(error.message)}`
  } else if (!data?.length) {
    telegramPart = 'Telegram tarafında unknown/pending teslimat yok.'
  } else {
    telegramPart = data
      .map((d) => `• ${esc(String(d.delivery_key))} — ${d.status} (deneme ${d.attempt_count ?? 1})`)
      .join('\n')
  }
  return (
    `<b>Reconcile görünümü</b>\n\n<u>Gmail</u>\n${gmail}\n\n<u>Telegram</u>\n${telegramPart}\n\n` +
    'Karar (assume_delivered / mark_failed) yalnız diagnostics reconcile endpoint\'inden — otomatik resend YOK.'
  )
}

async function handleGenericApprove(chatKey: string): Promise<string> {
  // Tek kullanımlık, TTL'li, digest'li pending aksiyon YOKSA generic onay hiçbir şey yapmaz.
  const pending = await consumePendingAction(chatKey)
  if (!pending) {
    return 'Bekleyen bir onay aksiyonu yok — hiçbir şey gönderilmedi. E-posta onayı yalnız /bugun kokpitindeki HITL akışından yapılır.'
  }
  // Şu an Telegram'dan onaylanabilir tek aksiyon tipi yok (send onayı BİLİNÇLİ kokpitte).
  return 'Bu aksiyon Telegram üzerinden onaylanamaz — /bugun kokpitini kullan. (Aksiyon tüketildi, tekrar denemek için yeniden başlat.)'
}

/** Satış komutunu işler ve kullanıcıya dönecek HTML metnini üretir. */
export async function handleSalesCommand(
  cmd: SalesCommand,
  ctx: { updateId: number; chatKey: string },
): Promise<string> {
  switch (cmd.type) {
    case 'sales_today':
      return formatToday(await getTodayCockpit())
    case 'sales_calls':
      return formatCalls(await getTodayCockpit())
    case 'sales_drafts':
      return formatDrafts(await getTodayCockpit())
    case 'sales_followups':
      return formatFollowups(await getTodayCockpit())
    case 'sales_issues':
      return formatIssues(await getTodayCockpit())
    case 'sales_pipeline':
      return formatPipeline(await getTodayCockpit())
    case 'show_proposals':
      return handleShowProposals(cmd)
    case 'create_proposal':
      return handleCreateProposal(cmd)
    case 'draft_status':
      return handleDraftStatus(cmd)
    case 'request_send_approval':
      return handleRequestSendApproval(cmd)
    case 'show_reconcile':
      return handleShowReconcile()
    case 'lead_action':
      return handleLeadAction(cmd, ctx.updateId)
    case 'prepare_draft':
      return handlePrepareDraft(cmd)
    case 'generic_approve':
      return handleGenericApprove(ctx.chatKey)
  }
}
