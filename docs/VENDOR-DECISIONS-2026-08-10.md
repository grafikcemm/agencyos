# Sağlayıcı kararları — 2026-08-10

Bu belge, AgencyOS'un lead edinim ve outreach yığınına hangi üçüncü tarafların **girdiğini**,
hangilerinin **girmediğini** ve **neden** girmediğini tarihli olarak kaydeder.

Arayüzde hiçbir sağlayıcı, aktif değilken aktifmiş gibi gösterilmez. `registered ≠ active`.

## Bugünkü gerçek runtime

| İş | Sağlayıcı | Nasıl | Durum |
|---|---|---|---|
| İşletme keşfi | Google Places **Legacy** Text Search + Place Details | Doğrudan REST, `GOOGLE_MAPS_KEY` | **Aktif** |
| Karar verici arama | Apollo People Search | Doğrudan REST, `APOLLO_API_KEY` | Aktif (opsiyonel; anahtar yoksa manuel kuyruk) |
| Veri ve durum | Supabase | service-role, yalnız sunucu | Aktif |
| Kontrollü keşif | Apify | Doğrudan REST provider adaptörü | **Kapalı** (`APIFY_ENABLED=false`) |
| Kariyer/iş ilanı | Firecrawl | — | AgencyOS kapsamı değil (bkz. `CAREER-HANDOFF-2026-08-10.md`) |
| Gönderim | Gmail veya Instantly | — | **İkisi de kapalı** (güvenlik/hukuk kapısı) |

**MCP runtime bağımlılığı YOKTUR ve olmayacaktır.** Apify MCP, Notion MCP veya Apollo plugin'i
canlı edinim motorunun sahibi değildir. MCP'ler yalnız geliştirme/ajan etkileşimi için isteğe bağlı
adaptördür. Production sağlayıcıları dar yetkili sunucu-taraflı API katmanından çalışır; tokenlar
tarayıcıya veya ajanlara verilmez.

## Apify — KABUL (kontrollü pilot, kapalı varsayılan)

**Aktör:** `compass/crawler-google-places` — <https://apify.com/compass/crawler-google-places>

Gerekçe: Compass tarafından geliştirilmesi, Apify tarafından bakım görmesi, yüksek kullanım/inceleme
geçmişi, ülke/alan sorguları ve şirket web sitesinden public contact enrichment desteği.
Çok daha ucuz görünen fakat yeni ve az kullanılmış topluluk aktörleri **üretim ana hattına alınmaz**.

Apify **yalnız kontrollü keşif ve public company-contact enrichment katmanıdır; e-posta gönderim
sistemi değildir.**

### Bütçe

Sabit `$29` aylık limit **kaldırıldı**. Kanonik değerler `src/lib/growth/apifyPolicy.ts`:

| Kalem | Değer |
|---|---|
| Toplam kredi | `$25` |
| Aylık operasyon hedefi | `$18` |
| **Sert kesme** | `$22` |
| Dokunulmaz rezerv | `$3` |
| İlk pilot | ≤ 200 place **ve** ≤ `$2` |

### Fiyat varsayımı yapılmaz

Apify vitrinindeki **"from $1.50/1K" iyimser reklam fiyatıdır** ve ücretsiz/Starter plan ile eklenti
olay fiyatlarıyla aynı olmayabilir. Bütçe hesabı resmî yardım sayfasındaki **muhafazakâr** senaryoyla
yapılır: ~`$4–5/1K` temel place, `$1/1K` filtre, `$2/1K` contact enrichment
(<https://help.apify.com/en/articles/10774732-google-maps-scraper-is-going-to-pay-per-event-pricing>).

Koşu **ancak** preflight'ta hesabın güncel gerçek fiyatı okunduktan sonra açılır. Fiyat veya olay
modeli beklenenden farklıysa koşu **fail-closed durur** (`preflightActorPricing`).

### Varsayılan kapalı eklentiler

`reviews` · `images` · `social_profile_enrichment` · `ai_competitor_analysis` ·
`additional_place_details` · `person_leads_multiplier`

Bunlardan biri açıksa koşu kapısı açıkça reddeder. Company contact enrichment yalnız **web sitesi
bulunan** ve AgencyOS'un kendi ICP/kanıt filtresinden **geçmiş** adaylara uygulanır — ücretli
zenginleştirme kendi filtremizden önce çalışmaz.

### Ölçek kararı

Sezgiyle değil ölçümle: relevant-account yield, public-contact yield, doğrulanmış gönderilebilir
e-posta oranı, duplicate oranı, kullanılabilir e-posta başına maliyet.
Eşikler `SCALE_THRESHOLDS`; tutmazsa **kalan kredi harcanmaz**.

Sağlayıcı başarısızlığında veya bütçe bitiminde **otomatik ücretli fallback yoktur**.

## LeadMash — RED (bu finalizasyonda entegre edilmez)

<https://www.leadmash.io/> · iddia: `$3/1K` Apollo lead.

Ucuzdur, fakat:

- Teslimat yolu Apollo search URL'si üzerinden **üçüncü taraf scraping/CSV**'dir; API-first kanıt
  zinciri yoktur.
- Veri tazeliği ve verification şeffaflığı AgencyOS'un provenance gereksinimini karşılamaz.
- Kaynak/ToS/provenance riski taşır.

**Karar:** ana stack'e alınmaz. İleride yalnız **kullanıcı onaylı küçük bir benchmark** olabilir ve
sonuçları **doğrudan gönderime giremez** — yalnız araştırma katmanında kalır.

## Explee AutoGTM — RED (şimdilik)

<https://explee.com/pricing> · güncel fiyat ~`$30 / 1.000 e-posta`.

Araştırma, mailbox, ısıtma, yazım ve gönderimi kendi içinde üstlenir. Bu:

- AgencyOS'un **tek onay / suppression / audit** gönderim hattını **ikinci kez kurar**;
- 3.000 e-posta için yaklaşık **`$90`** değişken maliyet yaratır;
- gönderim sahipliğini AgencyOS dışına çıkarır ve ürün sınırını bozar.

**Karar:** kullanılmaz. İleride **ayrı domain/mailbox** ile kontrollü bir deney olarak
karşılaştırılabilir; o deneyin sonuçları da AgencyOS'un audit hattına yazılmadan "kanıt" sayılmaz.

## Gönderim sahipliği (değişmez)

- **GrafikcemOS ajan takımı:** niş/şirket araştırır, kanıt toplar, taslak ve kişiselleştirme önerir,
  AgencyOS'a **onay isteği açar**.
- **AgencyOS:** tek system of record ve **tek send gateway**. Uygunluk, suppression, e-posta
  doğrulama, insan onayı, campaign kotası, Gmail/Instantly çağrısı, provider idempotency,
  bounce/reply/opt-out ve audit burada yaşar.
- Hiçbir GrafikcemOS ajanı Gmail/Instantly tokenı tutamaz veya AgencyOS dışında gerçek mail gönderemez.

## Kullanıcıdan beklenen

1. Apify hesabının **gerçek güncel** aktör fiyatı (preflight bunu okuyacak; okunamazsa koşu açılmaz).
2. `APIFY_ENABLED` açma kararı — açılana kadar **hiç kredi harcanmaz**.
3. LeadMash/Explee benchmark'ı istenirse ayrı ve açık onay.
