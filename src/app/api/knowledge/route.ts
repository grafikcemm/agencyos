import { NextResponse } from 'next/server'
import { requireApiAccess } from '@/lib/auth'
import { getKnowledgeDoc } from '@/lib/knowledge'

// Serves knowledge docs from the `knowledge_docs` table (migration 004). The
// markdown is no longer on disk — it was git-ignored and never deployed.
export async function GET(req: Request) {
  const access = await requireApiAccess(req)
  if ('response' in access) return access.response
  const { searchParams } = new URL(req.url)
  const file = searchParams.get('file')
  const list = searchParams.get('list')

  // Session logs were a disk-only feature (knowledge/sessions) that never
  // deployed; nothing in the UI consumes this. Return empty for compatibility.
  if (list === 'sessions') {
    return NextResponse.json({ files: [] })
  }

  if (file) {
    const content = await getKnowledgeDoc(file)
    if (!content) return NextResponse.json({ content: '' }, { status: 404 })
    return NextResponse.json({ content })
  }

  return NextResponse.json({ error: 'file veya list parametresi gerekli' }, { status: 400 })
}
