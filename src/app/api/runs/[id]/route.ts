// GET /api/runs/[id] — run detayı: header + adımlar (run_steps view) + bağımlılık
// kenarları (DAG) + trace span'leri. Faz 4 DAG/trace UI besler. Salt-okuma.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireApiAccess } from '@/lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const { id } = await params

    const [run, steps] = await Promise.all([
      supabaseAdmin.from('runs').select('*').eq('id', id).maybeSingle(),
      supabaseAdmin
        .from('run_steps')
        .select('id, parent_step_id, agent_key, skill_slug, title, status, risk_level, attempts, max_attempts, created_at')
        .eq('run_id', id)
        .order('created_at', { ascending: true }),
    ])
    if (!run.data) return NextResponse.json({ success: false, error: 'run bulunamadı' }, { status: 404 })

    const stepIds = (steps.data ?? []).map((s) => s.id)
    // Bağımlılık kenarları + span'ler (tablolar uygulanmamışsa yumuşak-boş).
    const [deps, spans] = await Promise.all([
      stepIds.length
        ? supabaseAdmin.from('run_step_dependencies').select('step_id, depends_on_step_id').in('step_id', stepIds)
        : Promise.resolve({ data: [] as { step_id: string; depends_on_step_id: string }[] }),
      supabaseAdmin
        .from('run_spans')
        .select('id, step_id, name, kind, status, duration_ms, tokens_in, tokens_out, cost_usd, created_at')
        .eq('run_id', id)
        .order('created_at', { ascending: true }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        run: run.data,
        steps: steps.data ?? [],
        edges: deps.data ?? [],
        spans: spans.data ?? [],
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
