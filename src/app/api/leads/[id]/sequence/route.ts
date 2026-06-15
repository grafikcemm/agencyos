// POST /api/leads/[id]/sequence — lead için gün-bazlı çok-kanallı sekans planlar.
// MANUEL-GÖNDER: her adım due_at'inde hatırlatma görevine döner; gönderimi operatör yapar.
// GET — lead için önerilen plan + kanal matrisini önizler (planlamadan).
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { scheduleMultiChannelSequence } from '@/lib/outreach/sequences'
import { buildMultiChannelPlan, inferCustomerType, CHANNEL_PRIORITY } from '@/lib/outreach/channelMatrix'

async function loadType(id: string) {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('sector, has_ecommerce, instagram_as_site')
    .eq('id', id)
    .maybeSingle<{ sector: string | null; has_ecommerce: boolean | null; instagram_as_site: boolean | null }>()
  return inferCustomerType({
    sector: data?.sector,
    hasEcommerce: data?.has_ecommerce,
    instagramAsSite: data?.instagram_as_site,
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const customerType = await loadType(id)
    return NextResponse.json({
      success: true,
      customerType,
      channelPriority: CHANNEL_PRIORITY[customerType],
      plan: buildMultiChannelPlan(customerType),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const customerType = await loadType(id)
    const result = await scheduleMultiChannelSequence({ leadId: id, customerType })

    return NextResponse.json({ success: true, customerType, ...result })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
