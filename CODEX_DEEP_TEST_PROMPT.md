# AgencyOS × Feed The Goat — Derin Sistem Sağlık Testi (Codex Görevi)

> **Bu bir görev brifidir.** Codex'e (veya başka bir kodlama ajanına) olduğu gibi yapıştır.
> Amaç: Feed The Goat (yaşam OS'u) ile AgencyOS (satış/lead motoru) **büyük birleşmesinden** sonra
> tüm sistemin gerçekten çalışıp çalışmadığını, birleşme dikişlerinin sağlam olup olmadığını
> kanıta dayalı olarak doğrulamak. Tahmin değil — **çalıştır, gözlemle, raporla.**

---

## 0. Bağlam: Sistem Ne?

Tek bir Next.js (App Router) uygulamasında birleştirilmiş **iki ürün**:

**AgencyOS tarafı** — TR ajans satış motoru:
- Lead motoru: `scan → backfill → enrich → scoreV3` (yüksek kaliteli lead, evidence engine)
- Soğuk e-posta (`coldEmail.ts`, şablonlar, uyumluluk footer'ı, imza)
- Öğrenen sektör rotasyonu (18 sektör — `sectorRotation.ts`)
- Kariyer Radarı / iş ilanı motoru (`lib/jobs/*` — global ATS + TR tekil ilan fetch+parse)
- Fırsat istihbaratı (`opportunityIntelligenceEngine.ts`, `sectorOpportunityEngine.ts`)
- Outreach: çok kanallı sekanslar + funnel/kapalı-döngü metrikleri (`lib/outreach/*`)
- Risk skorlama, teklif üretimi, council, agent orkestratörü, Telegram bot
- Sayfalar: `command-center`, `harita`, `pipeline`, `kariyer`, `radar`, `icraat-firsatlari`, `agents`, `services`, `tasks`, `projects`, `settings`

**Feed The Goat tarafı** — kişisel yaşam OS'u (route grubu `(os)/(life)`):
- `akademi`, `aliskanliklar` (habits/streaks), `finans` (money rules), `gelisim`, `gunluk` (günlük), `kutuphane`
- **Ayrı 2. Supabase projesi** kullanır → `LIFE_SUPABASE_*` / `NEXT_PUBLIC_LIFE_SUPABASE_*` env'leri

**Kritik birleşme dikişleri (en çok burada kırılır):**
1. **İki ayrı Supabase istemcisi** — ana DB vs `LIFE_*` DB. Yanlış istemciyle sorgu = sessiz hata.
2. **Auth gate** — tek oturum/şifre kapısı her iki tarafı da korumalı.
3. **Paylaşılan layout/sidebar** — iki ürünün navigasyonu çakışmadan render olmalı.
4. **23 migration** — bazıları SQL Editor'da manuel uygulanmış olabilir (012, 013, 018–020). DB şeması koddaki tiplerle uyumlu mu?
5. **Global sarı reskin** — FTG'nin sarı teması AgencyOS sayfalarını bozmamalı.

**Tech:** Next.js (App Router — `node_modules/next/dist/docs/` içindeki kılavuzu oku, bu eğitim
verindeki Next.js DEĞİL), TypeScript, Vitest, Supabase (×2), Vercel (6 cron), OpenRouter/Gemini LLM.

---

## ⚠️ Kurallar
- **Salt-okunur kanıt topla. Hiçbir şeyi "düzeltme", commit atma, migration uygulama, dış servise istek atıp gerçek e-posta/Telegram göndermeme.**
- Her iddianı bir komut çıktısı / dosya satırı / HTTP yanıtıyla destekle. Kanıt yoksa "doğrulanamadı" yaz.
- Test ederken gerçek API anahtarı yoksa, ilgili modülün **anahtar yokken zarif şekilde mi yoksa patlayarak mı** davrandığını test et — ikisi de bulgu.
- Sonunda tek bir **SAĞLIK RAPORU** üret (aşağıdaki şablon).

---

## FAZ 1 — Statik Sağlık (derleme zinciri)

Sırayla çalıştır, her birinin çıktısını yakala:

```bash
# 1. Bağımlılıklar kurulu mu / lockfile tutarlı mı
npm ci   # veya: npm install --no-save  (ci kırılırsa nedenini raporla)

# 2. Tip güvenliği — birleşme en çok tip uyumsuzluğu yaratır
npx tsc --noEmit

# 3. Lint
npm run lint

# 4. Production build — App Router + iki Supabase istemcisi gerçek sınav
npm run build

# 5. Tüm testler
npm run test
```

**Her adım için raporla:** geçti/kaldı, hata sayısı, ilk 5 hatanın `dosya:satır` + mesajı.
- `tsc` hataları → hangileri birleşme dikişinde (life vs agency tip karışması, eksik kolon tipi)?
- `build` kalırsa → hangi route/sayfa? RSC/client sınır ihlali mi, env eksikliği mi?
- Test kalırsa → hangi suite? (16 vitest dosyası var: jobs, scoring, outreach metrics, leadScoringV3, evidenceEngine, habits/streaks, pipelineGate, staleDeals, orchestrator, trGeo, coldEmailTemplates, proposalGenerator, env, leadColumns, channelMatrix)

---

## FAZ 2 — Konfig & Env Bütünlüğü

1. `.env.example` içindeki **tüm** anahtarları listele ve grupla:
   - Ana Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Life Supabase:** `NEXT_PUBLIC_LIFE_SUPABASE_URL`, `NEXT_PUBLIC_LIFE_SUPABASE_ANON_KEY`, `LIFE_SUPABASE_SERVICE_ROLE_KEY`
   - LLM: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `GOOGLE_GEMINI_API_KEY`
   - Enrichment/scan: `APOLLO_API_KEY`, `FIRECRAWL_API_KEY`, `SERPAPI_API_KEY`, `GOOGLE_MAPS_KEY`
   - Auth/cron: `APP_PASSWORD`, `APP_SESSION_SECRET`, `CRON_SECRET`
   - Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_USER_ID`, `TELEGRAM_WEBHOOK_SECRET`
2. `src/lib/env.ts` + `env.test.ts` oku: hangi env'ler **zorunlu** (yokken throw) vs opsiyonel? `env.test.ts` çalışıyor mu?
3. **Kod ile `.env.example` farkı:** `grep` ile koddaki `process.env.X` kullanımlarını çıkar, `.env.example`'da olmayan ama kodun beklediği bir anahtar var mı? (sessiz `undefined` riski)
4. `vercel.json` cron yollarının her biri gerçek bir route dosyasına denk geliyor mu?
   - `/api/cron/daily-scan`, `/api/cron/opportunity-scan`, `/api/cron/agent-tick`, `/api/cron/job-scan`, `/api/cron/orchestrator` (×2)

---

## FAZ 3 — İki Supabase Dikişi (en kritik birleşme noktası)

1. `src/lib/supabase*` dosyalarını (`supabase.ts`, `supabaseAdmin.ts`, `supabaseClient.ts`, `supabaseServer.ts`, `lib/supabase/`) oku. Kaç farklı istemci factory var?
2. **Life DB istemcisini bul:** Hangi dosya `LIFE_SUPABASE_*` env'lerini okuyor? Life sayfaları (`(os)/(life)/*`) ve `lib/finance`, `lib/habits` doğru istemciyi mi import ediyor?
3. **Çapraz kontaminasyon avı:** Bir agency modülü yanlışlıkla life istemcisini, ya da bir life modülü ana istemciyi mi kullanıyor? Her `(life)` sayfası ve API'sinde kullanılan istemciyi `dosya:satır` ile tablo halinde çıkar.
4. **Service-role sızıntısı:** `SUPABASE_SERVICE_ROLE_KEY` / `LIFE_SUPABASE_SERVICE_ROLE_KEY` yalnızca sunucu (`"use server"` / route handler / `*Server.ts` / `*Admin.ts`) tarafında mı? Client component'e sızıyor mu? (`grep -rn SERVICE_ROLE src/` → her isabeti sınıflandır)

---

## FAZ 4 — Migration ↔ Şema ↔ Tip Tutarlılığı

23 migration var (`supabase/migrations/001…023`). Memory'ye göre bazıları (012, 013, 018–020) SQL Editor'da manuel uygulanmış olabilir.

1. Tüm migration dosyalarını listele; her birinin oluşturduğu/değiştirdiği **tabloları ve kolonları** çıkar.
2. `src/lib/types.ts` (ve varsa generated Supabase tipleri) ile karşılaştır: kodun beklediği ama hiçbir migration'da olmayan tablo/kolon var mı? Ya da migration'da olup tipte olmayan?
3. Numara sırasında **boşluk** var mı? (003 yok — kasıtlı mı, kayıp mı?)
4. Migration'ları gerçekten **uygulama** (DB'ye dokunma) — sadece statik tutarlılık. Eğer yerel Supabase varsa ve güvenliyse `supabase db diff` öner ama çalıştırmadan önce sor.

---

## FAZ 5 — Runtime Smoke (uygulamayı ayağa kaldır)

```bash
npm run dev   # arka planda
```

`http://localhost:3000` üzerinde:

1. **Auth gate:** Giriş yapmadan korumalı route'a (`/command-center`, `/finans`) git → şifre kapısına yönleniyor mu? `APP_PASSWORD` ile giriş → oturum çerezi (`APP_SESSION_SECRET` imzalı) kuruluyor mu?
2. **AgencyOS sayfaları** sırayla yükle, console + network hatası say:
   `/command-center`, `/harita`, `/pipeline`, `/kariyer`, `/radar`, `/icraat-firsatlari`, `/agents`, `/services`, `/tasks`, `/settings`
3. **Feed The Goat sayfaları:** `/akademi`, `/aliskanliklar`, `/finans`, `/gelisim`, `/gunluk`, `/kutuphane`
   - Her biri **kendi (life) Supabase'inden** veri çekiyor mu, yoksa boş/hata mı?
4. **Reskin regresyonu:** Sarı tema her iki taraf da render olurken kontrast/okunabilirlik bozuyor mu? Sidebar her iki ürün grubunu da gösteriyor mu?
5. Konsolda hydration mismatch, 404 asset, RSC serileştirme hatası var mı?

> Playwright MCP varsa her sayfanın screenshot'ını al ve console mesajlarını topla.

---

## FAZ 6 — API Kontrat Smoke (kapsamlı yüzey)

Her route handler için: **(a)** kimlik doğrulama/CRON_SECRET koruması var mı, **(b)** girdi doğrulaması var mı, **(c)** anahtar yokken zarif mi davranıyor. Gerçek dış çağrı YAPMA (LLM/e-posta/Telegram tetikleme) — kod yolunu oku, gerekirse mock/`?dry=1` varsa kullan.

İncelenecek API grupları (`src/app/api/`):
`leads` (scan, backfill, [id]/cold-email, [id]/proposal, [id]/risk, [id]/sequence, stale),
`jobs` (+ ingest), `outreach/metrics`, `sectors`, `opportunities`, `enrichment`,
`assistant`, `ai`, `agents`, `council`, `jarvis`, `memory`, `knowledge`, `metrics`,
`db/[table]` (⚠️ **genel tablo erişimi — yetki kontrolü var mı? SQL/tablo-adı enjeksiyonu?**),
`telegram` (webhook secret doğrulaması), `cron/*` (CRON_SECRET zorunlu mu?), `health`, `auth`.

**Özellikle:**
- `api/db/[table]/route.ts` → keyfi tablo okuma/yazmaya açık mı? Hangi tablolar whitelist'te?
- `api/cron/*` → `CRON_SECRET` olmadan çağrılırsa 401 mi dönüyor yoksa iş mi yapıyor?
- `api/telegram/*` → `TELEGRAM_WEBHOOK_SECRET` doğrulanıyor mu?

`/api/health` varsa çağır, yanıtını raporla.

---

## FAZ 7 — Güvenlik & Sır Taraması

```bash
git status            # commit edilmemiş hassas dosya var mı (.env, *.png ekran görüntüleri)
git ls-files | grep -iE '\.env($|\.)'   # .env yanlışlıkla izleniyor mu
grep -rnE '(sk-|AIza|SUPABASE_SERVICE|Bearer )' src/   # gömülü sır
```
1. Kaynak kodda **hardcoded secret** var mı?
2. `service_role` anahtarı client bundle'a sızıyor mu? (`NEXT_PUBLIC_` öneki YANLIŞ anahtarda mı?)
3. `api/db/[table]` ve diğer dinamik route'larda enjeksiyon / yetki atlama riski.
4. Repo kökündeki ekran görüntüsü PNG'leri (`*-mobile.png`, `command-center.png` vb.) hassas veri içeriyor mu, `.gitignore`'da mı olmalı?

---

## FAZ 8 — Birleşme Dikişi Regresyon Avı (özel)

Feed The Goat + AgencyOS birleşmesi büyüktü. Bu dikişlere özellikle bak:
1. **İsim/route çakışması:** İki üründe aynı isimli component/util/type var mı? (örn. iki `Card.tsx`, iki `types.ts` kavramı) Yanlış import çözümü?
2. **Paylaşılan `layout.tsx` / `Sidebar.tsx` / `AppLayout.tsx`:** İki ürünün nav öğeleri doğru gruplanmış mı, koşullu render kırık mı?
3. **`globals.css` / tema:** Reskin sırasında AgencyOS'un eski renk token'ları ezilmiş mi?
4. **Ölü kod:** Birleşme sonrası kullanılmayan eski FTG veya AgencyOS dosyaları (`*.tmp.*` gibi — `offerMatching.ts.tmp.*` repoda duruyor, neden?).
5. **Tip kayması:** `git log --oneline` son commit (`14d0f8d stabilize + güvenlik kapısı + Calm Operator Console redesign`) neyi değiştirdi — yarım kalan bir geçiş var mı?

---

## SAĞLIK RAPORU (çıktı şablonu)

```
# AgencyOS × FTG — Sistem Sağlık Raporu
Tarih: <>            Branch: feat/ftg-merge          Commit: <hash>

## Özet Skor
- Build:        🟢/🟡/🔴  (<n> hata)
- Tipler:       🟢/🟡/🔴  (<n> hata)
- Lint:         🟢/🟡/🔴
- Testler:      🟢/🟡/🔴  (<geçen>/<toplam>)
- Runtime smoke:🟢/🟡/🔴  (<n> sayfa hatalı)
- Güvenlik:     🟢/🟡/🔴  (<n> kritik)

## CRITICAL (birleşmeyi/üretimi bloke eder)
- [dosya:satır] sorun → kanıt → önerilen düzeltme

## HIGH / MEDIUM / LOW
...

## Birleşme Dikişi Bulguları
- İki Supabase ayrımı: SAĞLAM / SIZINTI VAR → ...
- Auth gate her iki tarafı koruyor: E/H
- Migration↔tip tutarlılığı: ...
- Reskin regresyonu: ...

## Doğrulanamayanlar (anahtar/erişim eksik)
- ...

## Sonraki Adım Önerileri (öncelik sırası)
1. ...
```

---

### Çalıştırma Notu
Fazları sırayla yürüt. Bir faz erken bloke olursa (örn. build kırık) yine de
statik fazları (2,3,4,7,8) tamamla — bunlar build gerektirmez. Runtime fazlar
(5,6) için build/dev gerekir. **Hiçbir düzeltme uygulama; sadece teşhis et ve raporla.**
