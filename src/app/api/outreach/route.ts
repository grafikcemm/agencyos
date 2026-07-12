// GET|POST /api/outreach
// GET: list outreach messages (optional status/leadId/limit filters).
// POST: create a DRAFT outreach message. Status is ALWAYS forced to 'draft' here —
// approval and sending happen only via /api/outreach/send (operator session).
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

const VALID_CHANNELS = ['email', 'whatsapp', 'instagram']

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const leadId = searchParams.get('leadId')
    const limit = Number(searchParams.get('limit')) || 100

    let query = supabaseAdmin
      .from('outreach_messages')
      .select('id, lead_id, channel, status, subject, body, sequence_step, scheduled_at, sent_at, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)
    if (leadId) query = query.eq('lead_id', leadId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ messages: data ?? [] })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const body = await req.json()
    const { lead_id, channel, subject, body: messageBody, sequence_step, created_by } = body

    if (!lead_id || !messageBody) {
      return NextResponse.json({ error: 'lead_id ve body zorunludur.' }, { status: 400 })
    }

    if (!VALID_CHANNELS.includes(channel)) {
      return NextResponse.json({ error: "Geçersiz kanal. 'email', 'whatsapp' veya 'instagram' olmalı." }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('outreach_messages')
      .insert({
        lead_id,
        channel,
        subject: subject ?? null,
        body: messageBody,
        sequence_step: sequence_step ?? 0,
        created_by: created_by ?? 'operator',
        status: 'draft', // forced — never settable via this endpoint
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ message: data }, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
