// POST /api/agents/directive
// Accepts an operator directive (free-text input), runs it through the agent
// orchestrator, and returns the directive result (plan, debrief, task count).
import { NextResponse } from 'next/server'
import { enforceSameOrigin } from '@/lib/api/guards'
import { requireApiAccess } from '@/lib/auth'
import { runDirective } from '@/lib/agents/orchestrator'

export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const originError = enforceSameOrigin(req)
    if (originError) return originError

    const { input } = await req.json()
    if (!input || typeof input !== 'string' || input.trim() === '') {
      return NextResponse.json({ error: 'input gerekli' }, { status: 400 })
    }

    const result = await runDirective(input)
    return NextResponse.json(result, { status: result.status === 'error' ? 500 : 200 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('Directive error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
