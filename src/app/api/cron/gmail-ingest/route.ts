// GET|POST /api/cron/gmail-ingest — inbound cevap ingest'i (FINALIZATION Faz 7).
//
// SHADOW MODE varsayılan: GMAIL_INGEST_ENABLED !== 'true' → hiçbir provider
// çağrısı/mutasyon yapılmaz, {shadow:true} döner (pilot açılışı ayrı onay).
//
// Transport seçimi (fail-closed):
// - GMAIL_INGEST_FAKE='body' + GOOGLE_CLIENT_ID BOŞ → istek gövdesindeki fake
//   inbound mesajlar işlenir (E2E; dış çağrı yapısal imkânsız). Gerçek OAuth
//   yapılandırılmış ortamda fake bayrağı YOK SAYILIR (CRITICAL log).
// - aksi hâlde gerçek Gmail REST (tokenVault access token) — yalnız kullanıcı
//   OAuth'u tamamladıysa çalışır; değilse actionable hata.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAccessToken } from '@/lib/gmail/tokenVault'
import {
  ingestInboundReplies,
  type InboundMessage,
  type InboundTransport,
} from '@/lib/gmail/replyIngest'
import { createGmailInboundTransport } from '@/lib/gmail/gmailInboundTransport'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 120

const FakeBodySchema = z
  .object({
    fakeMessages: z
      .array(
        z
          .object({
            gmailMessageId: z.string().min(1).max(128),
            threadId: z.string().max(128).nullable().default(null),
            fromAddress: z.string().max(320).nullable().default(null),
            subject: z.string().max(500).nullable().default(null),
            bodyText: z.string().max(20_000),
            inReplyTo: z.string().max(1000).nullable().default(null),
            references: z.string().max(4000).nullable().default(null),
            internalDateMs: z.number().int().nullable().default(null),
          })
          .strict(),
      )
      .max(25),
  })
  .strict()

async function handle(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET missing' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // SHADOW MODE: bayrak açılmadan ingest ÇALIŞMAZ (pilot ayrı onay).
  if (process.env.GMAIL_INGEST_ENABLED !== 'true') {
    return NextResponse.json({
      shadow: true,
      enabled: false,
      message: 'GMAIL_INGEST_ENABLED=true değil — ingest shadow modda (mutasyon/provider çağrısı yok).',
    })
  }

  let transport: InboundTransport
  if (process.env.GMAIL_INGEST_FAKE === 'body') {
    if (process.env.GOOGLE_CLIENT_ID) {
      console.error('[gmail-ingest] CRITICAL: GMAIL_INGEST_FAKE set ama gerçek OAuth env dolu — fake YOK SAYILDI')
      return NextResponse.json({ success: false, error: 'fake transport gerçek OAuth ortamında kullanılamaz' }, { status: 409 })
    }
    let parsed: z.infer<typeof FakeBodySchema>
    try {
      parsed = FakeBodySchema.parse(await req.json())
    } catch {
      return NextResponse.json({ success: false, error: 'fake gövde şeması geçersiz' }, { status: 400 })
    }
    const messages: InboundMessage[] = parsed.fakeMessages
    // Fake: cursor ilerletmez (nextHistoryId null); advanceCursor yok.
    transport = { kind: 'fake', listInbound: async () => ({ messages, nextHistoryId: null }) }
  } else {
    const token = await getAccessToken()
    if (!token.ok) {
      return NextResponse.json({ success: false, error: token.error }, { status: 503 })
    }
    transport = createGmailInboundTransport(
      { id: token.account.id, lastHistoryId: token.account.last_history_id },
      token.accessToken,
    )
  }

  const counters = await ingestInboundReplies(transport)
  // Health/readiness heartbeat yalnız GERÇEK provider turu tamamen güvenli
  // bittiğinde yazılır. Fake E2E, shadow veya satır hatalı batch pilot kanıtı
  // üretemez. Yazım hatası görünür 500'dür; sistem kendini hazır sanmaz.
  if (transport.kind === 'gmail' && counters.failed === 0) {
    const { error: heartbeatError } = await supabaseAdmin.from('settings').upsert(
      { key: 'gmail_last_ingest_ok', value: new Date().toISOString() },
      { onConflict: 'key' },
    )
    if (heartbeatError) {
      return NextResponse.json(
        { success: false, error: `gmail ingest heartbeat yazılamadı: ${heartbeatError.message}`, counters },
        { status: 500 },
      )
    }
  }
  return NextResponse.json({ success: true, transport: transport.kind, counters })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
