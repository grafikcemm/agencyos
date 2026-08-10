// Kanonik alan adı normalizasyonu — TEK uygulama.
//
// Bu dosya, sistemdeki her yerde aynı sonucu üretmek zorunda:
//   • preflight duplicate raporu        (scripts/seed-research-leads.ts)
//   • mevcut leads.website backfill'i    (migrations/068)
//   • leads.domain_normalized generated column (migrations/068)
//   • seed importer eşleştirmesi         (src/lib/research/seedMapper.ts)
//
// SQL tarafındaki `public.normalize_domain(text)` bu fonksiyonun birebir
// aynadır. İkisinin ayrışması bir VERİ BÜTÜNLÜĞÜ hatasıdır: normalizasyon
// kayarsa aynı şirket iki kez lead olur veya UNIQUE constraint yanlış satırı
// reddeder. Bu yüzden ortak fixture tablosu (DOMAIN_FIXTURES) hem buradaki
// TypeScript testinde hem migration'ın içindeki doğrulama bloğunda koşar.
//
// DEĞİŞTİRİRKEN: fixture'ı güncelle, SQL fonksiyonunu güncelle, ikisini de test et.
// Tek tarafı değiştirmek sessiz duplicate üretir.

/**
 * Serbest metin bir web adresini kanonik host'a indirger.
 *
 * Sıra (SQL aynası ile birebir):
 *   1. trim + lowercase
 *   2. şema at            `https://` `http://` `ftp://` …
 *   3. userinfo at        `user:pass@`
 *   4. yol/query/fragment kes  ilk `/` `?` `#`
 *   5. port at            `:8443`
 *   6. `www.` öneklerinin TAMAMI at (tekrarlı `www.www.` dahil — aksi halde
 *      fonksiyon idempotent olmaz ve aynı site iki ayrı satır olarak kalır)
 *   7. sondaki nokta(lar) at
 *   8. doğrula: en az iki etiket, yalnız `a-z0-9-`, sayısal TLD reddedilir
 *
 * @returns kanonik host, ya da geçerli bir alan adı çıkmıyorsa `null`.
 *          `null` dönmesi bir hata değildir — UNIQUE constraint NULL'ları
 *          çakıştırmaz, yani adres taşımayan kayıtlar birbirini engellemez.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (input == null) return null

  let d = String(input).trim().toLowerCase()
  if (d === '') return null

  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  d = d.replace(/^[^/@]*@/, '')
  d = d.replace(/[/?#].*$/, '')
  d = d.replace(/:[0-9]+$/, '')
  d = d.replace(/^(www\.)+/, '')
  d = d.replace(/\.+$/, '')

  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return null
  // Sayısal son etiket = IP adresi veya bozuk girdi. Şirket alan adı değil.
  if (/\.[0-9]+$/.test(d)) return null

  return d
}

/**
 * TS ve SQL uygulamalarının ayrışmadığını kanıtlayan ortak fixture.
 * `domain.test.ts` bunu doğrudan koşar; `migrations/068_niche_targeting.sql`
 * içindeki doğrulama bloğu aynı çiftleri SQL tarafında koşar.
 */
export const DOMAIN_FIXTURES: ReadonlyArray<readonly [string | null | undefined, string | null]> = [
  // temel
  ['sinoz.com.tr', 'sinoz.com.tr'],
  ['https://www.sinoz.com.tr', 'sinoz.com.tr'],
  ['http://www.adoreoyuncak.com', 'adoreoyuncak.com'],
  ['https://www.bellamaison.com', 'bellamaison.com'],
  // büyük/küçük harf + boşluk
  ['  HTTPS://WWW.Example.COM  ', 'example.com'],
  // yol, query, fragment
  ['https://example.com/tr/urunler?utm_source=x#top', 'example.com'],
  ['example.com/', 'example.com'],
  // port ve userinfo
  ['https://user:pass@example.com:8443/path', 'example.com'],
  // sondaki nokta (kök FQDN)
  ['example.com.', 'example.com'],
  // alt alan adı korunur — farklı pazar/ülke siteleri ayrı hesaptır
  ['https://shop.example.co.uk', 'shop.example.co.uk'],
  // tekrarlı www tamamen ayıklanır — idempotentlik şartı
  ['www.www.example.com', 'example.com'],
  // geçersizler
  [null, null],
  [undefined, null],
  ['', null],
  ['   ', null],
  ['localhost', null],
  ['example', null],
  ['https://192.168.1.10/admin', null],
  ['not a domain', null],
  ['https://', null],
]
