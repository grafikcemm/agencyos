/**
 * Repo içindeki TypeScript betiklerini çalıştırır.
 *
 * NEDEN GEREKLİ
 * Node'un yerleşik tip-soyma özelliği (`--experimental-strip-types`) çalışıyor,
 * ancak Node'un ESM çözümleyicisi uzantısız göreli import kabul etmiyor
 * (`import … from '../leads/domain'`). `src/` altındaki tüm kod Next.js/vitest
 * `moduleResolution: bundler` kuralına göre uzantısız yazılmış durumda ve bunu
 * betikler için değiştirmek 139 test dosyasının kullandığı deseni bozardı.
 *
 * NEDEN esbuild
 * Zaten kurulu (vite/vitest'in bağımlılığı). Yeni paket eklenmez.
 *
 * NEDEN BUNDLE, NEDEN LOADER DEĞİL
 * Bundle tek dosya üretir; çalışma anında çözümleme sürprizi kalmaz. Betikler
 * seyrek çalışır, ~200 ms'lik bundle maliyeti önemsizdir.
 *
 * KULLANIM
 *   node scripts/run-ts.mjs <betik.ts> [betiğe geçecek argümanlar…]
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [entry, ...forwarded] = process.argv.slice(2)

if (!entry) {
  console.error('kullanım: node scripts/run-ts.mjs <betik.ts> [argümanlar…]')
  process.exit(1)
}

// Bundle REPO İÇİNE yazılır, sistem temp'ine değil: `packages: 'external'`
// bıraktığımız node_modules import'ları çalışma anında çözülür ve Node bunu
// yalnız dosyanın bulunduğu ağaçta arar. Temp dizininden çalıştırmak
// "Cannot find package '@supabase/supabase-js'" ile patlar.
const cacheRoot = resolve('node_modules/.cache/agencyos-run-ts')
mkdirSync(cacheRoot, { recursive: true })
const workDir = mkdtempSync(join(cacheRoot, `${basename(entry, '.ts')}-`))
const outfile = join(workDir, 'bundle.mjs')

try {
  await build({
    entryPoints: [resolve(entry)],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    sourcemap: 'inline',
    // node_modules paketleri bundle EDİLMEZ: native bağımlılıklar (supabase-js
    // altındaki ws vb.) bozulmasın ve bundle küçük kalsın.
    packages: 'external',
    // JSON import'ları (araştırma dosyası) bundle içine gömülmez; betik onu
    // diskten okur, böylece dosya değişince yeniden bundle gerekmez.
    loader: { '.json': 'empty' },
    logLevel: 'warning',
  })

  // Argümanları betiğe aktar: process.argv[0]=node, [1]=betik, [2…]=argümanlar
  process.argv = [process.argv[0], resolve(entry), ...forwarded]
  await import(pathToFileURL(outfile).href)
} finally {
  // Betik process.exitCode ayarlamış olabilir; temizlik onu değiştirmez.
  rmSync(workDir, { recursive: true, force: true })
}
