import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Drift guard: src/ içinde okunan her process.env.X anahtarı .env.example'da
// belgelenmiş olmalı. Aksi halde yeni ortam kuranlar eksik anahtarı fark edemez.
// Platform/runtime tarafından sağlanan değişkenler bilinçli olarak hariç tutulur.
const PLATFORM_SKIP = new Set([
  'NODE_ENV',
  'TEMP',
  'TMP',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'CI',
  'PORT',
])

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      collectFiles(full, acc)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      // Test dosyalarını atla: örnek env anahtarları/yorumları gerçek kullanım değil.
      acc.push(full)
    }
  }
  return acc
}

function envKeysReferencedInSrc(): Set<string> {
  const keys = new Set<string>()
  // process.env.FOO  ve  process.env["FOO"] / process.env['FOO']
  const dotRe = /process\.env\.([A-Z0-9_]+)/g
  const bracketRe = /process\.env\[\s*['"]([A-Z0-9_]+)['"]\s*\]/g
  for (const file of collectFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(dotRe)) keys.add(m[1])
    for (const m of text.matchAll(bracketRe)) keys.add(m[1])
  }
  return keys
}

function envKeysDocumented(): Set<string> {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8')
  const keys = new Set<string>()
  // Hem aktif (KEY=...) hem yorumlu legacy alias (# KEY=...) satırlarını say.
  const re = /^\s*#?\s*([A-Z0-9_]+)\s*=/gm
  for (const m of text.matchAll(re)) keys.add(m[1])
  return keys
}

describe('.env.example drift guard', () => {
  it('every process.env key used in src/ is documented in .env.example', () => {
    const used = envKeysReferencedInSrc()
    const documented = envKeysDocumented()
    const missing = [...used].filter(
      (k) => !documented.has(k) && !PLATFORM_SKIP.has(k),
    )
    expect(
      missing,
      `Undocumented env keys (add to .env.example or PLATFORM_SKIP): ${missing.join(', ')}`,
    ).toEqual([])
  })
})
