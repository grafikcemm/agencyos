#!/usr/bin/env node
/**
 * Seed knowledge_docs — upload local knowledge/*.md into the knowledge_docs
 * table (migration 004) so they serve on Vercel without being committed to git.
 *
 * Uses PostgREST via fetch (no @supabase/supabase-js) to avoid the realtime
 * WebSocket init that fails on Node < 22.
 *
 * Run migration 004 in the Supabase SQL Editor first, then:
 *   npm run knowledge:seed
 */

const { readFileSync, existsSync } = require('fs')
const { join } = require('path')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

// key (filename) -> human label. Mirrors the list in src/app/(os)/bilgi/page.tsx.
const DOCS = [
  { key: '00_GRAFIKCEM_CONTEXT.md', label: 'Grafikcem Bağlamı' },
  { key: 'USER_PROFILE.md', label: 'Kullanıcı Profili' },
  { key: 'BUSINESS_MODEL.md', label: 'İş Modeli' },
  { key: 'GRAFIKCEM_BRAND.md', label: 'Marka Kimliği' },
  { key: 'PRICING_RULES.md', label: 'Fiyatlandırma Kuralları' },
  { key: 'SALES_FRAMEWORK.md', label: 'Satış Çerçevesi' },
  { key: 'TOOL_STACK.md', label: 'Araç Seti' },
  { key: 'SYSTEMS_CONTEXT.md', label: 'Sistem Bağlamı' },
  { key: 'INSTAGRAM_CONTEXT.md', label: 'Instagram Bağlamı' },
  { key: 'PROMPT_STYLE_GUIDE.md', label: 'Prompt Stil Rehberi' },
  { key: 'TURKEY_STRATEGY_MUSE.md', label: 'Türkiye Stratejisi' },
  { key: 'LIFE_GOALS.md', label: 'Yaşam Hedefleri' },
]

async function main() {
  const knowledgeDir = join(process.cwd(), 'knowledge')
  const rows = []

  for (const doc of DOCS) {
    const path = join(knowledgeDir, doc.key)
    if (!existsSync(path)) {
      console.warn(`SKIP (missing on disk): ${doc.key}`)
      continue
    }
    const content = readFileSync(path, 'utf-8')
    rows.push({ key: doc.key, label: doc.label, content, updated_at: new Date().toISOString() })
  }

  if (rows.length === 0) {
    console.error('No knowledge files found to seed.')
    process.exit(1)
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/knowledge_docs`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`Seed failed (HTTP ${res.status}): ${text}`)
    if (res.status === 404 || /does not exist/i.test(text)) {
      console.error('\nThe knowledge_docs table is missing. Run migration 004 in the')
      console.error('Supabase SQL Editor first: src/lib/migrations/004_knowledge_docs.sql')
    }
    process.exit(1)
  }

  console.log(`Seeded ${rows.length} knowledge docs into knowledge_docs.`)
}

main().catch((err) => {
  console.error('Seed crashed:', err.message)
  process.exit(1)
})
