import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// E2E test-DB env çözümü (Faz 7.1 — audit residual #1).
//
// KURAL: E2E suite CANLI App DB'ye YAZAMAZ. Ayrı bir Supabase branch/test
// projesi ZORUNLUDUR ve E2E_* anahtarlarıyla verilir:
//   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY
// (process.env veya .env.local — ama .env.local'dan YALNIZ E2E_* anahtarları
// okunur; production SUPABASE_SERVICE_ROLE_KEY'e sessiz fallback YOKTUR.)

/** Production App DB project ref — E2E buna İŞARET EDEMEZ (fail-fast). */
export const PROD_APP_DB_REF = 'dfedehslshfyqurudwgk'

const E2E_KEYS = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY'] as const

function readEnvLocalE2EOnly(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    // cwd = repo kökü (playwright da vitest de kökten koşar).
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8').replace(/^﻿/, '')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && (E2E_KEYS as readonly string[]).includes(m[1])) out[m[1]] = m[2].trim()
    }
  } catch {
    // .env.local yoksa yalnız process.env kullanılır
  }
  return out
}

export interface E2EDbEnv {
  url: string
  anonKey: string
  serviceRoleKey: string
  projectRef: string
}

export function extractProjectRef(url: string): string | null {
  const m = url.match(/^https?:\/\/([a-z0-9]{16,24})\.supabase\.(co|in|red)/i)
  return m ? m[1].toLowerCase() : null
}

/** E2E DB env'ini çözer ve iki koşulu ZORLAR:
 *  1. Üç E2E_* anahtarı da mevcut (yoksa suite fail-fast).
 *  2. Test DB ref'i production App DB ref'i DEĞİL (yanlışlıkla prod'a
 *     işaret eden env → fail-fast; sessiz prod yazımı yapısal imkânsız). */
export function resolveE2EDbEnv(): E2EDbEnv {
  const fileEnv = readEnvLocalE2EOnly()
  const get = (k: (typeof E2E_KEYS)[number]) => process.env[k] ?? fileEnv[k]

  const url = get('E2E_SUPABASE_URL')
  const anonKey = get('E2E_SUPABASE_ANON_KEY')
  const serviceRoleKey = get('E2E_SUPABASE_SERVICE_ROLE_KEY')

  const missing = E2E_KEYS.filter((k) => !get(k))
  if (missing.length > 0) {
    throw new Error(
      `E2E test DB env eksik: ${missing.join(', ')}. ` +
        'E2E suite canlı App DB üzerinde ÇALIŞTIRILMAZ — ayrı Supabase branch/test projesi ' +
        'oluşturup E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY / E2E_SUPABASE_SERVICE_ROLE_KEY verin.'
    )
  }

  const projectRef = extractProjectRef(url!)
  if (!projectRef) {
    throw new Error(`E2E_SUPABASE_URL geçersiz görünüyor (project ref çıkarılamadı): host beklenen desen *.supabase.co`)
  }
  if (projectRef === PROD_APP_DB_REF) {
    throw new Error(
      `E2E_SUPABASE_URL production App DB'ye (${PROD_APP_DB_REF}) işaret ediyor — REDDEDİLDİ. ` +
        "Test DB ref'i production ref ile aynı olamaz."
    )
  }

  return { url: url!, anonKey: anonKey!, serviceRoleKey: serviceRoleKey!, projectRef }
}
