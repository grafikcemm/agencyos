// GET /api/registry — skill/agent registry sayaçları. UI "kayıtlı" (kod kataloğu +
// DB satırı) vs "aktif/eval-geçmiş" (DB active=true) ayrımını gösterir (§10.1/§22-6).
// DB tabloları henüz seed edilmemişse yumuşak-0 (kod kataloğu daima gerçek).
import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SKILL_CATALOG } from '@/lib/skills/catalog'
import { validateRegistry } from '@/lib/skills/registry'

async function countRows(table: string, activeOnly: boolean): Promise<number> {
  try {
    let q = supabaseAdmin.from(table).select('*', { count: 'exact', head: true })
    if (activeOnly) q = q.eq('active', true)
    const { count, error } = await q
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

export async function GET(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response

    // Kod kataloğu = benzersizlik-doğrulanmış gerçek kayıtlar (yapay dolgu yok).
    const codeIssues = validateRegistry()
    const teamCounts: Record<string, number> = {}
    for (const s of SKILL_CATALOG) teamCounts[s.team] = (teamCounts[s.team] ?? 0) + 1

    const [dbSkills, activeSkills, dbAgents, activeAgents] = await Promise.all([
      countRows('skills', false),
      countRows('skills', true),
      countRows('agents', false),
      countRows('agents', true),
    ])

    return NextResponse.json({
      success: true,
      data: {
        skills: {
          codeRegistered: SKILL_CATALOG.length,
          dbRegistered: dbSkills,
          active: activeSkills,
          integrityIssues: codeIssues.length,
        },
        agents: { dbRegistered: dbAgents, active: activeAgents },
        teams: teamCounts,
        // Kapasite tavanı (plan §10) — birebir zorunluluk değil, taksonomi hedefi.
        capacity: { agents: 204, skills: 487 },
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Sunucu hatası'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
