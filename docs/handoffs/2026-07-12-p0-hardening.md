# Handoff — AgencyOS V2 P0/P1 Sertleştirme Sprinti (Audit Düzeltmeleri)

**Tarih:** 2026-07-12 · **Branch:** `feat/agencyos-v2-sprint0` (worktree `../agency-os-v2-sprint0`) · **Base:** 3c5de92 (Sprint 0/1 kapanışı) · **HEAD:** 56973b5 (bu handoff commit'i dahil sprint kapanışı) · **PUSH: YAPILMADI (kullanıcı kararı: bekle)**

## Goal
Bağımsız audit'in 7 bulgusu: P0 auth açığı + yarışa-açık Gmail idempotency + manuel send bypass + eksik routing merkezileştirme + scope allowlist + E2E/kalite eksikleri.

## Commits (bu sprint)
| Faz | Commit | İçerik |
|---|---|---|
| 1 | 6df511b | Fail-closed operatör auth (session restore + LOCAL_OPERATOR_MODE yalnız dev + Bearer) + parseJsonBody Zod/100KB |
| 2 | 6172f75 | mig 054: outreach_send_attempts atomik claim + CAS + finalize RPC; sendMachine.ts; transport adapter; reconciliation; 9 yarış testi |
| 3 | 6a3f32b | markMessageSent email kanalını REDDEDER (422) — tek yürütme yolu state machine |
| 4 | aa0b7a0 | mig 055: pozitif scope allowlist + active⇒vault + tek-aktif-hesap; checkGrantedScopes; doc 32 OAuth/Vault tasarımı |
| 5 | f27c272 | assistant/llm + ai/gateway → preset registry (assistant_chat); OPENROUTER_MODEL runtime'dan kalktı; callAgentModel doğrulama+fallback; fetchLiveCatalog timeout; 'yasaklı legacy ID' yeniden adlandırma |
| 6 | 8d2d506, 4a3594e, f8ed132, 2ff8e05 | lint 0/0 (HabitTracker ref fix davranış-korumalı) · Next 16.2.10 + audit fix + shadcn devDeps + tailwind .mts · coverage eşikleri + 54 test · Playwright 15-test E2E suite |
| 7 | 240efc8 | docs 33: Sprint 1-3 gelir roadmap (kokpit/rol-aware/reply-FSM/teklif/analitik) |

## Kapanış kriterleri durumu
- tsc ✓ · lint **0 error / 0 warning** ✓ · vitest **673/673** ✓ · coverage eşikleri (gmail 94.9/85.7, auditCompliance 98/87, sendMachine 95.9/82.9, models 91+, toolCostLog 100) ✓ · build ✓ (MODULE_TYPELESS uyarısı çözüldü) · **Playwright 15/15** (prod build; 2 ardışık koşu) ✓
- Yetkisiz API 401 ✓ (E2E) · Promise.all çift send → provider TAM 1 ✓ (unit+E2E) · provider-success/DB-failure retry → 0 ek çağrı ✓ (unit) · manuel email bypass imkânsız ✓ (unit+E2E) · scopes pozitif allowlist ✓ (mig 055 canlı+SQL doğrulama) · anon DB reddi ✓ (RLS+REVOKE deseni) · advisors: YENİ WARN/ERROR yok — security'de tek WARN `update_updated_at` search_path (pre-existing), performance'ta tek WARN `settings` duplicate-index {settings_key_key, settings_key_unique} (pre-existing) · gerçek Gmail hâlâ OAuth+güvenlik incelemesi arkasında ✓ · LIFE DB sıfır dokunuş ✓ · prod DB'de test artığı SIFIR (SQL ile doğrulandı) ✓

## Canlıya uygulananlar (kullanıcı onayıyla, MCP)
mig **054** + **055** App DB'de (dfedeh…); information_schema + get_advisors doğrulandı; eski negatif `gmail_accounts_scope_guard` kaldırıldı.

## Kararlar
1. **Auth = eski HMAC oturum kodunun restorasyonu** (66a14b1'de silinmişti) + LOCAL_OPERATOR_MODE yalnız NODE_ENV≠production — E2E prod-modda flag açıkken 401'leri kanıtlıyor.
2. **At-most-once = UNIQUE INSERT claim + CAS + tek-transaction finalize RPC**; belirsiz hata → 'unknown' + kör-retry yasak; deterministik `Message-ID` reconciliation ankrajı.
3. **Kalan 2 moderate npm audit**: postcss <8.5.10 Next'in vendored bağımlılığı — `--force` Next 9.3.3'e düşürdüğünden KULLANILMADI (bilinçli kabul, upstream).
4. **AI_GATEWAY_ENABLED artık no-op (hep açık)**: asistan yolu her zaman preset+cost-log korumalı gateway'den.
5. **'Ölü model' → 'yasaklı legacy ID'**: 2026-07-12 katalogda gemini-2.5-flash-lite + deepseek-v4-pro yeniden görünüyor (haiku-4-5 yok); yasak politika, 'kalıcı absent' iddiası değil.
6. **e2e cleanup approval'ları redacted_preview iziyle siler** (idempotency_key hash olduğu için).

## Bilinen sınırlar / riskler
- Gerçek Gmail: OAuth (görev 11, doc 32) + bağımsız güvenlik incelemesi ŞART; `GMAIL_SEND_ENABLED=false`.
- Deploy öncesi Vercel env: `APP_PASSWORD` + `APP_SESSION_SECRET` girilmeli — yoksa app fail-closed KİLİTLİ (bilinçli). Opsiyonel `OPERATOR_API_TOKEN`.
- Lead drawer derin UI etkileşimi E2E'de yok (konsol onay akışı VAR); Sprint 1 kokpit E2E'siyle genişler.
- suppression_list'te eski oturumun `test-sprint0@example.com` izi duruyor (bilinçli audit izi).

## Next
1. Push (kullanıcı isteyince): `git push -u origin feat/agencyos-v2-sprint0`.
2. Görev 11: OAuth+Vault implementasyonu (doc 32 planına göre, ayrı güvenlik-incelemeli oturum).
3. Sprint 1: doc 33 §1A /bugun kokpiti + §1B rol-aware (mig 045).

## Continue Prompt
```
AgencyOS V2 Sprint 1'e başla. Worktree ../agency-os-v2-sprint0 (feat/agencyos-v2-sprint0, HEAD 2ff8e05). Önce docs/handoffs/2026-07-12-p0-hardening.md ve docs/agencyos-v2-planning/33-revenue-roadmap-sprint1-3.md §Sprint1 oku. P0 sertleştirme kapalı: fail-closed auth canlı (Vercel env gerekir), at-most-once send machine mig 054/055 ile canlı, E2E 15/15. İş: [1A /bugun kokpiti VEYA görev 11 OAuth+Vault]. Kapı disiplini: tsc+lint(0/0)+vitest(eşikli)+build+Playwright. LIFE DB dokunulmaz; migration onaylı; gerçek Gmail kapalı.
```
