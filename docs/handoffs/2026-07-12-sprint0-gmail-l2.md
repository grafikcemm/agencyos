# Handoff — AgencyOS V2 Sprint 0/1 (Model Routing + Gmail L2)

**Tarih:** 2026-07-12 · **Branch:** `feat/agencyos-v2-sprint0` (worktree: `../agency-os-v2-sprint0`) · **Base:** 66a14b1 (feat/ftg-merge)

## Goal
Sprint 0 + Sprint 1 başlangıcı (FIRST-SPRINT.md): 3 ölü model ID'sinin preset-registry ile kalıcı fixi + feature flags/redact + migration 046/047/052 + HITL Gmail L2 send çekirdeği (dry-run).

## Current Status
6 fazın 6'sı TAMAM. Gmail gönderimi DRY-RUN modda (OAuth kullanıcı tarafından yetkilendirilmedi — claude.ai connector'da da, app tarafında da yok). Push YAPILMADI (onay bekliyor).

## Completed
- **Faz 0:** Worktree + canlı doğrulamalar. OpenRouter kataloğu: 10 preset modeli PRESENT, fiyat drift YOK; 3 ölü ID ABSENT teyit. list_migrations: 045+ boştu.
- **Faz 1 (e0799ad):** `src/lib/models/{presets,registry,verify}.ts` — PRESETS katalog (16-routing §3), OPERATION_PRESET_MAP, `ai_route_presets` settings-override, drift kontrol. `openrouter.ts`: models[] self-heal, AbortController timeout, 1 retry, görünür `[model.fallback.used]` logu, provider politikası, max_price ceiling. İmzalar KIRILMADI. costLog: preset_key/fallback_used/retry_count + kademeli strip-retry (039 alanları korunur — canlıda kanıtlı). Nightly `/api/cron/model-health-check` (vercel.json `0 2 * * *`). jarvis/stream models[].
- **Faz 2 (9ccb27d):** `GMAIL_SEND_ENABLED`/`FOLLOWUP_FSM_ENABLED` (default false, yalnız 'true' açar) + `/api/flags` + Konsol "V2 Bayrakları" kartı. redact.ts: `ya29.` + `1//` token maskeleme. Yeni audit tablosu KURULMADI (run_spans+approval_requests yeterli).
- **Faz 3 (41a9513, 4d84e4c):** Migration 046 (email_threads/email_messages/outreach additive/gmail_accounts Vault-referanslı + gmail.modify CHECK-yasak), 047 (suppression_list/consent_records append-only-trigger/leads gizlilik kolonları), 047a (fn search_path), 052 (tool_cost_logs + ai_cost_logs preset kolonları). **Kullanıcı onayıyla MCP apply_migration ile CANLIYA UYGULANDI**; information_schema + get_advisors doğrulandı. Places maliyeti canlıda loglanıyor (textsearch+details satırları düştü).
- **Faz 4 (ac66e28):** `outreach/auditCompliance.ts` (deterministik: alıcı+footer+do_not_contact+suppression FAIL-CLOSED) + `outreach/gmail.ts` (TEK send fonksiyonu; digest-lock HITL; duplicate yapısal imkânsız; dry-run) + 3 API route + LeadDrawer Gmail bloğu.

## Decisions (nedenleriyle)
1. **premium-judge ceiling 28→32:** doc 16 iç çelişkisi — zincirdeki gpt-5.6-sol $30/M; ceiling "zinciri kapsayan koruma tavanı [ASSUMPTION]" tanımına göre kalibre edildi.
2. **googleapis SDK eklenmedi:** tek endpoint (messages/send) fetch ile; bağımlılık/tedarik yüzeyi küçük. OAuth sonrası REST token akışı doldurulacak (`sendViaGmailRest` iskeleti).
3. **require_parameters yalnız tools/vision isteklerinde + o durumda temperature düşülür:** canlı izole edilen kök neden — frontier modellerin endpoint'leri temperature desteklemiyor; require_parameters+temperature birlikte 404 "No endpoints found" veriyordu. §4.5'in amacı (tool/vision fallback garantisi) korunuyor.
4. **outreach onayları run_id/step_id NULL:** approval_requests FK'leri directives/agent_tasks'a bağlı; outreach-orijinli onaylar FK'siz, idempotency_key `outreach:<id>` türevli.
5. **Kademeli strip-retry (costLog):** eski davranış tüm extra'ları düşürüyordu → 052 öncesi generation_id kaybı; artık yalnız eksik kolon düşer.

