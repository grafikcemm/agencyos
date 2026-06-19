// Offline bilgi indexer — terapötik PDF manüellerini chunk'layıp Gemini ile embed eder,
// src/data/knowledgeIndex.json üretir (runtime semantik RAG bunu kullanır).
//
// LOKAL çalışır (Cem'in makinesinde): node scripts/build-knowledge-index.mjs
// Gizlilik: yalnız YAYINLANMIŞ manüeller indexlenir; kişisel "Hakkımda" dosyası ATLANIR.
import { createRequire } from 'module'
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join, extname, basename } from 'path'

const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

async function extractPdfText(buf) {
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const res = await parser.getText()
    return (res && (res.text ?? res.content)) || ''
  } finally {
    try { await parser.destroy() } catch { /* ignore */ }
  }
}

const PDF_DIR = 'C:/Users/alice/Desktop/Grafikcem/Psikoloji & Terapi Belgeler'
const OUT = 'src/data/knowledgeIndex.json'
const MODEL = 'gemini-embedding-001'
const DIM = 768
const CHUNK_CHARS = 1200
const MAX_CHUNKS_PER_DOC = 40
const MAX_TOTAL_CHUNKS = 600
const CONCURRENCY = 5
// Kişisel/hassas dosyalar — indexleme (yalnız yayınlanmış literatür).
const SKIP = [/hakk[ıi]mda/i]

function getKey() {
  const env = readFileSync('.env.local', 'utf8')
  const m = env.match(/^GOOGLE_GEMINI_API_KEY=(.*)$/m)
  return m ? m[1].trim().replace(/^"|"$/g, '') : ''
}

function chunkText(text) {
  const clean = text.replace(/\r/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim()
  if (clean.length < 60) return []
  const chunks = []
  let pos = 0
  while (pos < clean.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    let end = Math.min(pos + CHUNK_CHARS, clean.length)
    if (end < clean.length) {
      // Cümle/satır/boşluk sınırında kır (pencerenin ikinci yarısında).
      const slice = clean.slice(pos, end)
      const brk = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'), slice.lastIndexOf(' '))
      if (brk > CHUNK_CHARS * 0.5) end = pos + brk + 1
    }
    const c = clean.slice(pos, end).trim()
    if (c.length > 60) chunks.push(c)
    pos = end
  }
  return chunks
}

async function embed(key, text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { parts: [{ text: text.slice(0, 8000) }] }, outputDimensionality: DIM }),
        },
      )
      if (res.ok) {
        const j = await res.json()
        const v = j?.embedding?.values
        if (Array.isArray(v)) return v.map((x) => Math.round(x * 1e5) / 1e5)
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 800))
  }
  return null
}

async function main() {
  const key = getKey()
  if (!key) { console.error('GOOGLE_GEMINI_API_KEY yok'); process.exit(1) }

  const files = readdirSync(PDF_DIR).filter(
    (f) => extname(f).toLowerCase() === '.pdf' && !SKIP.some((re) => re.test(f)),
  )
  console.log(`${files.length} PDF bulundu`)

  // 1) Tüm chunk'ları topla
  const pending = []
  for (const f of files) {
    if (pending.length >= MAX_TOTAL_CHUNKS) break
    try {
      const buf = readFileSync(join(PDF_DIR, f))
      const text = await extractPdfText(buf)
      const chunks = chunkText(text || '')
      const source = basename(f, '.pdf')
      for (const c of chunks) {
        if (pending.length >= MAX_TOTAL_CHUNKS) break
        pending.push({ source, content: c })
      }
      console.log(`  ${f}: ${chunks.length} chunk (toplam ${pending.length})`)
    } catch (e) {
      console.warn(`  ${f} atlandı: ${e.message}`)
    }
  }

  // 2) Concurrency havuzuyla embed et
  const out = []
  let i = 0
  async function worker() {
    while (i < pending.length) {
      const idx = i++
      const item = pending[idx]
      const v = await embed(key, item.content)
      if (v) out.push({ source: item.source, content: item.content, embedding: v })
      if (idx % 25 === 0) console.log(`  embed ${idx}/${pending.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  writeFileSync(OUT, JSON.stringify(out))
  console.log(`✓ ${out.length} chunk yazıldı → ${OUT}`)
}

main()
