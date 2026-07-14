// GET|POST /api/cron/enrichment — recipient + evidence enrichment (Faz 4).
//
// SHADOW MODE varsayılan: ENRICHMENT_ENABLED !== 'true' → hiçbir provider/DB
// mutasyonu yok, {shadow:true} döner (açılış ayrı karar).
//
// Fake mode (E2E): ENRICHMENT_FAKE='body' + APOLLO_API_KEY BOŞ → kişi/kanıt
// KAYNAKLARI istek gövdesinden gelir (dış web/Apollo çağrısı yapısal yok);
// selectCandidates/persist GERÇEK DB (seed→enrich→ready kanıtı). Gerçek Apollo
// yapılandırılmışsa fake YOK SAYILIR (CRITICAL log + 409).
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { runEnrichment, type FoundContact, type FoundEvidence } from '@/lib/enrichment/enrichmentOrchestrator'
import { buildEnrichmentDeps, buildFakeProviderDeps } from '@/lib/enrichment/enrichmentRunner'

export const maxDuration = 300

const DEFAULT_MAX_LEADS = 8
const DEFAULT_MAX_APOLLO = 5

const FoundContactSchema = z.object({
  fullName: z.string().min(1).max(200),
  role: z.string().min(1).max(40),
  email: z.string().max(320),
  source: z.enum(['apollo', 'website']),
  confidence: z.number().min(0).max(1),
  fetchedAt: z.string().max(40),
})
const FoundEvidenceSchema = z.object({
  kind: z.string().min(1).max(60),
  source: z.string().min(1).max(60),
  url: z.string().max(2000).nullable(),
  summary: z.string().max(4000),
  verified: z.boolean(),
  confidence: z.number().min(0).max(1),
  fetchedAt: z.string().max(40),
})
const FakeBodySchema = z
  .object({
    contacts: z.record(z.string(), z.array(FoundContactSchema).max(10)).default({}),
    evidence: z.record(z.string(), z.array(FoundEvidenceSchema).max(20)).default({}),
    maxLeads: z.number().int().min(1).max(50).optional(),
    maxApolloCalls: z.number().int().min(0).max(50).optional(),
  })
  .strict()

async function handle(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET missing' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (process.env.ENRICHMENT_ENABLED !== 'true') {
    return NextResponse.json({
      shadow: true,
      enabled: false,
      message: 'ENRICHMENT_ENABLED=true değil — enrichment shadow modda (mutasyon yok).',
    })
  }

  const caps = {
    maxLeads: Number(process.env.ENRICHMENT_MAX_LEADS) || DEFAULT_MAX_LEADS,
    maxApolloCalls: Number(process.env.ENRICHMENT_MAX_APOLLO) || DEFAULT_MAX_APOLLO,
  }

  if (process.env.ENRICHMENT_FAKE === 'body') {
    if (process.env.APOLLO_API_KEY) {
      console.error('[enrichment] CRITICAL: ENRICHMENT_FAKE set ama APOLLO_API_KEY dolu — fake YOK SAYILDI')
      return NextResponse.json({ success: false, error: 'fake enrichment gerçek Apollo ortamında kullanılamaz' }, { status: 409 })
    }
    let parsed: z.infer<typeof FakeBodySchema>
    try {
      parsed = FakeBodySchema.parse(await req.json())
    } catch {
      return NextResponse.json({ success: false, error: 'fake gövde şeması geçersiz' }, { status: 400 })
    }
    const deps = buildFakeProviderDeps({
      contacts: parsed.contacts as Record<string, FoundContact[]>,
      evidence: parsed.evidence as Record<string, FoundEvidence[]>,
    })
    const summary = await runEnrichment(deps, {
      maxLeads: parsed.maxLeads ?? caps.maxLeads,
      maxApolloCalls: parsed.maxApolloCalls ?? caps.maxApolloCalls,
    })
    return NextResponse.json({ success: true, mode: 'fake', summary })
  }

  const summary = await runEnrichment(buildEnrichmentDeps(), caps)
  return NextResponse.json({ success: true, mode: 'real', summary })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
