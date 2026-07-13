// ─────────────────────────────────────────────────────────────────────────────
// Contact servisi (Faz 2.1/2.3) — TEK katman.
//
// - create/setPrimary: önce mig 059 RPC (tek transaction; insert başarısızsa
//   eski primary KAYBOLMAZ). RPC yoksa (onay bekliyor) legacy yol: yeni kayıt
//   ÖNCE primary yazılır, sonra diğerleri indirilir — ara adım başarısız olsa
//   bile "primary'siz kalma" durumu oluşmaz (iki-primary görünümü geçici ve
//   kurtarılabilir; atomic:false ile görünür).
// - resolveCanonicalRecipient: primary contact email → lead.email fallback.
//   Gmail load/approval/send AYNI resolver'ı kullanır (kopya kural yok).
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase'

const RPC_MISSING = new Set(['PGRST202', '42883'])

export interface ContactInput {
  leadId: string
  fullName: string
  role: string
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  source: string
  notes?: string | null
  isPrimary: boolean
}

export interface ContactResult {
  ok: boolean
  id?: string
  error?: string
  /** true → mig 059 RPC tek transaction; false → legacy (bilinen yarış penceresi). */
  atomic: boolean
  duplicate?: boolean
}

export async function createContact(input: ContactInput): Promise<ContactResult> {
  // 1) Atomik RPC (mig 059).
  const { data, error } = await supabaseAdmin.rpc('create_contact_tx', {
    p_lead_id: input.leadId,
    p_full_name: input.fullName,
    p_role: input.role,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_linkedin: input.linkedinUrl ?? null,
    p_source: input.source,
    p_notes: input.notes ?? null,
    p_is_primary: input.isPrimary,
  })
  if (!error) {
    const r = data as { outcome: string; id?: string; error?: string }
    if (r.outcome === 'created') return { ok: true, id: r.id, atomic: true }
    if (r.outcome === 'duplicate') return { ok: false, error: r.error, duplicate: true, atomic: true }
    return { ok: false, error: r.error ?? 'reddedildi', atomic: true }
  }
  if (!RPC_MISSING.has(error.code ?? '')) {
    // Beklenmeyen DB hatası: yarım-yazım riskine legacy ile devam ETME.
    console.error('[contacts] create_contact_tx hatası', error.code ?? error.message)
    return { ok: false, error: 'contact kaydedilemedi — tekrar deneyin', atomic: false }
  }

  // 2) Legacy (059 onay bekliyor): önce insert (istenirse primary olarak),
  // SONRA diğer primary'ler indirilir — eski primary hiçbir hatada kaybolmaz.
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('contacts')
    .insert({
      lead_id: input.leadId,
      full_name: input.fullName,
      role: input.role,
      email: input.email ?? null,
      phone: input.phone ?? null,
      linkedin_url: input.linkedinUrl ?? null,
      source: input.source,
      notes: input.notes ?? null,
      is_primary: input.isPrimary,
    })
    .select('id')
    .single()
  if (insErr || !inserted) {
    if (insErr?.code === '23505') {
      return { ok: false, error: 'bu lead için aynı e-posta zaten kayıtlı', duplicate: true, atomic: false }
    }
    return { ok: false, error: insErr?.message ?? 'contact kaydedilemedi', atomic: false }
  }
  if (input.isPrimary) {
    const { error: demoteErr } = await supabaseAdmin
      .from('contacts')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('lead_id', input.leadId)
      .eq('is_primary', true)
      .neq('id', inserted.id)
    if (demoteErr) {
      // Yeni kayıt primary OLDU; eskiler indirilemedi → geçici çift-primary
      // (resolver deterministik: en yeni kazanır). Görünür log.
      console.error('[contacts] legacy demote hatası (geçici çift-primary)', demoteErr.code ?? demoteErr.message)
    }
  }
  return { ok: true, id: inserted.id as string, atomic: false }
}

