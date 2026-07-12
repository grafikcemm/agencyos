import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { APIRequestContext } from '@playwright/test'
import { E2E_OPERATOR_TOKEN } from '../playwright.config'

// .env.local'dan yalnız Supabase bağlantısını okur (seed + temizlik için).
// Değerler asla loglanmaz.
function readEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    // BOM temizliği: dosyanın ilk satırındaki ﻿ anahtar adını bozuyor.
    const raw = readFileSync(join(__dirname, '..', '.env.local'), 'utf8').replace(/^﻿/, '')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2].trim()
    }
  } catch {
    // yoksa process.env'e düşülür
  }
  return out
}

let cachedAdmin: SupabaseClient | null = null
export function supabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin
  const env = readEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env eksik (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  cachedAdmin = createClient(url, key, { auth: { persistSession: false } })
  return cachedAdmin
}

export const AUTH_HEADERS = {
  authorization: `Bearer ${E2E_OPERATOR_TOKEN}`,
  origin: 'http://localhost:3200',
  'content-type': 'application/json',
}

export const E2E_MARK = 'e2e-sprint-p0'
export const E2E_EMAIL_DOMAIN = 'e2e-test.example'

// Opt-out marker'ı auditCompliance.OPT_OUT_MARKER ile hizalı (import edilemez:
// dosya server-only). Marker değişirse bu sabit de güncellenmeli.
export const VALID_BODY = [
  'Merhaba,',
  '',
  'Web sitenizde e2e testine özel kısa bir öneri.',
  '',
  '—',
  'Grafikcem',
  'Bu tür e-postaları almak istemezseniz "ret" yanıtlamanız yeterlidir.',
].join('\n')

export interface SeededDraft {
  leadId: string
  draftId: string
  email: string
}

/** Test lead'i + email taslağı yaratır (canlı App DB — temizlik cleanupE2E'de). */
export async function seedDraft(suffix: string): Promise<SeededDraft> {
  const db = supabaseAdmin()
  const email = `kisi-${suffix}@${E2E_EMAIL_DOMAIN}`
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .insert({
      // E2E_MARK işareti business_name içinde — cleanup bu kalıpla siler
      // (leads tablosunda 'source' kolonu yok).
      business_name: `E2E Test İşletmesi ${suffix} (${E2E_MARK})`,
      email,
      status: 'new',
    })
    .select('id')
    .single()
  if (leadErr || !lead) throw new Error(`lead seed: ${leadErr?.message}`)

  const { data: draft, error: draftErr } = await db
    .from('outreach_messages')
    .insert({
      lead_id: lead.id,
      channel: 'email',
      status: 'draft',
      subject: `E2E konu ${suffix}`,
      body: VALID_BODY,
    })
    .select('id')
    .single()
  if (draftErr || !draft) throw new Error(`draft seed: ${draftErr?.message}`)
  return { leadId: lead.id as string, draftId: draft.id as string, email }
}

/** Bu suite'in yazdığı HER kaydı siler (artık bırakmama kuralı). */
export async function cleanupE2E(): Promise<void> {
  const db = supabaseAdmin()
  const { data: leads } = await db.from('leads').select('id').ilike('business_name', `%(${E2E_MARK})%`)
  const leadIds = (leads ?? []).map((l) => l.id as string)
  if (leadIds.length > 0) {
    const { data: drafts } = await db.from('outreach_messages').select('id').in('lead_id', leadIds)
    const draftIds = (drafts ?? []).map((d) => d.id as string)
    if (draftIds.length > 0) {
      await db.from('email_messages').delete().in('outreach_message_id', draftIds)
      await db.from('outreach_send_attempts').delete().in('outreach_message_id', draftIds)
      for (const id of draftIds) {
        await db.from('email_threads').delete().eq('gmail_thread_id', `dryrun-thread-${id}`)
      }
      await db.from('outreach_messages').delete().in('id', draftIds)
    }
    // idempotency_key hash'tir — onaylar preview'daki e2e domain izinden silinir.
    await db.from('approval_requests').delete().ilike('redacted_preview', `%${E2E_EMAIL_DOMAIN}%`)
    await db.from('leads').delete().in('id', leadIds)
  }
  await db.from('suppression_list').delete().ilike('address', `%@${E2E_EMAIL_DOMAIN}`)
  await db.from('suppression_list').delete().ilike('address', E2E_EMAIL_DOMAIN)
}

export async function requestSend(api: APIRequestContext, draftId: string, edits?: Record<string, string>) {
  const res = await api.post(`/api/outreach/${draftId}/request-send`, {
    headers: AUTH_HEADERS,
    data: edits ?? {},
  })
  return { status: res.status(), body: await res.json() }
}

export async function approve(api: APIRequestContext, approvalId: string) {
  const res = await api.post(`/api/approvals/${approvalId}`, {
    headers: AUTH_HEADERS,
    data: { decision: 'approved' },
  })
  return { status: res.status(), body: await res.json() }
}

export async function sendGmail(api: APIRequestContext, draftId: string, approvalId: string) {
  const res = await api.post(`/api/outreach/${draftId}/send-gmail`, {
    headers: AUTH_HEADERS,
    data: { approvalId },
  })
  return { status: res.status(), body: await res.json() }
}
