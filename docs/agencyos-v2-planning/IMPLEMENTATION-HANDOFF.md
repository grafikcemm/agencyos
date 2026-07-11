---
Doküman: IMPLEMENTATION-HANDOFF
Dalga: 3 (Sentez — soğuk-başlangıç uygulama handoff'u)
Tarih: 2026-07-11
Durum: Sprint 0 kodlamasına sıfır-konuşma-bağlamıyla başlayabilecek handoff
Bağımlılık: FIRST-SPRINT.md (sprint detayı) · onaylı plan (agencyos-v2-ethereal-possum) · 04/05/06/07/16 (donmuş sözleşmeler) · 19 §1 (kanonik migration) · 21 (T1-T16) · 25 (Sprint 0/1) · 26 (kabul senaryoları)
---

# AgencyOS V2 — Implementation Handoff (Sprint 0)

> ## ⛔ KOD YAZMAYA BAŞLAMA
> Bu doküman **hazır bir devir teslimdir**, uygulama emri değildir. Kodlama, kullanıcı (Ali Cem) bu handoff'u onayladıktan sonra **ayrı temiz bir oturumda** başlar (plan §8). Bu dosyayı okuyan oturum: önce Ön Koşullar'ı doğrula, sonra onay iste, ancak ondan sonra Builder prompt'uyla başla.

---

## 1. İlk uygulanacak kullanıcı sonucu

> **"Sistem ölü modele düşmeyi bırakır (3 bozuk ID → preset+fallback); ve onayladığım bir outreach taslağı Gmail hesabımdan gerçekten gönderilir — suppression + audit iziyle."**

Detay ve görev sırası: `FIRST-SPRINT.md`. Tam `/bugun` kokpiti ve rol-aware taslak bu sprintte DEĞİL (sonraki sprint).

## 2. Ön koşullar (kodlamadan ÖNCE, sırayla)

1. **[KULLANICI — fabrike edilemez]** Gmail OAuth: Ali Cem Google Cloud Console'da OAuth istemcisi oluşturur, `gmail.send` + `gmail.readonly` scope'larıyla yetkilendirir. `gmail.modify`/full YASAK (plan §3 ruling, 21 T4). OAuth gecikirse: Gmail adımları (aşağıda E-görevleri) shadow'da bekler, routing+contracts+migrations tam ilerler (25 fallback yolu).
2. **Canlı model kataloğu YENİDEN doğrula:** `GET https://openrouter.ai/api/v1/models` WebFetch. 16 §2 tablosu 2026-07-11 anlıktır; preset primary/fallback ID'leri ve fiyatlar pin edilmeden önce yeniden kontrol edilir (16 §2 kritik kural). Kaybolan model varsa 16 §3 preset zincirinde bir alt fallback'e kaydır, dokümana not düş.
3. **Canlı migration defteri doğrula:** App DB'de `list_migrations` (MCP `supabase-app`). Repo en yüksek dosya = `044_trace_memory_governance.sql`; 045+ serbest olmalı (19 §1.1). Çakışma varsa numaraları kaydır — 19 kanonik sahip.
4. **Dirty-tree kontrolü:** `feat/ftg-merge` dalında commit edilmemiş iş olabilir (memory: birden çok özellik commit bekliyor). Kullanıcının uncommitted değişikliklerini ASLA ezme (rules/os/60); yeni worktree aç.
5. **Doğru Supabase projesi:** App DB = `dfedeh…` (leads/agents/outreach); MCP `claude_ai_Supabase` projesi `xcqrk…` = LIFE DB — **yanlış hedefe migration uygulanmaz** (memory: supabase-project-mapping).
6. **Güvenlik incelemesi:** `gmail_accounts` token şeması (Vault referanslı) canlıya alınmadan bağımsız security review (19 §5 zorunluluğu; aşağıda Security Reviewer prompt'u).

## 3. Worktree

```
git worktree add ../agency-os-v2-sprint0 -b feat/agencyos-v2-sprint0
```

Tek worktree yeter (Sprint 0 tek ekip); paralel WS worktree'leri (`feat/ws-e-gmail-ops` vb., 24 §1-8) sonraki sprintlerde açılır.

## 4. Dokunulacak dosyalar (gerçek yollar; repo kökü `agency-os/`)

| Yol | İş | Kaynak |
|---|---|---|
| `src/lib/openrouter.ts` | `OPERATION_MODEL_MAP`(:11-36) → `OPERATION_PRESET_MAP`; `models[]` + AbortController + retry + fallback-log (:207-238); `TOKEN_RATES_PER_M`(:47-52) canlı fiyat; default(:97) → fast-extract; legacy `callLight/Medium/Heavy`(:371-417) preset'e yönlendir. **İmza değişmez.** | 16 §5 |
| `src/lib/models/*` **(YENİ)** | `presets.ts` (RoutePreset katalog, 16 §3 birebir + `verifiedAt`), `registry.ts` (operation→preset çözümleme), `verify.ts` (nightly drift kontrol yardımcıları) | 16 §3-4, §6 |
| `src/lib/ai/costLog.ts` | additive alanlar: `preset_key`, `fallback_used`, `retry_count` (strip-retry deseni korunur, `:28-32`) | 16 §4.7 |
| `src/lib/ai/caps.ts` | değişmez referans-desen; `ai_route_presets` settings-override aynı desenle eklenir (5-dk cache) | 16 §5.5 |
| `src/lib/redact.ts` (+ `redact.test.ts`) | Google token prefix'leri `ya29.`, `1//` | 21 T4/T11 |
| `src/lib/outreach/gmail.ts` **(YENİ)** | `sendGmailMessage` tek gönderim fonksiyonu; `permissionClass:'external'`; idempotency `outreach_messages.id` + `sent_at` no-op | 12, 21 T5/T6 |
| `src/lib/outreach/email.ts` | `markMessageSent` DB-kayıt rolünde KALIR (zaten idempotent — reuse, plan §2) | 12 |
| `src/lib/suppression/*` **(YENİ)** | suppression pre-send check (deterministik, LLM'siz); ince repo modülü (never-throws + `notifyOps`, 19 §2 deseni) | 21 T8 |
| `src/lib/email/*` **(YENİ)** | `email_threads`/`email_messages` repo yardımcıları | 19 §2 |
| `supabase/migrations/046_email_threads_messages.sql` **(YENİ)** | threads + messages + `outreach_messages` additive + `gmail_accounts` (Vault ref) | 19 §1.2, §5 |
| `supabase/migrations/047_suppression_consent.sql` **(YENİ)** | suppression + consent + leads additive | 19 §1.2 |
| `supabase/migrations/052_tool_cost_logs.sql` **(YENİ)** | tool_cost_logs + (ops.) `ai_route_presets` config | 19 §1.2 |
| `src/app/api/cron/model-health-check/route.ts` **(YENİ)** + `vercel.json` | nightly drift cron (`0 2 * * *`), CRON_SECRET bearer + `guardCronEnv` | 16 §6, 19 §4 |
| OAuth callback route **(YENİ, `src/app/api/auth/gmail/*` önerisi)** | authorize + callback + Vault token saklama | 19 §5 |
| Onay yüzeyi (mevcut approval ekranı) | alıcı domain onay kartında görünür | 25 Sprint 1, 21 T10 sınıfı |

Not: migration numaraları ön-koşul 3'teki `list_migrations` doğrulamasına tabidir; `gmail_accounts` 046-içi (19 §5 önerisi) veya ayrı 054 — build kararı.

## 5. Dokunulmayacak dosyalar (KIRMIZI ÇİZGİ)

- **LIFE Supabase projesi** (`xcqrk…`, `lifeSupabaseAdmin`) — sıfır okuma/yazma/migration.
- **`src/app/(os)/(life)/*`** — `gorevler/`, `aliskanliklar/`, `akademi/`, `gelisim/`, `finans/`, `kutuphane/` (Görev/Alışkanlık/Rutin yüzeyleri, plan "DOKUNULMAZ").
- **`src/lib/assistant/*`** — asistan/mentor/embeddings (`embeddings.ts` + mig 042 pgvector DEĞİŞMEZ, 16 §Embeddings).
- **`src/lib/memory/governance.ts`** — bu sprintte değişmez (mig 050 + scope işi Sprint 4).
- **`src/lib/leadIntel/*` iç mantığı** — council/scoring parity korunur; yalnız `openrouter.ts` üzerinden preset'e geçer (çağıran-değişimsiz).
- **Mevcut cron'lar + `agent_tasks` kuyruğu + `approval_requests` akışı** — yeni kuyruk/onay sistemi KURULMAZ (19 §2 ADR-001).
- `.env` içerikleri hiçbir rapora/log'a yazılmaz; yalnız değişken ADI referanslanır.

## 6. Shared contracts (donmuş — kod bunlara uyar, bunları değiştirmez)

| Doküman | Kilitlediği |
|---|---|
| `04-domain-model.md` | entity/alan/RLS/retention/provenance |
| `05-event-contracts.md` | event adları + idempotency key + payload (gövde referans-id ile, ham metin değil) |
| `06-agent-registry.md` | 11 rol I/O + aktivasyon kapıları (§4: flag → eval-gate → parity-guard) + lethal-trifecta (§5) |
| `07-skill-registry.md` | 21 skill spec (★MVP 10 skill); `send-gmail` bu sprintin tek yeni-aktif adayı |
| `16-openrouter-routing.md` | PRESETS katalog + router policy + migration path — routing işinin birebir şartnamesi |

Sözleşme değişikliği gerekirse: kod uydurmaz — dokümanda değişiklik önerilir, kullanıcı onaylar, sonra kod (rules/os/20).

## 7. Database migration planı

1. Kanonik sıra 19 §1.2 (045-053); **bu sprint yalnız 046, 047, 052**.
2. Her migration öncesi canlı `list_migrations` (App DB) — doğrula-önce-uygula.
3. Ortak desen (mig 029/033/043/044 kopyası): additive + idempotent · `BEGIN/COMMIT` · politikasız RLS + `REVOKE ALL FROM anon, authenticated` · `NOTIFY pgrst, 'reload schema'`.
4. **Elle uygulama gerçeği:** App DB'ye programatik migration uygulanamıyor (mig 031/033 notları) → SQL dosyası repo'ya yazılır, kullanıcı SQL Editor'dan uygular; kod strip-retry (`PGRST204`/`42703`) ile migration'sız da kırılmaz.
5. Uygulama sonrası `get_advisors` (security lint) — RLS eksikliği T10 sınıfı bulgu.
6. `prisma db push`/otonom prod migration YASAK (global guardrail).

## 8. Feature flags

| Flag / mekanizma | Default | Bu sprintte |
|---|---|---|
| `BRAIN_V2_ENABLED` / `BRAIN_ACTIVE_ENABLED` (`src/lib/brain/index.ts:14-21`) | OFF | OFF kalır; yalnız çalışırlık doğrulanır |
| `skills.active` (mig 041, default `false`) | false | `send-gmail` skill'i shadow doğar; 06 §4 üç kapıyı geçmeden `active=true` yapılmaz |
| `ai_route_presets` settings-override (YENİ, `caps.ts` deseni) | boş (kod default'u) | drift'te deploy'suz düzeltme kanalı |
| Rollback anahtarı | — | `send-gmail` `active=false` → taslak-yalnız moda dönüş |

## 9. Test planı

- **Minimum kapı (rules/os/30):** tsc + lint + mevcut ~490 test + build — hepsi yeşil kalmalı.
- **Yeni unit:** preset-registry (operation→preset, Tier 3-4 `data_collection:'deny'`) · fallback-self-heal (mock 404) · timeout-abort · token-redaction (`eval.security.token_redaction`) · suppression gate · idempotent send (double-execute→tek gönderim).
- **Parity:** `callWithOperation` imza + davranış; council deterministik skorlar birebir (`eval/cases/councilParity.ts` deseni, 06 §4 kapı 3).
- **Kabul:** 26 Senaryo 6 (Provider Failure) tam; Senaryo 2'nin gönderim yarısı (onay→send→tek `email.sent`); Senaryo 5'in bloke adımı (suppress→`ok:false`).
- **UI:** onay kartı (alıcı domain görünür) tarayıcıda doğrulanır — mobil + desktop (rules/os/70); yeşil build tek başına yetmez.
- **Çalıştırılamayanlar açıkça raporlanır:** canlı Gmail gönderimi ancak OAuth sonrası test edilir; OAuth yoksa "unverified" olarak listelenir.

## 10. Rollback

- Router: `openrouter.ts` + `src/lib/models/` revert; acil durumda `ai_route_presets` settings ile deploy'suz model değişimi.
- Migration'lar: additive → tablolar DROP, kolonlar null-tolere (strip-retry).
- Gönderim: `send-gmail` `active=false` (taslak-yalnız) + OAuth token satırı sil + Google'da yetki iptali.
- Cron: `vercel.json` girişini kaldır.

## 11. Definition of Done

- [ ] FIRST-SPRINT §6'daki 10 acceptance maddesinin tamamı kanıtla (test/ekran görüntüsü/audit satırı) kapatıldı.
- [ ] Ham model ID hiçbir çağrı yerinde yok; 3 ölü ID repo'dan silindi.
- [ ] tsc + lint + testler + build yeşil; yeni testler suite'e eklendi.
- [ ] Migration'lar SQL Editor'da uygulandı + `get_advisors` temiz; LIFE DB'ye sıfır dokunuş kanıtı (migration dosyaları yalnız App DB).
- [ ] `send-gmail` shadow→active geçişi 06 §4 üç kapı kaydıyla yapıldı (veya OAuth gecikmesi nedeniyle shadow'da bırakıldığı raporlandı).
- [ ] Kod-incelemesi + QA + güvenlik incelemesi ayrı temiz context'lerde koştu (builder kendi işini onaylamaz — rules/os/10).
- [ ] Test edilemeyenler ("unverified") özet raporda açıkça listelendi.
- [ ] Handoff dokümanı güncellendi (`docs/handoffs/` — Goal/Status/Decisions/Tests/Known Issues/Continue Prompt).

---

## 12. Rol prompt'ları (kopyala-yapıştır)

### 12.1 Builder prompt

```
Rol: Builder — AgencyOS V2 Sprint 0 uygulayıcısı.
Worktree: feat/agencyos-v2-sprint0 (yeni aç; ana dalda çalışma).

Şartname (SIRAYLA OKU, sonra kodla):
1. docs/agencyos-v2-planning/FIRST-SPRINT.md (görev listesi §3 — sıra bağlayıcı)
2. docs/agencyos-v2-planning/IMPLEMENTATION-HANDOFF.md (dokunulacak/dokunulmayacak dosyalar §4-5)
3. docs/agencyos-v2-planning/16-openrouter-routing.md (routing işinin birebir şartnamesi; PRESETS §3 tablo + policy §4 + migration path §5)
4. docs/agencyos-v2-planning/19-data-and-worker-architecture.md §1 (migration deseni) + §5 (token)

Kurallar:
- callWithOperation / callWithOperationMultimodal imzaları DEĞİŞMEZ; usage:{include:true} + actual_cost_usd/generation_id loglama + getTokenRate settings-override deseni KORUNUR.
- Ham model ID hiçbir çağrı yerine yazılmaz; her şey preset_key üzerinden.
- Gönderim TEK fonksiyondan (sendGmailMessage); route-handler'da doğrudan googleapis YASAK.
- Yeni kuyruk/onay sistemi KURMA: agent_tasks + approval_requests (mig 043 digest-lock) kullan.
- Deterministik işe (suppression, idempotency, tarih) LLM KOYMA.
- DOKUNMA: LIFE DB, src/app/(os)/(life)/*, src/lib/assistant/*, src/lib/memory/governance.ts, mevcut leadIntel iç mantığı.
- Migration SQL dosyalarını yaz ama UYGULAMA — kullanıcı SQL Editor'dan uygular; öncesinde list_migrations doğrulaması iste.
- Plan dışına çıkma; eksik görürsen improvise etme, açıkça raporla.
- Küçük geri-alınabilir commit'ler; conventional commits.
Bitiş: tsc + lint + test + build yeşil; FIRST-SPRINT §7 yeni testleri yazılmış; neyin test edilemediği (ör. OAuth'suz canlı gönderim) açıkça listelenmiş özet.
```

### 12.2 Reviewer prompt (temiz context — builder'dan bağımsız)

```
Rol: Code Reviewer — AgencyOS V2 Sprint 0 diff incelemesi. Kod YAZMA; bulgu raporla (CRITICAL/HIGH/MEDIUM/LOW).
Girdi: git diff main...feat/agencyos-v2-sprint0 + docs/agencyos-v2-planning/{FIRST-SPRINT.md, 16-openrouter-routing.md, 19-data-and-worker-architecture.md, 26-acceptance-tests.md}.

Kontrol listesi:
1. Sözleşme sadakati: PRESETS 16 §3 tablosuyla birebir mi? verifiedAt alanları var mı? Router policy 16 §4'ün 10 maddesini karşılıyor mu (models[], AbortController, 1 retry, görünür fallback log, ceiling, require_parameters, data_collection deny Tier 3-4)?
2. Kırılmama: callWithOperation imza + davranış parity; mevcut çağıranlar (council, cold-email route, JARVIS tools) etkilenmemiş; council deterministik skor parity (eval/cases/councilParity.ts deseni).
3. Ham model ID taraması: repo genelinde ölü/canlı model ID string'i kalmamış (grep).
4. Gönderim güvenliği: sendGmailMessage tek giriş noktası; approval_requests digest-lock bağı; idempotency (outreach_messages.id + sent_at no-op + gmail_message_id UNIQUE); suppression pre-send gate atlanamıyor.
5. Migration deseni: 046/047/052 additive + idempotent + RLS + REVOKE + NOTIFY; LIFE DB'ye dokunuş SIFIR; numaralar list_migrations ile doğrulanmış mı?
6. Kapsam disiplini: FIRST-SPRINT §2 out-of-scope'a taşan iş var mı (cockpit, reply ingest, memory, 045)? Varsa işaretle.
7. Hata yönetimi: sessiz yutulan hata yok; strip-retry (PGRST204/42703) yeni kolonlarda uygulanmış; never-throws repo modül deseni.
Çıktı: severity'li bulgu listesi + Approve/Warn/Block kararı (CRITICAL/HIGH varsa Block/Warn).
```

### 12.3 QA Verifier prompt (temiz context)

```
Rol: QA Verifier — bağımsız doğrulama. Kod DÜZELTME; kanıtla pass/fail raporla.
Girdi: feat/agencyos-v2-sprint0 çalışma kopyası + docs/agencyos-v2-planning/26-acceptance-tests.md + FIRST-SPRINT.md §6-9.

Koşulacaklar:
1. Proje kendi komutlarıyla: typecheck + lint + tüm test suite + build (komutları package.json'dan tespit et; kendi tooling'ini icat etme).
2. 26 Senaryo 6 (Provider Failure): mock/fixture ile primary 404 → otomatik fallback → data.model doğru → model.fallback.used logu → tek cost satırı. Timeout → abort + 1 retry.
3. 26 Senaryo 2'nin gönderim yarısı (OAuth hazırsa canlı, değilse shadow/mock): onay → send → email_messages satırı + email.sent; aynı onayın ikinci yürütmesi → no-op (tek gönderim).
4. 26 Senaryo 5 bloke adımı: adres suppression_list'te → send denemesi ok:false + audit izi.
5. eval.security.token_redaction: ya29./1// fixture → maskeli.
6. UI: onay kartında alıcı domain görünür — tarayıcıda gerçek akış, mobil + desktop (yeşil build yeterli DEĞİL).
7. FIRST-SPRINT §6'nın 10 acceptance maddesini tek tek işaretle (kanıt: test çıktısı / ekran görüntüsü / DB satırı).
Çıktı: madde-madde PASS/FAIL + koşulamayanlar "NOT RUN + nedeni" (ör. OAuth yok). Asla kapsamsız "testler geçti" deme.
```

### 12.4 Security Reviewer prompt (temiz context — merge blokörü)

```
Rol: Security Reviewer — Sprint 0 yüksek-risk yüzeyleri. Kod YAZMA; risk raporla (likelihood/impact/mitigation-durumu).
Girdi: diff + docs/agencyos-v2-planning/21-security-and-compliance.md (T1-T16) + 19 §5 (token) + 26-acceptance-tests.md.

Odak (bu sprintin tehdit alt-kümesi):
- T4 Gmail OAuth token: token şifreli mi (Vault/pgcrypto), ayrı tablo + RLS + REVOKE ALL + service-role-only mu? redact.ts ya29./1// maskeliyor mu? Token herhangi bir log/response/rapor yüzeyine sızıyor mu? Scope yalnız gmail.send+gmail.readonly mu (modify/full varsa BLOCK)?
- T5 unauthorized send: sendGmailMessage yalnız approval_requests.status='approved' + yürütme-anı action_digest eşleşmesiyle mi yürüyor (repo.ts markApprovalExecuted tek-geçiş)? Onaysız yol var mı (grep: googleapis import'ları)?
- T6 duplicate send: idempotency zinciri tam mı (outreach_messages.id + sent_at no-op + gmail_message_id UNIQUE + approved→executed tek-geçiş)?
- T8 suppression bypass: pre-send gate atlanabilir mi? suppression yazımları source+reason+operator taşıyor mu?
- T10 RLS: 046/047/052'de RLS+REVOKE+NOTIFY eksiksiz mi? get_advisors çıktısı temiz mi? SECURITY DEFINER view yok mu?
- T11 log redaction: run_spans/console'a ham gövde/token/PII düşüyor mu?
- T16 data policy: Tier 3-4 preset'lerde data_collection:'deny' (+premium-deal zdr) registry'de sabit mi?
- Genel: yeni fetch call-site'ları guardedFetch'ten geçiyor mu (T9)? .env/secret hiçbir çıktıda quote edilmemiş mi?
Çıktı: tehdit-başına durum (mitigated/partial/open) + CRITICAL bulgu varsa merge BLOCK. gmail_accounts şeması için ayrı açık onay ver/verme (19 §5 zorunlu inceleme).
```

---

## 13. Sonraki adım (bu handoff onaylanınca)

1. Kullanıcı ön-koşul 1'i (OAuth) başlatır — koda paralel.
2. Temiz oturum: ön-koşul 2-5 doğrulaması → Builder prompt'u (12.1) ile Sprint 0.
3. Kod bitince: Reviewer (12.2) + QA (12.3) paralel, ayrı temiz context'ler; ardından Security (12.4) — merge blokörü.
4. Merge sonrası: FIRST-SPRINT §9 demo kullanıcıya; Sprint 1 devamı (cockpit + rol-aware, mig 045) yeni sprint planıyla.