## Tests Run
- tsc ✓ · vitest **555/555** ✓ (71 dosya; +60 yeni test) · next build ✓
- lint: sprint dosyaları temiz; **ÖN-MEVCUT 1 hata** `src/components/habits/HabitTracker.tsx:42` (react-hooks/refs) — dokunulmaz dosya, sprint öncesinden.
- Playwright canlı: Faz 1 (Jarvis LLM→ai_cost_logs canlı model), Faz 2 (konsol flags + 5 sayfa smoke), Faz 3 (drawer + tool_cost_logs canlı satır), Faz 4 (Senaryo 2/5/6: onay-domain-görünür → dry-run send → double no-op → suppression bloke). Ekranlar: faz1-jarvis-analiz.png, faz2-konsol-flags.png, faz4-onay-bekliyor.png, faz4-konsol-onay-karti.png, faz4-gonderildi-dryrun.png, faz4-suppression-bloke.png (ana repo `.playwright-mcp/` altında).

## Known Issues / Risks
- Gerçek Gmail gönderimi KAPALI: OAuth istemcisi yok; `sendViaGmailRest` bilinçli throw. Vault token saklama implementasyonu + bağımsız güvenlik incelemesi ŞART (19 §5).
- Test artıkları App DB'de: suppression_list'te `test-sprint0@example.com` (audit izi olarak bırakıldı); test lead'inin 2 outreach taslağı + 1 dry-run sent kaydı; lead email'i NULL'a geri alındı.
- `agencyos-memory`/judge preset'leri katalogda ama henüz hiçbir operasyon bağlanmadı (Sprint 2+).
- ai_route_presets settings-override anahtarı kodda hazır; settings satırı yok (gerekince SQL Editor).

## Not Completed (bilinçli — later)
FIRST-SPRINT out-of-scope tablosu aynen: /bugun kokpiti, rol-aware taslak (mig 045), reply ingest/follow-up FSM (Sprint 2), teklif/portfolio (Sprint 3), OAuth callback + Vault saklama (görev 11 — kullanıcı OAuth'una bağlı).

## Next Recommended Step
1. Ali Cem: Google Cloud Console'da OAuth istemcisi (`gmail.send`+`gmail.readonly`) → sonra görev 11 (callback + Vault) ayrı güvenlik-incelemeli oturum.
2. Push (onaylıysa): `git push -u origin feat/agencyos-v2-sprint0`.
3. Sprint 1 devamı: WS A (/bugun) + WS D (rol-aware taslak, mig 045).

## Continue Prompt
```
AgencyOS V2 Sprint 1 devamına başla. Worktree ../agency-os-v2-sprint0 (branch feat/agencyos-v2-sprint0, HEAD ac66e28 + handoff commit). Önce docs/handoffs/2026-07-12-sprint0-gmail-l2.md ve docs/agencyos-v2-planning/25-sprint-roadmap.md Sprint 1 bölümünü oku. Sprint 0 kapanmış durumda: preset routing canlı, mig 046/047/052 canlı App DB'de uygulanmış, Gmail send dry-run modda hazır. Sıradaki iş: [kullanıcının seçimi — OAuth+Vault (görev 11) VEYA /bugun kokpiti (WS A)]. Faz-kapı disiplini aynı: tsc+lint+vitest+build+Playwright kanıt olmadan faz kapanmaz. LIFE DB ve Görev/Alışkanlık dosyalarına dokunma.
```
