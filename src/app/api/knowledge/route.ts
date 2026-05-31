import { NextResponse } from 'next/server'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const file = searchParams.get('file')
  const list = searchParams.get('list')

  if (list === 'sessions') {
    const sessionsDir = join(process.cwd(), 'knowledge', 'sessions')
    if (!existsSync(sessionsDir)) return NextResponse.json({ files: [] })
    try {
      const files = readdirSync(sessionsDir).filter(f => f.endsWith('.md')).sort()
      return NextResponse.json({ files })
    } catch {
      return NextResponse.json({ files: [] })
    }
  }

  if (file) {
    // Strip path separators to prevent traversal — only allow flat filenames
    const safeName = file.replace(/[/\\]/g, '')
    const filePath = join(process.cwd(), 'knowledge', safeName)
    if (!existsSync(filePath)) return NextResponse.json({ content: '' }, { status: 404 })
    try {
      const content = readFileSync(filePath, 'utf-8')
      return NextResponse.json({ content })
    } catch {
      return NextResponse.json({ content: '' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'file veya list parametresi gerekli' }, { status: 400 })
}
