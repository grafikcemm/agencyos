---
Doküman: FIRST-SPRINT
Dalga: 3 (Sentez — ilk kodlanacak sprint detayı)
Tarih: 2026-07-11
Durum: Sprint 0 + Sprint 1 başlangıcı — kodlamaya hazır detay (kod bu görevde YAZILMAZ)
Bağımlılık: onaylı plan §4-5 · 25-sprint-roadmap.md (Sprint 0/1) · 23-mvp-v1-v2.md · 24-parallel-workstreams.md (WS E/G/H) · 19-data-and-worker-architecture.md §1 (kanonik migration) · 16-openrouter-routing.md (URGENT fix) · 12-gmail-and-followup-engine.md · 21-security-and-compliance.md (T4/T5/T6/T8/T11/T16) · 26-acceptance-tests.md (Senaryo 2+6)
---

# AgencyOS V2 — İlk Sprint (Sprint 0 + Sprint 1 başlangıcı)

## 0. İlk kullanıcı sonucu

> **"Sistem artık ölü modele düşmüyor; ve bir lead için üretilen outreach taslağını onayladığımda, o mail Gmail hesabımdan gerçekten gönderiliyor — suppression ve audit iziyle."**

İki parçalı sonuç:
1. **Görünmez ama acil (Sprint 0):** Üretimdeki 3 ölü model ID'si (`google/gemini-2.5-flash-lite`, `anthropic/claude-haiku-4-5`, `deepseek/deepseek-v4-pro` — üçü de canlı `/api/v1/models`'de 404, 16 §1-2) düzeltilir. Bugün `draft_proposal`/`draft_email` gibi yollar fiilen patlıyor olabilir (`unverified:` canlı API-key testi yapılmadı, 16 §1 [LIKELY]).
2. **Görünür ilk döngü yarısı (Sprint 1 başlangıcı):** Onayla→Gmail'den gönder (K1'in L2 çekirdeği). Tam `/bugun` kokpiti ve rol-aware taslak SONRAKİ sprintte; bu sprint yalnız **gönderim kasını** kurar.

**Süre hedefi:** ≤2 hafta. Kapsam sabit; sığmazsa süre değil kapsam korunur — Sprint-1 parçası (E1-E3) düşer, Sprint 0 çekirdeği düşmez.

---

## 1. Scope (bu sprintte YAPILIR)

