// GET/POST /api/leads/[id]/contacts — lead'in karar-verici kişileri (Faz D, mig 045).
// Rol-aware kişiselleştirmenin veri girişi. Mutasyon: origin + auth + Zod.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { requireApiUser, requireApiAccess } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const ContactSchema = z
  .object({
    fullName: z.string().min(2).max(120),
    role: z.enum(['owner', 'cto', 'cfo', 'marketing', 'operations', 'other']).default('owner'),
    email: z.string().email().max(200).optional(),
    phone: z.string().max(40).optional(),
    linkedinUrl: z.string().url().max(300).optional(),
    source: z.enum(['manual', 'apollo', 'website', 'instagram', 'referral']).default('manual'),
    isPrimary: z.boolean().default(false),
    notes: z.string().max(2000).optional(),
  })
  .strict()

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const { id } = await ctx.params
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('id, full_name, role, email, phone, linkedin_url, source, is_primary, notes, created_at')
      .eq('lead_id', id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) throw error
    return NextResponse.json({ contacts: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(req)
    if ('response' in auth) return auth.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const body = await parseJsonBody(req, ContactSchema)
    const { id } = await ctx.params

    // isPrimary=true → önce diğerlerini indir (tek birincil kişi).
    if (body.isPrimary) {
      await supabaseAdmin.from('contacts').update({ is_primary: false }).eq('lead_id', id)
    }

    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        lead_id: id,
        full_name: body.fullName,
        role: body.role,
        email: body.email ?? null,
        phone: body.phone ?? null,
        linkedin_url: body.linkedinUrl ?? null,
        source: body.source,
        is_primary: body.isPrimary,
        notes: body.notes ?? null,
      })
      .select('id')
      .single()
    if (error) {
      // 23505 = aynı lead+email zaten var (unique index).
      const status = error.code === '23505' ? 409 : 500
      return NextResponse.json({ error: error.message }, { status })
    }
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
  } catch (err) {
    if (err instanceof BadRequestError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
