/**
 * Tek seferlik, ticari olmayan Gmail transport canary'si.
 *
 * Bu betik AgencyOS'un müşteri gönderim makinesini bilerek kullanmaz: hukuki
 * uyum kapısını veya HITL onayını gevşetmeden yalnız OAuth → Vault → Gmail REST
 * hattını doğrular. Çalışması için iki açık operatör onayı gerekir:
 *   GMAIL_CANARY_RECIPIENT=<operatöre ait test adresi>
 *   GMAIL_CANARY_CONFIRM=SEND_TECHNICAL_CANARY
 *
 * Sabit RFC Message-ID önce aranır; aynı canary otomatik olarak tekrar
 * gönderilmez. Token, ham mesaj ve alıcı adresi çıktıya yazılmaz.
 */
import { loadEnvConfig } from '@next/env'

async function main(): Promise<void> {
  loadEnvConfig(process.cwd(), false)

  const recipient = process.env.GMAIL_CANARY_RECIPIENT?.trim().toLowerCase() ?? ''
  if (!recipient || !recipient.includes('@')) {
    throw new Error('GMAIL_CANARY_RECIPIENT geçerli bir operatör test adresi olmalı')
  }
  if (process.env.GMAIL_CANARY_CONFIRM !== 'SEND_TECHNICAL_CANARY') {
    throw new Error('Açık canary onayı eksik: GMAIL_CANARY_CONFIRM')
  }

  const { runTechnicalGmailCanary } = await import('../src/lib/gmail/technicalCanary')
  const result = await runTechnicalGmailCanary(recipient)
  process.stdout.write(JSON.stringify(result))
}

void main().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'Error'
  const detail = (error instanceof Error ? error.message : 'unknown')
    .replace(/[^\s"<>@]+@[^\s"<>@]+/g, '<redacted-email>')
    .slice(0, 240)
  process.stderr.write(JSON.stringify({ ok: false, errorClass: name, detail }))
  process.exitCode = 1
})
