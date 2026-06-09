import 'server-only'
import type { JobHttp } from './types'

// Provider'lara enjekte edilen HTTP istemcisi. Timeout (AbortController) + JSON/text
// ayrıştırma. redirect:'error' SSRF'i önler (provider host-allowlist'i ile birlikte).
const DEFAULT_TIMEOUT_MS = 10_000

async function request(
  url: string,
  opts?: { timeoutMs?: number; redirect?: RequestRedirect },
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: opts?.redirect ?? 'follow',
      headers: { accept: 'application/json, text/plain, */*' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

export const jobHttp: JobHttp = {
  async fetchJson(url, opts) {
    const res = await request(url, opts)
    return res.json()
  },
  async fetchText(url, opts) {
    const res = await request(url, opts)
    return res.text()
  },
}