### A — Model-routing URGENT fix (WS G; 16 §3-5) — iki ucuz/acil kazanımdan #1
- `OPERATION_MODEL_MAP` (`src/lib/openrouter.ts:11-36`) → `OPERATION_PRESET_MAP` + merkezi `PRESETS` registry (yeni `src/lib/models/` modülü). Ham model ID hiçbir çağrı yerinde kalmaz (bugün 4 ayrı noktaya gömülü: `:11-36`, `:47-52`, `:97`, `:379-411`).
- Router policy (16 §4): `body.models = [primary, ...fallbacks]` self-heal · `AbortController` timeout (bugün YOK, `:224`) · 1 retry (429/5xx/timeout) · görünür fallback log (`model.fallback.used` + cost-log `preset_key`/`fallback_used`/`retry_count`) · `provider.max_price` ceiling · Tier 3-4 `data_collection:'deny'` (T16).
- **İmza sabit:** `callWithOperation`/`callWithOperationMultimodal` değişmez; `usage:{include:true}` + `actual_cost_usd`/`generation_id` loglama (`:253`) ve `getTokenRate` settings-override deseni KORUNUR (16 §5 kırılmama garantisi).
- `TOKEN_RATES_PER_M` canlı fiyatlarla güncellenir; `ai_route_presets` settings-override anahtarı eklenir (deploy'suz model düzeltme, `caps.ts` deseni).
- Nightly `model-health-check` cron (`/api/cron/model-health-check`, `0 2 * * *`) — preset ID'lerini canlı katalogla karşılaştırır, drift'te system-health uyarısı (16 §6, 19 §3.13).

### B — Contracts + feature flags + audit temeli — kazanım #2
- **Contract-gate dondurma:** 04 (domain) / 05 (event) / 06 (agent) / 07 (skill) / 16 (routing) dokümanları donmuş sözleşme ilan edilir; hiçbir workstream kendi "lead/mesaj" şeklini icat etmez (24 §0). Repo tarafı: `leads` üstünde read-only relationship view tasarımı + message/thread additive şema (mig 046'ya girer).
- **Feature flags doğrulama:** `BRAIN_V2_ENABLED`/`BRAIN_ACTIVE_ENABLED` (`src/lib/brain/index.ts:14-21`, default OFF) + `skills.active` default `false` (mig 041) çalışır durumda doğrulanır. Yeni her yetenek flag/`active` arkasında doğar; kapalıyken shadow'a düşer (06 §4 kapı 1).
- **Audit temeli:** dedicated `audit_log` tablosu KURULMAZ — mevcut `run_spans` (mig 044) + `approval_requests` (mig 043) yeterli (25 Sprint 0). Eklenen tek şey: `src/lib/redact.ts`'e Google OAuth token prefix'leri (`ya29.`, `1//`) — T4/T11.

### C — Gmail OAuth önkoşulu (KULLANICI yapar — kodlanamaz)
> ⚠ **Bu adım fabrike edilemez.** Ali Cem, Google Cloud Console'da OAuth istemcisi oluşturur ve `gmail.send` + `gmail.readonly` scope'larıyla yetkilendirme akışını tamamlar (`gmail.modify`/full **YASAK** — plan §3 ruling, 21 T4). Kod tarafı yalnız callback/token-saklama yüzeyini hazırlar.
- Token saklama: **asla düz metin** — Supabase Vault (veya pgcrypto app-level şifreleme) + ayrı tablo, politikasız RLS + `REVOKE ALL`, service-role-only (19 §5). Bağımsız güvenlik incelemesi ZORUNLU (yüksek-risk sınıfı, rules/os/40).
- **OAuth gecikirse (fallback, 25 §Açık sorular):** E1-E3 shadow'da bekler; A+B tam ilerler; sprint yine değer teslim eder (ölü model fix + sözleşme tabanı).

### E1-E3 — Sprint 1 başlangıcı: HITL Gmail gönderimi (WS E kritik yol)
- **E1:** yeni `src/lib/outreach/gmail.ts` — gönderim **tek fonksiyondan** (`sendGmailMessage`); hiçbir route-handler doğrudan `googleapis` çağırmaz (T5). Adım `permissionClass:'external'` → mevcut `approval_requests` digest-lock kapısı (mig 043; yeni onay sistemi KURULMAZ). İdempotency: `outreach_messages.id` + `sent_at IS NOT NULL` no-op + `gmail_message_id` UNIQUE (T6).
- **E2:** suppression pre-send gate — `suppression_list` (mig 047) kontrolü `send-gmail`'in ön-koşulu; suppress edilmiş adrese gönderim yapısal olarak yürümez (T8). Deterministik, LLM'siz.
- **E3:** gönderim sonrası kayıt — `email_threads`/`email_messages` satırı (mig 046) + mevcut `markMessageSent` (`src/lib/outreach/email.ts`) DB-kayıt rolünde kalır; `email.sent` event (05).
- Onay yüzeyi: mevcut approval ekranı kullanılır; alıcı domain onay kartında **görünür** (T10 sınıfı gözden geçirme — 25 Sprint 1).

---

## 2. Out-of-scope (bilinçli — "later" listesi)

| Ertelenen | Nereye |
|---|---|
| `/bugun` kokpiti (4 ekran recompose, `/icraat-firsatlari` HIDE, `/dashboard`+`/tasks` DELETE) | Sprint 1 devamı (WS A) |
| Rol-aware taslak + `contacts` (mig 045) + `generate-outreach`/`review-outreach` yeni skill sarmalayıcıları | Sprint 1 devamı (WS D) |
| Reply ingest / `sync-email-thread` / `classify-reply` / follow-up state machine tamamı | Sprint 2 |
| Teklif + portfolio (mig 048/049) | Sprint 3 |
| Memory scope (mig 050) + Voice DNA öğrenme | Sprint 4 (şema hazırlığı erken gelebilir, 25 Sprint 4 notu) |
| `inbound_messages` (mig 051), `lead_events`/`signals` (mig 053) | Sprint 2 / opsiyonel |
| Pub/Sub push, prompt cache, Brain-active, oto-follow-up | V2 backlog |
| Ek (attachment) işleme | MVP kapsam dışı (21 T3) |

**Değişmezler (25 §0):** HITL pazarlıksız · premium asla-default (opus-4.8 yalnız explicit escalation, 16 §3) · deterministik işe LLM yok · LIFE DB dokunulmaz · yeni kuyruk/onay sistemi kurulmaz.

---

## 3. Görevler (sıralı)

| # | Görev | Sahip-WS | Bağımlılık |
|---|---|---|---|
| 0 | Ön-kontroller: dirty-tree kontrolü → worktree aç; canlı `GET /api/v1/models` YENİDEN doğrula (fiyat/ID drift); App DB `list_migrations` doğrula (045+ serbest mi) | — | yok |
| 1 | **[KULLANICI]** Gmail OAuth istemcisi + `gmail.send`+`gmail.readonly` yetkilendirme | operatör | yok (paralel) |
| 2 | `PRESETS` registry + `OPERATION_PRESET_MAP` (16 §3, §5 tablo birebir) — yeni `src/lib/models/` | G | 0 |
| 3 | Router policy: `models[]` + AbortController + 1 retry + fallback log + ceiling + provider politikası (16 §4) | G | 2 |
| 4 | `TOKEN_RATES_PER_M` canlı fiyat + `ai_route_presets` settings-override; legacy `callLight/Medium/Heavy` içleri preset'e yönlendir | G | 2 |
| 5 | Mig **052** (`tool_cost_logs` + preset config) — elle SQL Editor, ortak desen (19 §1.2) | H | 0 |
| 6 | Mig **046** (`email_threads` + `email_messages` + `outreach_messages` additive + `gmail_accounts` token tablosu — 19 §5 önerisi 046-içi) | H | 0, güvenlik incelemesi |
| 7 | Mig **047** (`suppression_list` + `consent_records` + leads additive) | H | 0 |
| 8 | `redact.ts` token-prefix genişletme + unit test (T4/T11) | H | yok |
| 9 | Feature flag doğrulama + contract-gate dondurma kaydı | H/G | 2-3 |
| 10 | Nightly `model-health-check` cron + `vercel.json` girişi | G | 2-3 |
| 11 | OAuth callback + Vault token saklama (güvenlik incelemesi geçtikten sonra) | E | 1, 6 |
| 12 | `outreach/gmail.ts` `sendGmailMessage` + HITL approval bağı + idempotency | E | 6, 11 |
| 13 | Suppression pre-send gate + `audit-compliance` deterministik kontrol | E | 7, 12 |
| 14 | Gönderim-sonrası thread/message kaydı + `email.sent` event | E | 12 |
| 15 | Uçtan-uca demo + kabul koşusu (aşağıda §6-8) | hepsi | 12-14 |

**Paralellik:** 2-4+10 (G) ∥ 5-8 (H) ∥ 1 (kullanıcı). 11-14 (E) hem OAuth'a hem migration'lara bağlı — sprintin ikinci yarısı.

---

## 4. Migrations (19 §1.2 kanonik — bu sprintte dokunulanlar)

| No | İçerik | Not |
|----|--------|-----|
| **046** | `email_threads` + `email_messages` + `outreach_messages` ADD `original_body`,`final_body`,`gmail_message_id`,`gmail_thread_id` + `gmail_accounts` (Vault referanslı token) | `gmail_accounts` 046-içi = 19 §5 önerisi; build alternatifi 054 |
| **047** | `suppression_list` + `consent_records` + `leads` ADD `do_not_contact`,`do_not_contact_reason`,`retention_until` | append-only consent; kalıcı retention (19 §7) |
| **052** | `tool_cost_logs` + (ops.) `ai_route_presets` settings config | Places maliyeti ilk kez ölçülür |

Ortak desen (hepsi): additive + idempotent · `BEGIN/COMMIT` · RLS + `REVOKE ALL FROM anon, authenticated` · `NOTIFY pgrst, 'reload schema'` · **App DB'ye elle SQL Editor** (programatik uygulanamıyor — mig 031/033 gerçeği). 045 (contacts) bu sprintte YOK — rol-aware taslak sonraki sprintte. Kod, migration'dan önce deploy olursa `PGRST204`/`42703` strip-retry deseniyle kırılmaz (`costLog.ts:28-32` `isMissingColumn`).

> **Doğrula-önce-uygula:** her migration öncesi canlı `list_migrations` yeniden çalıştırılır; numara çakışırsa kaydırılır (19 §1.1 build zorunluluğu).

---

## 5. Bağımlılıklar

- **Contract-gate** (04/05/06/07/16 donmuş) → tüm kod görevlerinin ön-şartı (24 §0).
- **Gmail OAuth** (görev 1, kullanıcı) → E1-E3'ün tek dış blokörü; gecikirse E shadow, A+B tam ilerler.
- **Güvenlik incelemesi** (token şeması, 19 §5) → görev 11'in ön-şartı; bağımsız context'te (rules/os/40 yüksek-risk sınıfı).
- WS-etiketleri 24'e birebir: G (AI infra) + H (platform/migrations) contract-gate ile eşzamanlı; E kritik yol.

---

## 6. Acceptance criteria (26 Senaryo 6 + Senaryo 2'nin gönderim yarısı)

1. `callWithOperation` imzası değişmedi; mevcut çağıranların hiçbiri kırılmadı (tip + davranış parity).
2. Ham model ID hiçbir çağrı-yerinde yok; her çağrı `preset_key` üzerinden.
3. Primary 404/timeout → **otomatik fallback**; `data.model` fiilen-yanıtlayan modeli gösterir; `model.fallback.used` görünür loglanır (sessiz düşüş YASAK).
4. Timeout'ta AbortController iptal + 1 retry; süresiz bekleme yok.
5. OAuth token şifreli (Vault referansı), RLS+REVOKE altında; `redact.ts` token'ı maskeler (unit yeşil).
6. Onaysız gönderim **yapısal imkânsız**: `approval_requests.status='approved'` + yürütme-anı `action_digest` eşleşmesi olmadan `sendGmailMessage` yürümez (T5).
7. Çift gönderim imkânsız: double-execute → tek `email.sent`, tek `gmail_message_id` (T6).
8. Suppress edilmiş adrese gönderim denemesi → `ok:false` bloke + audit izi (T8).
9. Feature flag'ler default OFF; yeni skill'ler `active=false` doğar.
10. LIFE DB'ye (proje `xcqrk…`) sıfır dokunuş.

---

## 7. Tests

| Test | Kapsam | Kaynak |
|---|---|---|
| preset-registry unit | her operasyon bir preset'e çözülür; Tier 3-4 → `data_collection:'deny'` (T16) | 16 §3, 21 T16 |
| fallback-self-heal | mock 404 primary → fallback yanıtı + `fallback_used:true` | 26 Senaryo 6 |
| timeout-abort | mock asılı provider → abort + retry + fallback | 16 §4.2-3 |
| imza-parity | mevcut çağıranlar (council, cold-email route, JARVIS tools) tip-değişimsiz derlenir + davranış aynı | 16 §5 |
| `eval.security.token_redaction` | `ya29.`/`1//` fixture → maskeli çıktı | 21 T4/T11 |
| `eval.outreach.send_gmail` | approval-yokken bloke · double-execute→tek gönderim · suppression-honor | 26 Senaryo 6, 21 T5/T6/T8 |
| migration smoke | deploy sonrası `get_advisors` RLS lint temiz; anon erişim reddi | 21 T10 |
| mevcut suite | tsc + lint + 490 test + build yeşil kalır (rules/os/30 minimum kapı) | repo |

---

## 8. Rollback

- **Router refactor:** tek dosya yüzeyi (`openrouter.ts` + yeni `src/lib/models/`) — git revert; ayrıca `ai_route_presets` settings-override ile deploy'suz model geri-alma.
- **Migration'lar:** hepsi additive → yeni tablo `DROP`, yeni kolonlar null-tolere (strip-retry sayesinde kod eski şemayla da çalışır).
- **Gönderim:** `send-gmail` skill `active=false` → sistem taslak-yalnız moda döner (bugünkü davranış); OAuth token satırı silinir + Google tarafında yetki iptal edilir.
- **Cron:** `vercel.json` girişi kaldırılır.

## 9. Demo (sprint kapanışı)

1. Ölü-ID operasyonu (`draft_proposal`) çalıştır → artık canlı modele düşüyor; fallback log ekranda.
2. Bir lead için mevcut cold-email taslağı → onay kartı (alıcı domain görünür) → **onayla** → mail Gmail'den gerçekten gitti; `email_messages` satırı + `email.sent` izi.
3. Aynı onayı ikinci kez yürütmeyi dene → no-op (tek gönderim kanıtı).
4. Adresi `suppression_list`'e ekle → yeni gönderim denemesi bloke + audit izi.
5. Nightly model-health-check'i manuel tetikle → drift raporu boş (tüm preset ID'leri canlı).