export async function setPrimaryContact(leadId: string, contactId: string): Promise<ContactResult> {
  const { data, error } = await supabaseAdmin.rpc('set_primary_contact', {
    p_lead_id: leadId,
    p_contact_id: contactId,
  })
  if (!error) {
    const r = data as { outcome: string; error?: string }
    if (r.outcome === 'ok') return { ok: true, id: contactId, atomic: true }
    return { ok: false, error: r.error ?? 'reddedildi', atomic: true }
  }
  if (!RPC_MISSING.has(error.code ?? '')) {
    console.error('[contacts] set_primary_contact hatası', error.code ?? error.message)
    return { ok: false, error: 'primary devri başarısız — tekrar deneyin', atomic: false }
  }

  // Legacy: sahiplik doğrula → HEDEFİ önce primary yap → diğerlerini indir.
  const { data: target, error: tErr } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('id', contactId)
    .eq('lead_id', leadId)
    .maybeSingle()
  if (tErr || !target) return { ok: false, error: 'contact bu lead\'e ait değil', atomic: false }

  const { error: promoteErr } = await supabaseAdmin
    .from('contacts')
    .update({ is_primary: true, updated_at: new Date().toISOString() })
    .eq('id', contactId)
  if (promoteErr) return { ok: false, error: promoteErr.message, atomic: false }
  const { error: demoteErr } = await supabaseAdmin
    .from('contacts')
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('is_primary', true)
    .neq('id', contactId)
  if (demoteErr) {
    console.error('[contacts] legacy demote hatası (geçici çift-primary)', demoteErr.code ?? demoteErr.message)
  }
  return { ok: true, id: contactId, atomic: false }
}

// ── Canonical recipient (Faz 2.3) ────────────────────────────────────────────

export interface CanonicalRecipient {
  /** Normalize (lowercase/trim) e-posta; yoksa null → recipient_missing. */
  email: string | null
  /** primary contact üzerinden çözüldüyse contact id; lead.email fallback'te null. */
  contactId: string | null
  contactName: string | null
  source: 'primary_contact' | 'lead_email' | 'none'
}

/**
 * TOPLU çözümleme (Faz 2.4 — kokpit N+1 yerine 2 sorgu). Tek-lead resolver da
 * bunu kullanır: kural TEK yerde. Çift-primary (legacy pencere) durumunda
 * deterministik: EN YENİ primary.
 */
export async function resolveCanonicalRecipients(leadIds: string[]): Promise<Map<string, CanonicalRecipient>> {
  const out = new Map<string, CanonicalRecipient>()
  const ids = [...new Set(leadIds)].filter(Boolean)
  if (ids.length === 0) return out

  const [primariesQ, leadsQ] = await Promise.all([
    supabaseAdmin
      .from('contacts')
      .select('id, lead_id, full_name, email, created_at')
      .in('lead_id', ids)
      .eq('is_primary', true)
      .not('email', 'is', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('leads').select('id, email').in('id', ids),
  ])
  // Faz 4.7: sorgu hatası SAHTE 'recipient_missing' üretmesin — hata üste taşınır
  // (panel error olarak görünür; boş-durum yalnız GERÇEK boşlukta).
  if (primariesQ.error) throw new Error(`contacts okunamadı: ${primariesQ.error.message}`)
  if (leadsQ.error) throw new Error(`leads okunamadı: ${leadsQ.error.message}`)
  const primaries = primariesQ.data
  const leads = leadsQ.data

  const primaryByLead = new Map<string, { id: string; full_name: string | null; email: string }>()
  for (const p of primaries ?? []) {
    const key = p.lead_id as string
    if (!primaryByLead.has(key)) {
      // created_at desc sıralı → ilk görülen en yeni primary.
      primaryByLead.set(key, { id: p.id as string, full_name: (p.full_name as string) ?? null, email: String(p.email) })
    }
  }
  const leadEmail = new Map<string, string | null>()
  for (const l of leads ?? []) leadEmail.set(l.id as string, (l.email as string) ?? null)

  for (const id of ids) {
    const p = primaryByLead.get(id)
    if (p) {
      out.set(id, {
        email: p.email.trim().toLowerCase(),
        contactId: p.id,
        contactName: p.full_name,
        source: 'primary_contact',
      })
      continue
    }
    const le = leadEmail.get(id)
    if (le) {
      out.set(id, { email: le.trim().toLowerCase(), contactId: null, contactName: null, source: 'lead_email' })
      continue
    }
    out.set(id, { email: null, contactId: null, contactName: null, source: 'none' })
  }
  return out
}

/** Sıra: primary contact email → lead.email fallback (toplu çözücünün tek-lead hâli). */
export async function resolveCanonicalRecipient(leadId: string): Promise<CanonicalRecipient> {
  const map = await resolveCanonicalRecipients([leadId])
  return map.get(leadId) ?? { email: null, contactId: null, contactName: null, source: 'none' }
}
