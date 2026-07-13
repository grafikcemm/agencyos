// PATCH/DELETE /api/leads/[id]/contacts/[contactId] — contact güncelle/sil (Faz 2.1).
// isPrimary:true → transaction'lı primary devri (mig 059 RPC; yoksa legacy görünür).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceSameOrigin, parseJsonBody, BadRequestError } from '@/lib/api/guards'
import { requireApiUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { setPrimaryContact } from '@/lib/contacts/contactService'

const PatchSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    role: z.enum(['owner', 'cto', 'cfo', 'marketing', 'operations', 'other']).optional(),
    email: z.string().email().max(200).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    linkedinUrl: z.string().url().max(300).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    isPrimary: z.literal(true).optional(), // primary yalnız devirle değişir (false yapmak belirsiz bırakır)
  })
  .strict()

async function guard(req: Request) {
  const auth = await requireApiUser(req)
  if ('response' in auth) return auth.response
  return enforceSameOrigin(req)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; contactId: string }> }) {
  try {
    const guardErr = await guard(req)
    if (guardErr) return guardErr
    const { id, contactId } = await ctx.params
    const body = await parseJsonBody(req, PatchSchema)

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.fullName !== undefined) patch.full_name = body.fullName
    if (body.role !== undefined) patch.role = body.role
    if (body.email !== undefined) patch.email = body.email
    if (body.phone !== undefined) patch.phone = body.phone
    if (body.linkedinUrl !== undefined) patch.linkedin_url = body.linkedinUrl
    if (body.notes !== undefined) patch.notes = body.notes

    if (Object.keys(patch).length > 1) {
      const { data, error } = await supabaseAdmin
        .from('contacts')
        .update(patch)
        .eq('id', contactId)
        .eq('lead_id', id) // sahiplik: başka lead'in contact'ı değiştirilemez
        .select('id')
      if (error) {
        const status = error.code === '23505' ? 409 : 500
        return NextResponse.json({ error: error.message }, { status })
      }
      if (!data?.length) return NextResponse.json({ error: 'contact bulunamadı' }, { status: 404 })
    }

    let atomic: boolean | undefined
    if (body.isPrimary) {
      const r = await setPrimaryContact(id, contactId)
      if (!r.ok) return NextResponse.json({ error: r.error, atomic: r.atomic }, { status: 409 })
      atomic = r.atomic
    }
    return NextResponse.json({ ok: true, atomic })
  } catch (err) {
    if (err instanceof BadRequestError) return NextResponse.json({ error: err.message }, { status: 400 })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sunucu hatası' }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; contactId: string }> }) {
  try {
    const guardErr = await guard(req)
    if (guardErr) return guardErr
    const { id, contactId } = await ctx.params
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('id', contactId)
      .eq('lead_id', id)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'contact bulunamadı' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sunucu hatası' }, { status: 500 })
  }
}
