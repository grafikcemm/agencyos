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
import { escapeTelegramHtml as esc } from '@/lib/telegramHtml'
import type { SalesCommand } from './salesCommands'
import { consumePendingAction } from './pendingActions'

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
): Promise<{ kind: 'one'; id: string; businessName: string } | { kind: 'many'; names: string[] } | { kind: 'none' }> {
  if (!name.trim()) return { kind: 'none' }
  const { data } = await supabaseAdmin
    .from('leads')
    .select('id, business_name')
    .ilike('business_name', `%${name.trim()}%`)
    .limit(5)
  const rows = (data ?? []) as Array<{ id: string; business_name: string }>
  if (!rows.length) return { kind: 'none' }
  if (rows.length === 1) return { kind: 'one', id: rows[0].id, businessName: rows[0].business_name }
  return { kind: 'many', names: rows.map((r) => r.business_name) }
}

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
  if (resolved.kind === 'none') return `"${esc(cmd.leadName)}" adında lead bulamadım. Taslak oluşturulmadı.`
  if (resolved.kind === 'many') {
    return `Birden çok eşleşme:\n${resolved.names.map((n) => `• ${esc(n)}`).join('\n')}\nTam adıyla tekrar yaz. Taslak oluşturulmadı.`
  }

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, business_name, email, pitch_draft, first_message, sales_angle')
    .eq('id', resolved.id)
    .maybeSingle()
  const body =
    (lead?.first_message as string | null) ??
    (lead?.pitch_draft as string | null) ??
    null
  if (!body) {
    return `${esc(resolved.businessName)} için hazır mesaj verisi yok — önce kokpitten kanıt/pitch üret. Uydurma içerik yazmam.`
  }

  // GERÇEK draft kaydı (Jarvis'in salt-metin dönme bug'ının düzeltmesi):
  // status her zaman 'draft'; onay ve gönderim yalnız kokpit + HITL yolundan.
  const { data: draft, error } = await supabaseAdmin
    .from('outreach_messages')
    .insert({
      lead_id: resolved.id,
      channel: 'email',
      subject: cmd.kind === 'cold_email' ? `${resolved.businessName} — tasarım/web üzerine kısa not` : `Takip — ${resolved.businessName}`,
      body,
      sequence_step: cmd.kind === 'follow_up' ? 1 : 0,
      created_by: 'telegram',
      status: 'draft',
    })
    .select('id')
    .single()
  if (error) return `Taslak kaydedilemedi: ${esc(error.message)}`

  return (
    `📝 Taslak oluşturuldu: <b>${esc(resolved.businessName)}</b> (${draft.id.slice(0, 8)}…)\n` +
    `Durum: <b>taslak</b> — gönderilebilir DEĞİL.\n` +
    `Sonraki adım: /bugun kokpitinde incele → onay isteği oluştur. Buradan "onayla/gönder" yazmak gönderim başlatmaz.`
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
      return 'Kalıcı teklif motoru henüz canlı değil. Sıcak leadler için /bugun; taslaklar için /taslaklar.'
    case 'lead_action':
      return handleLeadAction(cmd, ctx.updateId)
    case 'prepare_draft':
      return handlePrepareDraft(cmd)
    case 'generic_approve':
      return handleGenericApprove(ctx.chatKey)
  }
}
