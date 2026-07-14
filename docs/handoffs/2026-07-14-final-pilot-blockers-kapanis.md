# Handoff — FINAL PILOT BLOCKERS Sprinti Kapanış (2026-07-14)

Worktree: `agency-os-v2-sprint0` · Branch: `feat/agencyos-v2-sprint0`
Base HEAD: `1d36170` → Kapanış HEAD: **`984664c`** (9 faz, 9 commit).

## Goal
FINALIZATION sonrası bağımsız audit'in 13 bulgusunu kapat: gerçek Gmail send/
reconcile, atomik OAuth/Vault, history-cursor inbound sync + sender doğrulama,
cron gerçeği, recipient/evidence enrichment, coldEmailService kapısı, Telegram
HITL parity, 30dk kokpit + gerçek health gate. Canlı migration/push/deploy/
gerçek provider YOK.

## Commits (her faz ayrı)
| Faz | Commit | Öz |
|---|---|---|
| 0 | 0b2534d | Truth gate — 13 bulgu kod+canlı-DB kanıtıyla doğrulandı |
| 1 | e43e388 | GERÇEK Gmail REST transport (users.messages.send + rfc822msgid reconcile); stub kaldırıldı; 4xx kesin / timeout-5xx belirsiz / arama-hata≠not-found; 21 contract testi |
| 2 | 147a9de | OAuth iki-scope ZORUNLU + getProfile doğrulanmış e-posta (unknown@unknown yasak) + replay-safe state (oauth_states) + 064 v3 hesaba-özgü tek-tx Vault + Settings UI |
| 3 | b239e4f | history.list cursor ingest + full-sync recovery + nested MIME + SENDER doğrulama (alakasız gönderen lead'i mutasyon EDEMEZ → quarantine) + cursor disiplini + vercel.json cron + manifest parity |
| 4 | 3ddd8b7 | recipient+evidence enrichment (HARD cap, web→Apollo, UYDURMA YOK, güven-eşikli primary/HITL, transaction dedup) + kokpit görünürlük + E2E |
| 5 | 3ba80f1 | coldEmailService doğrudan test (22) + fail-closed (settings/VoiceDNA/canonical zorunlu); eşik 90L/85B |
| 6 | 147359b | Telegram imzalı satış aksiyonları (kod'lu, TTL, digest; approve/send/proposal/reconcile; 'Onayla'≠'Gönder'; stale/replay/tampered reddi; at-most-once); LIFE 006 code kolonu |
| 7 | 28c3cde | pilot-readiness health gate (gerçek healthy) + 30dk kokpit bütçesi + Voice DNA onboarding + outcome telemetry (yetersiz-örnek dürüst) + Sprint-2 metni + legacy first_message işareti; makeConfirmCode crypto.randomInt |
| 8 | 984664c | revize paket test DB'ye KALICI + fingerprint (70 tablo) + advisors (yeni bulgu yok) + kapılar ×2 |

## Bağımsız kapı çıktıları (SON ağaç 984664c)
- `npx tsc --noEmit` ✓ · `npm run lint` **0/0** ✓
- `npm run test:coverage` **1671/1671** — TÜM eşikler (yeni kritik: gmailRestTransport,
  gmail/oauth+tokenVault+status, gmailScopes, replyIngest, gmailInboundTransport,
  cron/manifest, enrichmentOrchestrator, coldEmailService, telegram/salesActions+
  pendingActions+salesCommands, persuasion/outcomeTelemetry, cockpit/timeBudget) ≥90L/85B
- `npm run build` ✓ · `npm run test:e2e` **72/72 ×2 ardışık** (production build,
  izole test DB, RPC-required) ✓ · `git diff --check` ✓ · working tree temiz
- `npm audit --omit=dev`: **2 moderate AÇIK** (next vendored postcss; --force yasak)

## Migration durumu (dürüst)
- **YALNIZ izole test DB'de (KALICI):** 058, 059 v2, 060, 061 v3, 062 v2, 063,
  **064 v3** (hesaba-özgü Vault + oauth_states + quarantine), **LIFE 006 + code**.
- **CANLIDA:** yalnız eski 005-LIFE/045/057. **Paket canlıya UYGULANMADI.**
  Onay: **"Revize 058 059 060 061 062 063 064 ve LIFE 006 onaylı."**
  Paket: docs/migration-approval-package-2026-07-14-v2.md.
- SIRA: LIFE 006 canlıya alınmadan deploy+webhook YAPILMAMALI.

## Gerçek provider durumu (dürüst)
- Gmail/Telegram GERÇEK provider ÇALIŞTIRILMADI. Send GERÇEK KOD ama dry-run;
  inbound fake transport. 'Gerçek provider ile kanıtlı' etiketi YOK.
- Kullanıcı aksiyonları (kod hazır): Google OAuth client + Vercel env; DNS SPF/
  DKIM/DMARC; KVKK/İYS; bağımsız güvenlik incelemesi (id_token JWKS — getProfile
  ile ARTIK gereksiz ama consent akışı incelensin); ayrı onaylar GMAIL_INGEST_
  ENABLED → gözlem → GMAIL_SEND_ENABLED pilot.

## 'PARA KAZANMAYA HAZIR' — DENMİYOR
Gerçek gönderim + gerçek cevap + ölçülmüş funnel yok. Doğru etiket:
**dış-konfig bekleyen, gerçek-şemada E2E-kanıtlı, dry-run altyapısı TAM
supervised-pilot adayı.** Faz 1-7 tüm 13 audit bulgusunu kapattı; kalan yol
kullanıcı-aksiyonlu dış konfig + onaylı canlı geçiş.

## Continue Prompt
"agency-os-v2-sprint0, branch feat/agencyos-v2-sprint0, HEAD 984664c.
docs/handoffs/2026-07-14-final-pilot-blockers-kapanis.md + .claude-resume.md +
docs/migration-approval-package-2026-07-14-v2.md oku. Onay cümlesi ('Revize 058
059 060 061 062 063 064 ve LIFE 006 onaylı') gelirse paketi v2 dokümandaki sırayla
CANLIYA uygula (LIFE 006 önce, fingerprint doğrulaması + advisors + kapılar ×2 +
commit). Kullanıcı push→Promote→LIFE→webhook sonrası 'doğrula' derse gerçek-inbound
doğrulamasını koş. Pazarlıksız sınırlar aynen: onaysız push/deploy/canlı migration/
webhook/gerçek send YOK; GMAIL_SEND_ENABLED=false; GMAIL_INGEST production'da açık değil."
