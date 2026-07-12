// POST /api/jobs/[id]/draft — operatörün belirli bir ilan için başvuru taslağı
// üretimini tetiklemesi. Kullanıcı-tetikli tek taslak olduğundan SENKRON çalışır:
// job_writer task'i ekler, runTask ile inline LLM çağrısını yapar (pipeline taslağı
// job_application_drafts'a yazar), sonra üretilen taslağı döndürür. Böylece UI taslağı
// anında gösterir (cron/agent-tick'i beklemeden).
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'
import { runTask, type AgentTask } from '@/lib/agents/runner'

// LLM çağrısı birkaç saniye sürebilir — serverless timeout'u yükselt.
export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

    const { data: listing, error: listingErr } = await supabaseAdmin
      .from('job_listings')
      .select('id, title, legitimacy')
      .eq('id', id)
      .maybeSingle<{ id: string; title: string; legitimacy: string | null }>()
    if (listingErr) throw listingErr
    if (!listing) return NextResponse.json({ error: 'İlan bulunamadı' }, { status: 404 })
    // Güvenlik kapısı: şüpheli (scam) ilana manuel de olsa taslak üretme.
    if (listing.legitimacy === 'suspicious') {
      return NextResponse.json(
        { error: 'Bu ilan şüpheli işaretlendi; taslak üretilmez.' },
        { status: 422 },
      )
    }

    // job_writer task'ini ekle ve satırı geri al (runTask DB satırı bekler).
    const { data: taskRow, error: taskErr } = await supabaseAdmin
      .from('agent_tasks')
      .insert({
        agent_key: 'job_writer',
        title: `Başvuru taslağı (manuel) — ${listing.title}`.slice(0, 200),
        input: { listing_id: id },
        status: 'queued',
        directive_id: null,
      })
      .select('id, directive_id, agent_key, title, input, status')
      .single<AgentTask>()
    if (taskErr) throw taskErr

    // Inline senkron çalıştır: LLM → handleJobTaskResult taslağı yazar + listing'i 'drafted' yapar.
    const result = await runTask(taskRow)
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error ?? 'Taslak üretilemedi' },
        { status: 502 },
      )
    }

    // Pipeline'ın yazdığı en yeni taslağı çek ve döndür.
    const { data: draft } = await supabaseAdmin
      .from('job_application_drafts')
      .select('id, lang, subject, body, created_at')
      .eq('listing_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!draft) {
      // LLM gövde üretemedi (pipeline boş gövdede yazmaz) — kullanıcıya bildir.
      return NextResponse.json(
        { success: false, error: 'Model taslak üretemedi, tekrar deneyin.' },
        { status: 502 },
      )
    }

    return NextResponse.json({ success: true, draft })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
