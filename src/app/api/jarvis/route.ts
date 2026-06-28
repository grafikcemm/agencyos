import { requireApiAccess } from '@/lib/auth'
import { runJarvis } from '@/lib/jarvis/engine'

// Tüm araç-çağıran mantık @/lib/jarvis/engine.ts'te (web + Telegram ortak kullanır).
export async function POST(req: Request) {
  try {
    const access = await requireApiAccess(req)
    if ('response' in access) return access.response
    const { message } = await req.json()
    if (!message) return Response.json({ error: 'message gerekli' }, { status: 400 })

    const result = await runJarvis(message)
    return Response.json({
      reply: result.reply,
      actions: result.actions,
      tool_calls: result.toolCalls,
      tool_count: result.toolCalls.length,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('JARVIS v3 error:', msg)
    return Response.json({ reply: `// SİSTEM HATASI: ${msg}` }, { status: 500 })
  }
}
