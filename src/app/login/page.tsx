import { LogIn, ShieldCheck } from 'lucide-react'
import PasswordLoginForm, { LoginShell } from './PasswordLoginForm'

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: 'Google girişi iptal edildi. Hazır olduğunda yeniden deneyebilirsin.',
  state_invalid: 'Güvenlik doğrulaması tamamlanamadı. Lütfen yeniden giriş yap.',
  account_not_allowed: 'Yalnızca info@grafikcem.com hesabı bu uygulamaya erişebilir.',
  provider: 'Google hesabı doğrulanamadı. Lütfen tekrar dene.',
  config: 'Google girişi henüz yapılandırılmamış. Sistem yöneticisi ayarları kontrol etmeli.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  if (process.env.E2E_PASSWORD_AUTH === 'true') {
    return <PasswordLoginForm />
  }

  const params = await searchParams
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error
  const error = errorCode ? ERROR_MESSAGES[errorCode] : undefined

  return (
    <LoginShell>
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-3.5 text-center">
          <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-[var(--success)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Parolasız, güvenli giriş</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Yalnızca info@grafikcem.com Google Workspace hesabı kabul edilir.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
            {error}
          </div>
        )}

        <a
          href="/api/auth/google/start"
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-[var(--cta-bg)] py-2.5 text-sm font-semibold text-[var(--cta-fg)] transition-all hover:bg-[#e6e6e6] active:scale-[0.98]"
        >
          <LogIn className="h-4 w-4" />
          Google Workspace ile devam et
        </a>
      </div>
    </LoginShell>
  )
}
